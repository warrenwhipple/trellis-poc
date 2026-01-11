# Terminal Runtime Abstraction (Daemon vs In-Process)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md`, `apps/desktop/AGENTS.md`, and the ExecPlan template in `.agents/commands/create-plan.md`.


## Table of Contents

- [Purpose / Big Picture](#purpose--big-picture)
- [Context / Orientation (Repository Map)](#context--orientation-repository-map)
- [Problem Statement](#problem-statement)
- [Definitions (Plain Language)](#definitions-plain-language)
- [Non-Goals](#non-goals)
- [Assumptions](#assumptions)
- [Future Backend: Remote Runner / Cloud Terminals](#future-backend-remote-runner--cloud-terminals)
- [Open Questions](#open-questions)
- [Plan of Work](#plan-of-work)
- [Target Shape (After Refactor)](#target-shape-after-refactor)
  - [File Tree (Proposed)](#file-tree-proposed)
  - [Terminal Runtime Types (Main Process)](#terminal-runtime-types-main-process)
  - [tRPC Router Shape (No Daemon Type Checks)](#trpc-router-shape-no-daemon-type-checks)
  - [Renderer Decomposition (Reducing `Terminal.tsx` Branching)](#renderer-decomposition-reducing-terminaltsx-branching)
  - [Diagrams (Call Flow)](#diagrams-call-flow)
- [Milestones](#milestone-1-establish-a-backend-contract-and-invariants)
  - [Milestone 1](#milestone-1-establish-a-backend-contract-and-invariants)
  - [Milestone 2](#milestone-2-implement-terminalruntime-registry--capabilities)
  - [Milestone 3](#milestone-3-migrate-trpc-terminal-router-to-the-runtime)
  - [Milestone 4](#milestone-4-add-regression-coverage-for-the-abstraction-boundary)
  - [Milestone 5](#milestone-5-manual-verification-high-coverage-low-surprises)
  - [Milestone 6a](#milestone-6a-build-a-terminal-init-plan-renderer)
  - [Milestone 6b](#milestone-6b-stream-subscription--buffering-hook-renderer)
  - [Milestone 6c](#milestone-6c-integrate-helpers-into-terminaltsx-ui-wiring-only)
  - [Milestone 7 (Cloud Readiness)](#milestone-7-cloud-readiness-introduce-backendsessionid)
- [Validation](#validation)
- [Idempotence / Safety](#idempotence--safety)
- [Risks and Mitigations](#risks-and-mitigations)
- [Progress](#progress)
- [Surprises & Discoveries](#surprises--discoveries)
- [Decision Log](#decision-log)
- [Outcomes & Retrospective](#outcomes--retrospective)


## Purpose / Big Picture

After this change, the desktop app still supports terminal persistence (daemon mode with cold restore) exactly as it does today, but the codebase no longer leaks “daemon vs in-process” branching across the tRPC router and UI. Backend selection becomes a single responsibility owned by `apps/desktop/src/main/lib/terminal/`.

This plan also tightens the abstraction so it can become the **local implementation of a workspace-scoped “provider”** later (cloud/SSH/remote runners), without re-introducing backend branching across the application.

Observable outcomes:

1. With terminal persistence disabled, terminals behave as before (no persistence across app restarts), and Settings → Terminal “Manage sessions” shows that session management is unavailable.
2. With terminal persistence enabled, terminals survive app restarts, cold restore works, and Settings → Terminal “Manage sessions” continues to list/kill sessions.
3. The tRPC `terminal.*` router no longer needs `instanceof DaemonTerminalManager` checks; daemon awareness is centralized in the terminal runtime layer.
4. The renderer terminal component remains correct but is easier to reason about because backend-agnostic “session initialization” and “stream event handling” logic is extracted into small, testable helpers rather than being interleaved with UI rendering.


## Context / Orientation (Repository Map)

Superset Desktop is an Electron app. In this repo:

1. “Main process” code runs in Node.js and can import Node modules. It lives under `apps/desktop/src/main/`.
2. “Renderer” code runs in a browser-like environment and must not import Node modules. It lives under `apps/desktop/src/renderer/`.
3. IPC between renderer and main is implemented using tRPC (“tRPC router” code lives under `apps/desktop/src/lib/trpc/routers/`). Subscriptions in this repo must use the `observable` pattern (`apps/desktop/AGENTS.md`), not async generators.

The terminal system currently has two possible backends:

1. In-process backend: `apps/desktop/src/main/lib/terminal/manager.ts` (`TerminalManager`). This owns PTYs directly in the Electron main process.
2. Daemon backend: `apps/desktop/src/main/lib/terminal/daemon-manager.ts` (`DaemonTerminalManager`). This delegates PTY ownership to a background “terminal host” process and communicates via a client (`apps/desktop/src/main/lib/terminal-host/client.ts`) over a Unix domain socket.

Terminal APIs exposed to the renderer are implemented in `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`.


## Problem Statement

The daemon persistence feature is working, but the PR is hard to review and maintain because “daemon vs non-daemon” concerns appear outside the terminal subsystem boundary. Examples include `instanceof DaemonTerminalManager` checks in the tRPC router and UI code paths that must reason about backend-specific behavior.

This plan refactors the code so backend selection and backend-specific capabilities live behind a single “terminal runtime” abstraction, while preserving current behavior and test coverage. This also positions us for a future backend that executes terminals in the cloud, without re-spreading backend-specific branching throughout the application.


## Definitions (Plain Language)

Pane ID (`paneId`): a stable identifier for a terminal pane in the renderer’s tab layout. Today it is also used as the backend session key, but the refactor should avoid assuming `paneId === backendSessionId` forever (cloud terminals will likely need a distinct backend identity).

Backend session ID (`backendSessionId`): an identifier assigned by the backend for the running session. For local backends, this may continue to equal `paneId`, but future backends (cloud/multi-device) should be free to assign their own IDs and map multiple panes/clients to the same backend session.

Terminal session: the running PTY process and its terminal emulator state.

Warm attach: reconnecting to a still-running session (daemon still has the PTY).

Cold restore: restoring scrollback from disk after an unclean shutdown or daemon session loss, before starting a new shell.

Terminal runtime: a backend-agnostic surface (sessions/workspaces/events + capabilities) that callers use without knowing the implementation (local in-process, local daemon, cloud/SSH later).

Terminal runtime registry: a process-scoped module in `apps/desktop/src/main/lib/terminal/` that selects the correct runtime for a given workspace/session and ensures runtimes are cached so we don’t multiply event listeners or backend connections.

Capabilities: optional features that exist only for some backends (for example “list/manage persistent sessions”). Callers should not use `instanceof` checks. Capability presence must be represented structurally (for example `management: null` when unavailable) and via explicit capability flags, so “unsupported” cannot be confused with “success”.

Workspace provider / runtime: a workspace-scoped backend boundary that can supply terminal IO, agent lifecycle events, and “changes/files” operations for either local worktrees or cloud workspaces. This plan focuses on the terminal portion, but the boundary should be compatible with being embedded in a provider later.


## Non-Goals

This refactor is intentionally conservative to avoid regressions:

1. No protocol redesign between main and terminal-host.
2. No behavioral change to cold restore, attach scheduling, warm set mounting, or stream lifecycle.
3. No implementation of cloud terminals in this PR. The plan only ensures the abstraction boundary is compatible with adding a cloud backend later.


## Assumptions

1. Windows is not a supported desktop target right now, so Unix-domain socket constraints are acceptable.
2. The terminal persistence setting (`settings.terminalPersistence`) is treated as “requires restart” today; we keep that behavior for this refactor.
3. tRPC subscriptions must use `observable` (per `apps/desktop/AGENTS.md`); we will not introduce generator-based subscriptions.
4. The most important regression to prevent is the “listeners=0” cold-restore failure mode; specifically, the `terminal.stream` subscription must not complete on exit.


## Future Backend: Remote Runner / Cloud Terminals

This plan intentionally does not implement cloud terminals, but the abstraction boundary should be compatible with adding a backend that runs terminal sessions inside a remote “runner” (a background agent on a server) while preserving Superset Desktop concepts like worktrees, “changes” (diff/status), and agent lifecycle indicators.

### Direction for this rewrite (so we don’t paint ourselves into a corner)

The cloud workspace plan (`docs/CLOUD_WORKSPACE_PLAN.md`) makes a few things explicit: multi-device access, cloud as source-of-truth, SSH terminals, tmux persistence, and optional local sync for IDE users. To align with that direction, this rewrite should:

1. Avoid a process-global “one runtime forever” assumption. Instead, capture a stable **registry** once, and select the appropriate runtime/provider per workspace or per session.
2. Treat backend session identity as separate from UI pane identity. Even if local stays `backendSessionId === paneId` initially, the contract should not assume it forever.
3. Avoid “daemon” naming at the abstraction boundary. Daemon is an implementation detail; cloud/SSH is another. Prefer provider-neutral naming (e.g. “management/admin capability object”).
4. Keep renderer behavior stable. Any `Terminal.tsx` work should be decomposition-only (init plan + applier + stream buffering), preserving the same attach/detach semantics and invariants (no-complete-on-exit, scroll restoration).

### What’s local-only today (current coupling)

1. **Terminal IO keys by `paneId` (client identity):** `terminal.createOrAttach`, `terminal.write`, and `terminal.stream` treat `paneId` as the stable session key (`apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`).
2. **Agent lifecycle events assume localhost hooks:** terminal env injects `SUPERSET_*` and `SUPERSET_PORT` (`apps/desktop/src/main/lib/terminal/env.ts`), and the notify hook script `curl`s `http://127.0.0.1:$SUPERSET_PORT/hook/complete` (`apps/desktop/src/main/lib/agent-setup/templates/notify-hook.template.sh`). This cannot work from a remote runner.
3. **“Changes” assumes local worktree filesystem:** git status/diff/staging/commit/push/pull operate against a local `worktreePath` using `simple-git`, and file reads/writes are guarded by secure path validation (`apps/desktop/src/lib/trpc/routers/changes/*`).

### How this plan enables remote terminals (what’s already aligned)

1. **Backend-agnostic event delivery:** `TerminalEventSource.subscribe…() => unsubscribe` is compatible with WebSocket/SSE backends and avoids leaking Node `EventEmitter` semantics.
2. **Capabilities over “mode strings”:** cloud backends can expose a capability surface without introducing a new `"cloud"` mode string that bleeds into callers.
3. **Identity decoupling is planned:** Milestone 7 (cloud readiness) introduces `backendSessionId`, which is required for cloud (server-assigned IDs, multi-device access).

### The key realization: cloud terminals need a Workspace Runtime, not just a Terminal Runtime

A remote runner cannot be “just a terminal backend” if we want to preserve the current UX. To retain worktrees, diffs, and agent status, the system needs a workspace-scoped runtime with at least these responsibilities:

1. **terminal:** interactive PTY sessions (create/attach/write/resize/kill/detach + stream events)
2. **agentEvents:** lifecycle signals (“Start/Stop/PermissionRequest”) delivered to the desktop UI
3. **git + files:** status/diff/staging/commit/push/pull + safe file read/write (or an explicit sync layer)
4. **sync (if local stays canonical):** bidirectional worktree synchronization when execution happens remotely

The `TerminalRuntime` abstraction created in this plan should become one *component* of a broader “WorkspaceRuntime” concept as cloud work gets closer.

### Preserving “agent interactions” in a remote runner world

Today, pane statuses are driven by the notifications subscription (`apps/desktop/src/renderer/stores/tabs/useAgentHookListener.ts`), which consumes events emitted by a local notifications server (`apps/desktop/src/main/lib/notifications/server.ts`). For remote execution, we need a different source of lifecycle signals:

- **Hook proxy model (max compatibility):** keep the same CLI hook scripts, but point them to a hook receiver running inside the runner; the runner forwards lifecycle events to the desktop over an authenticated channel (then desktop re-emits to the renderer through the existing notifications subscription path).
- **Native runner events (long-term):** the runner emits lifecycle events directly (no `curl` hook required), still flowing into the same renderer contract (`NOTIFICATION_EVENTS.AGENT_LIFECYCLE`).

### “Changes” + worktrees: two viable architectures (must decide)

**A) Remote worktree is source-of-truth**
- Runner owns checkout, git operations, and file access.
- Desktop “changes” router becomes a façade that delegates to local or remote implementations.
- Tradeoff: “open in editor” and local tooling become harder unless we introduce a local mirror/remote FS integration.

**B) Local worktree is source-of-truth (desktop remains canonical)**
- Keep existing local worktrees and “changes” behavior.
- Runner is compute-only and requires explicit sync (local → remote before execution; remote → local after).
- Tradeoff: requires a real sync protocol (patch-based or git-based), conflict handling, and clear UX around divergence.

This decision materially changes the scope and correctness model of cloud terminals; we should not start implementing a cloud backend until this is chosen.

### Compatibility notes (naming + semantics)

1. This plan uses a **provider-neutral** capability object (`management: TerminalManagement | null`). In local persistence mode, the implementation is backed by the daemon manager, but callers should not depend on “daemon” as a concept.
2. Capability presence should mean “configured/available”, not “healthy right now”; mid-session disconnects should surface errors + explicit connection lifecycle events rather than silently flipping capabilities at runtime.


## Open Questions

1. Naming: should the main-process entry point be `getTerminalRuntimeRegistry()` (terminal-only) or `getWorkspaceProviderRegistry()` (terminal + future agentEvents/changes/files)? (This plan assumes `getTerminalRuntimeRegistry()` now, and we can later embed it inside a workspace provider registry without changing the router/UI contracts.)
2. Should we keep the existing tRPC endpoint names (`terminal.listDaemonSessions`, `terminal.killAllDaemonSessions`, etc.) for backwards compatibility in the renderer? (This plan assumes “yes” to minimize churn and risk.)
3. Provider selection: how do we decide whether a workspace uses the local terminal runtime vs a cloud/SSH runtime? (Expected: based on workspace metadata such as `cloudWorkspaceId` / workspace type, not on UI state.)


## Plan of Work

This work is a refactor, so milestones are organized to keep behavior stable and to validate frequently.


## Target Shape (After Refactor)

This section is illustrative. It shows the intended file layout, key types, and call flows after the refactor. It is not a full implementation, but it should be concrete enough that a new contributor can “see” how responsibilities move out of the tRPC router and out of `Terminal.tsx`.


### File Tree (Proposed)

    apps/desktop/src/main/lib/terminal/
      index.ts                         # exports getTerminalRuntimeRegistry()
      runtime-registry.ts               # per-workspace selection + caching (process-scoped registry)
      runtime.ts                        # TerminalRuntime adapters/types (backend-agnostic surface)
      manager.ts                        # in-process backend (existing)
      daemon-manager.ts                 # daemon backend (existing)
      types.ts                          # existing shared terminal types (CreateSessionParams, SessionResult, events)

    apps/desktop/src/lib/trpc/routers/terminal/
      terminal.ts                       # uses getTerminalRuntimeRegistry(); no instanceof checks
      terminal.stream.test.ts           # stream invariants (exit does not complete)

    apps/desktop/src/renderer/.../Terminal/
      Terminal.tsx                      # UI wiring, minimal branching
      init-plan.ts                      # buildTerminalInitPlan(result) -> TerminalInitPlan
      apply-init-plan.ts                # applyTerminalInitPlan({ xterm, plan, ... })
      useTerminalStream.ts              # buffering + flush until ready (no UI)
      types.ts                          # TerminalInitPlan + stream event types (renderer-only)
      hooks/
        useTerminalConnection.ts         # tRPC mutations (existing)


### Terminal Runtime Types (Main Process)

The goal is to stop encoding backend choice as a “mode string” that callers branch on. Callers should see capabilities and nullable management objects instead.

    export interface TerminalCapabilities {
      /** Sessions can survive app restarts */
      persistent: boolean;
      /** Backend supports cold restore (disk-backed or otherwise) */
      coldRestore: boolean;
      /** Sessions can be managed remotely (future: cloud terminals) */
      remoteManagement: boolean;
    }

    export interface TerminalSessionOperations {
      // Core lifecycle (normalized to async, even if an implementation is sync today)
      createOrAttach(params: CreateSessionParams): Promise<SessionResult>;
      write(params: { paneId: string; data: string }): Promise<void>;
      resize(params: { paneId: string; cols: number; rows: number; seq?: number }): Promise<void>;
      signal(params: { paneId: string; signal?: string }): Promise<void>;
      kill(params: { paneId: string }): Promise<void>;
      detach(params: { paneId: string; viewportY?: number }): Promise<void>;
      clearScrollback(params: { paneId: string }): Promise<void>;
      ackColdRestore(params: { paneId: string }): Promise<void>;
    }

    export interface TerminalWorkspaceOperations {
      killByWorkspaceId(workspaceId: string): Promise<{ killed: number; failed: number }>;
      getSessionCountByWorkspaceId(workspaceId: string): Promise<number>;
      refreshPromptsForWorkspace(workspaceId: string): Promise<void>;
    }

    export type TerminalPaneEvent =
      | { type: "data"; data: string }
      | { type: "exit"; exitCode: number; signal?: number }
      | { type: "disconnect"; reason: string }
      | { type: "error"; error: string; code?: string };

    export interface TerminalEventSource {
      // Backend-agnostic event subscription API (do not expose Node EventEmitter semantics)
      subscribePane(params: {
        paneId: string;
        onEvent: (event: TerminalPaneEvent) => void;
      }): () => void;

      // Low-volume lifecycle events used for correctness when panes are unmounted.
      subscribeTerminalExit(params: {
        onExit: (event: { paneId: string; exitCode: number; signal?: number }) => void;
      }): () => void;
    }

    export interface TerminalManagement {
      listSessions(): Promise<ListSessionsResponse>;
      forceKillAll(): Promise<void>;
      resetHistoryPersistence(): Promise<void>;
    }

    export interface TerminalRuntimeRegistry {
      // Runtime selection should be workspace-scoped (local vs cloud later).
      getForWorkspaceId(workspaceId: string): TerminalRuntime;
      // Transitional: allow lookups by pane until backendSessionId is fully introduced.
      getForPaneId(paneId: string): TerminalRuntime;
      // For legacy/global endpoints that aren't workspace-scoped yet.
      getDefault(): TerminalRuntime;
    }

    export interface TerminalRuntime {
      sessions: TerminalSessionOperations;
      workspaces: TerminalWorkspaceOperations;
      events: TerminalEventSource;
      management: TerminalManagement | null;
      capabilities: TerminalCapabilities;
    }

`getTerminalRuntimeRegistry()` must return the same registry instance across the process lifetime, and the registry must return stable runtime objects (at least stable `events`/listener wiring) so we do not multiply event listeners or backend connections.

    let cachedRegistry: TerminalRuntimeRegistry | null = null;
    const paneToRuntime = new Map<string, TerminalRuntime>();
    // Implementation detail: keep this mapping updated from createOrAttach/detach/kill
    // so `getForPaneId()` can route stream subscriptions correctly until backendSessionId.

    export function getTerminalRuntimeRegistry(): TerminalRuntimeRegistry {
      if (cachedRegistry) return cachedRegistry;

      const backend = getActiveTerminalManager(); // existing selection logic (cached by “requires restart”)
      const daemonManager = backend instanceof DaemonTerminalManager ? backend : null;

      const localRuntime: TerminalRuntime = {
        sessions: {
          createOrAttach: (params) => backend.createOrAttach(params),
          write: async (params) => backend.write(params),
          resize: async (params) => backend.resize(params),
          signal: async (params) => backend.signal(params),
          kill: (params) => backend.kill(params),
          detach: async (params) => backend.detach(params),
          clearScrollback: async (params) => backend.clearScrollback(params),
          ackColdRestore: async (params) => backend.ackColdRestore(params.paneId),
        },
        workspaces: {
          killByWorkspaceId: (workspaceId) => backend.killByWorkspaceId(workspaceId),
          getSessionCountByWorkspaceId: (workspaceId) =>
            backend.getSessionCountByWorkspaceId(workspaceId),
          refreshPromptsForWorkspace: async (workspaceId) =>
            backend.refreshPromptsForWorkspace(workspaceId),
        },
        events: {
          subscribePane: ({ paneId, onEvent }) => {
            const onData = (data: string) => onEvent({ type: "data", data });
            const onExit = (exitCode: number, signal?: number) =>
              onEvent({ type: "exit", exitCode, signal });
            const onDisconnect = (reason: string) =>
              onEvent({ type: "disconnect", reason });
            const onError = (payload: { error: string; code?: string }) =>
              onEvent({ type: "error", error: payload.error, code: payload.code });

            backend.on(`data:${paneId}`, onData);
            backend.on(`exit:${paneId}`, onExit);
            backend.on(`disconnect:${paneId}`, onDisconnect);
            backend.on(`error:${paneId}`, onError);

            return () => {
              backend.off(`data:${paneId}`, onData);
              backend.off(`exit:${paneId}`, onExit);
              backend.off(`disconnect:${paneId}`, onDisconnect);
              backend.off(`error:${paneId}`, onError);
            };
          },
          subscribeTerminalExit: ({ onExit }) => {
            backend.on("terminalExit", onExit);
            return () => backend.off("terminalExit", onExit);
          },
        },
        management: daemonManager
          ? {
              listSessions: () => daemonManager.listDaemonSessions(),
              forceKillAll: () => daemonManager.forceKillAll(),
              resetHistoryPersistence: () =>
                daemonManager.resetHistoryPersistence(),
            }
          : null,
        capabilities: {
          persistent: daemonManager !== null,
          coldRestore: daemonManager !== null,
          remoteManagement: false,
        },
      };

      cachedRegistry = {
        getForWorkspaceId: (_workspaceId) => {
          // Today: all workspaces use the local runtime. Future: cloud/SSH selection here.
          return localRuntime;
        },
        getForPaneId: (paneId) => paneToRuntime.get(paneId) ?? localRuntime,
        getDefault: () => localRuntime,
      };

      return cachedRegistry;
    }

Notes:

1. The `backend instanceof DaemonTerminalManager` check is allowed here because this module is the only backend-selection boundary; the tRPC router and UI must not need it.
2. If management capability exists but a call fails (daemon unreachable, request fails), we propagate the error. We do not convert failures into “persistence disabled” states.
3. `runtime.management !== null` indicates the persistent backend is configured/active, not that it is healthy “right now”. If the daemon process crashes or the socket drops mid-session, operations may throw and the backend emits existing per-pane `disconnect:*` / `error:*` events. The runtime does not dynamically flip `management` to `null`.


### tRPC Router Shape (No Daemon Type Checks)

The terminal router captures the **runtime registry** once when the router is created. Each procedure then selects the correct runtime (local vs cloud later) without using `instanceof` checks.

Key rule: capture the registry once, but do not assume there is only one runtime for the entire process forever.

    export const createTerminalRouter = () => {
      const registry = getTerminalRuntimeRegistry();

      return router({
        createOrAttach: publicProcedure
          .input(...)
          .mutation(async ({ input }) =>
            registry.getForWorkspaceId(input.workspaceId).sessions.createOrAttach(input),
          ),

        stream: publicProcedure
          .input(z.string())
          .subscription(({ input: paneId }) =>
            observable<TerminalPaneEvent>((emit) => {
              // IMPORTANT: do not complete on exit.
              // Exit is a state transition and must not terminate the subscription.
              const runtime = registry.getForPaneId(paneId);
              return runtime.events.subscribePane({
                paneId,
                onEvent: (event) => emit.next(event),
              });
            }),
          ),

        listDaemonSessions: publicProcedure.query(async () => {
          // Note: endpoint name kept for backwards compatibility; capability is provider-neutral.
          const runtime = registry.getDefault();
          if (!runtime.management) return { daemonModeEnabled: false, sessions: [] };
          const response = await runtime.management.listSessions();
          return { daemonModeEnabled: true, sessions: response.sessions };
        }),
      });
    };


### Renderer Decomposition (Reducing `Terminal.tsx` Branching)

The renderer still needs to implement UI behaviors (cold restore overlay, retry overlay, focus, hotkeys), but it should not be the place where we interleave protocol concerns and restoration sequencing. The refactor decomposes the terminal renderer into three small helpers and keeps `Terminal.tsx` as wiring.

`init-plan.ts` (pure adapter):

    export interface TerminalInitPlan {
      initialAnsi: string;
      rehydrateSequences: string;
      cwd: string | null;
      modes: { alternateScreen: boolean; bracketedPaste: boolean };
      restoreStrategy: "altScreenRedraw" | "snapshotReplay";
      isColdRestore: boolean;
      previousCwd: string | null;
      /** Used to restore scroll position on reattach (see upstream PR #698) */
      viewportY?: number;
    }

    // `CreateOrAttachOutput` here refers to the renderer-visible shape returned by
    // `trpc.terminal.createOrAttach` (which includes `snapshot` and/or `scrollback`).
    export function buildTerminalInitPlan(result: CreateOrAttachOutput): TerminalInitPlan {
      const initialAnsi = result.snapshot?.snapshotAnsi ?? result.scrollback ?? "";
      const viewportY = result.viewportY;
      ...
      return { ..., viewportY };
    }

`apply-init-plan.ts` (ordering guarantees):

    export async function applyTerminalInitPlan(params: {
      xterm: Terminal;
      fitAddon: FitAddon;
      plan: TerminalInitPlan;
      onReady: () => void; // marks stream ready + flushes pending events
    }): Promise<void> {
      // apply rehydrate → apply snapshot → then onReady
      // if altScreenRedraw: enter alt screen, then trigger redraw, then onReady
      // if plan.viewportY is set, restore scroll position after initial content is applied
    }

`useTerminalStream.ts` (buffering until ready):

    export function useTerminalStream(params: {
      paneId: string;
      onEvent: (event: TerminalStreamEvent) => void;
      isReady: () => boolean;
      onBufferFlush: (events: TerminalStreamEvent[]) => void;
    }) {
      // subscribe via trpc.terminal.stream.useSubscription
      // queue events while !isReady(), then flush deterministically when ready
    }

`Terminal.tsx` becomes composition:

    const plan = buildTerminalInitPlan(result);
    await applyTerminalInitPlan({ xterm, fitAddon, plan, onReady: () => setStreamReady(true) });

The critical invariants remain unchanged:

1. The stream subscription does not complete on exit.
2. Events arriving “too early” are buffered until restore is finished.
3. Cold restore remains read-only until Start Shell is clicked, and stale queued events are dropped before starting a new session (prevents “exit clears UI” regressions).
4. Reattaching restores the previous scroll position (`viewportY`) when available (upstream main behavior; see PR #698).


### Diagrams (Call Flow)

Main call flow (today and after refactor; the difference is where switching happens):

    Renderer (Terminal.tsx + helpers)
      |
      | trpc.terminal.createOrAttach / trpc.terminal.stream
      v
    Electron Main (tRPC router)
      |
      | getTerminalRuntimeRegistry().getForWorkspaceId(...)  (no backend checks in router)
      v
    Terminal Backend (in-process OR daemon-manager)
      |
      | (daemon only) TerminalHostClient over unix socket
      v
    Terminal Host Daemon  --->  PTY subprocess per session

Renderer composition after Milestone 6c:

    Terminal.tsx
      ├─ useTerminalConnection()      (tRPC mutations)
      ├─ useTerminalStream()          (buffer until ready; never completes on exit)
      ├─ buildTerminalInitPlan()      (normalize snapshot vs scrollback, decide restore strategy)
      └─ applyTerminalInitPlan()      (rehydrate → snapshot or alt-screen redraw → mark ready)


### Milestone 1: Establish a Backend Contract and Invariants

This milestone documents and codifies the contract we must preserve during the refactor. At completion, a reader can point to a single place in the codebase that defines “what the terminal backend must do”, and a single set of invariants that all implementations must satisfy.

Scope:

1. Identify the backend API surface currently used by callers outside `apps/desktop/src/main/lib/terminal/` by searching for usages of:
   - `getActiveTerminalManager()`
   - events `data:${paneId}`, `exit:${paneId}`, `disconnect:${paneId}`, `error:${paneId}`, and `terminalExit`
2. Write an explicit “terminal backend contract” type in `apps/desktop/src/main/lib/terminal/` (likely in `apps/desktop/src/main/lib/terminal/types.ts` or `runtime.ts`). This contract should include:
   - `TerminalSessionOperations` for per-pane session lifecycle (create/attach/write/resize/signal/kill/detach/clearScrollback, cold restore ack).
   - `TerminalWorkspaceOperations` for workspace-scoped helpers used by other routers (killByWorkspaceId, getSessionCountByWorkspaceId, refreshPromptsForWorkspace).
   - `TerminalEventSource` for event delivery using a backend-agnostic `subscribe...() => unsubscribe` API (no Node EventEmitter semantics in the contract).
   - A shared event union type (for example `TerminalPaneEvent`) that matches the tRPC stream payload shapes (`data`, `exit`, `disconnect`, `error`).
3. Record invariants in code comments near the contract:
   - `terminal.stream` must not complete on `exit`.
   - `exit` is a state transition, not an end-of-stream.
   - The output stream lifecycle is separate from session lifecycle: the stream completes only when the client unsubscribes (dispose), not when a session exits.
   - Detach/reattach must preserve scroll restoration behavior where supported (currently: pass `viewportY` on detach and restore it on the next attach; see upstream PR #698).
   - All backend operations must be normalized to async (Promise-returning) at the contract boundary, even if an implementation currently has a sync method (example: `clearScrollback`).
   - Event delivery must be expressed via `subscribe` APIs at the boundary. Backends may use Node EventEmitter internally today, but callers must not depend on EventEmitter semantics.
   - The terminal event source must be owned by the backend instance; the runtime facade must not introduce a shared/global EventEmitter or re-emit events in a way that can cause cross-talk or duplicate listeners.

Acceptance:

1. A developer can find the contract definition in one place and see the invariants described in plain language.
2. No runtime behavior changes yet.


### Milestone 2: Implement TerminalRuntime Registry + Capabilities

This milestone introduces a single runtime **registry** entry point that owns backend selection and exposes backend-specific capabilities in a consistent, no-branching way to callers.

Approach:

1. Create a small facade in `apps/desktop/src/main/lib/terminal/` (recommended: `apps/desktop/src/main/lib/terminal/runtime-registry.ts`) that exports:
   - `getTerminalRuntimeRegistry(): TerminalRuntimeRegistry`
2. `TerminalRuntime` should have three parts:
   - `sessions: TerminalSessionOperations` (per-pane session lifecycle operations; normalized to async)
   - `workspaces: TerminalWorkspaceOperations` (workspace-scoped helpers; normalized to async)
   - `events: TerminalEventSource` (backend-agnostic subscribe API for per-pane events and `terminalExit`)
   - `management: TerminalManagement | null` (nullable capability object; `null` when persistence/session management is not supported/active)
   - `capabilities: { persistent: boolean; coldRestore: boolean; remoteManagement: boolean }` (feature flags that do not encode implementation details and leave room for a future cloud backend)
3. Do not use “no-op admin methods”. The absence of management capability must be represented structurally (`management: null`) so callers cannot confuse “unsupported” with “success”.
4. Ensure the registry is process-scoped and constructed once. The tRPC router should capture the registry once at router construction time (not per request) to avoid multiplying event listeners or backend client connections.
5. Export the registry from `apps/desktop/src/main/lib/terminal/index.ts` as the only supported way to reach backend-specific functionality.
6. Clarify daemon mid-session failure semantics:
   - `runtime.management !== null` reflects feature/mode availability, not daemon “health right now”.
   - If the daemon disconnects, operations may throw and per-pane disconnect/error events are emitted; the runtime does not dynamically flip `management` to `null`.

Acceptance:

1. The runtime and capabilities surface is defined in `apps/desktop/src/main/lib/terminal/` and is the only code that knows which backend is active.
2. In non-daemon mode, `runtime.management` is `null` and callers must handle that explicitly; unsupported operations are not silently treated as success.


### Milestone 3: Migrate tRPC `terminal.*` Router to the Runtime

This milestone removes daemon branching from the tRPC router by routing all terminal work through `getTerminalRuntimeRegistry()`.

Scope:

1. Update `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` to use:
   - `const registry = getTerminalRuntimeRegistry()` (or equivalent)
   - For mutations/queries that have `workspaceId` in input, select `const runtime = registry.getForWorkspaceId(input.workspaceId)` (future: local vs cloud).
   - For `stream` while it is still keyed by `paneId`, select `const runtime = registry.getForPaneId(paneId)` (transitional until `backendSessionId` is fully wired).
   - Replace `instanceof DaemonTerminalManager` checks with checks on `runtime.management` capability presence.
   - Use `runtime.events.subscribePane(...)` for the `terminal.stream` subscription implementation (no direct EventEmitter usage in the router).
2. Update any other main-process call sites that depend on EventEmitter event names (for example `apps/desktop/src/main/windows/main.ts` listening for `terminalExit`) to use `registry.getDefault().events.subscribeTerminalExit(...)` so EventEmitter semantics do not leak beyond the backend boundary.
3. Preserve the existing endpoint names and response shapes so the renderer does not need behavioral changes:
   - `listDaemonSessions` returns `{ daemonModeEnabled, sessions }`
   - `killAllDaemonSessions` returns `{ daemonModeEnabled, killedCount }`
   - `killDaemonSessionsForWorkspace` returns `{ daemonModeEnabled, killedCount }`
   - `clearTerminalHistory` returns `{ success: true }` but calls history reset when the management capability is present
4. Ensure the `stream` subscription continues to use `observable` and continues to not complete on `exit`.
5. Error semantics must be explicit:
   - If management capability is absent, return `daemonModeEnabled: false` (UI will show “restart app after enabling persistence” messaging).
   - If management capability is present but the operation fails (daemon unreachable, request fails), surface the error (do not convert it into `daemonModeEnabled: false`).

Acceptance:

1. No usage of `instanceof DaemonTerminalManager` remains in `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts`.
2. The renderer does not need to change its API calls.


### Milestone 4: Add Regression Coverage for the Abstraction Boundary

This milestone makes the new boundary hard to accidentally regress later.

Scope:

1. Add a unit test that asserts the non-daemon runtime returns `management: null` (capability absent) without requiring daemon availability. This test must not spawn a real daemon.
2. Keep and/or extend the existing “stream does not complete on exit” regression test in `apps/desktop/src/lib/trpc/routers/terminal/terminal.stream.test.ts`.
3. If we add any new helper modules, ensure they are covered by at least one focused unit test.
4. Add a test that ensures admin operations fail loudly on error (for example, simulate a daemon management call throwing and assert the error propagates), so we do not accidentally reintroduce silent “disabled” fallbacks for real failures.

Acceptance:

1. Tests fail if someone reintroduces daemon-specific branching in the router or reintroduces “complete on exit”.


### Milestone 5: Manual Verification (High-Coverage, Low Surprises)

This milestone uses the existing PR verification matrix (kept in the PR description) and focuses on the specific regressions most likely during a refactor: missing output, stuck exits, incorrect detach behavior, and workspace deletion behavior.

Validation should be run both with terminal persistence disabled and enabled.

Acceptance:

1. The matrix items for non-daemon, daemon warm attach, and daemon cold restore all pass.
2. Reattach scroll restoration passes (detach sends `viewportY`; attach restores it; see upstream PR #698).


### Milestone 6a: Build a Terminal Init Plan (Renderer)

This milestone reduces complexity in the renderer terminal component without changing behavior. The goal is not to “rewrite the terminal UI”, but to isolate protocol/state-machine logic (snapshot vs scrollback selection, restore sequencing, cold restore gating, and scroll restoration) into small units that can be tested.

Scope:

1. Add a small “session init adapter” that converts the tRPC `createOrAttach` result into a single normalized “initialization plan”:
   - Canonical initial content (`initialAnsi`) is `snapshot.snapshotAnsi ?? scrollback`.
   - Rehydrate sequences and mode flags are always present in the plan (with fallbacks where snapshot modes are missing).
   - The plan contains a single restore strategy decision, for example “alt-screen redraw” vs “snapshot replay”, based on the same conditions `Terminal.tsx` uses today.
   - The plan carries `viewportY` (when provided) to preserve scroll restoration on reattach (upstream PR #698 behavior).
2. Add a “restore applier” helper that owns strict ordering guarantees during restore:
   - Apply rehydrate sequences, then snapshot replay, then mark the stream as ready and flush queued events.
   - Preserve the existing “alt-screen reattach” behavior where we enter alt-screen first and trigger a redraw via resize/SIGWINCH sequence (to avoid white screens).

Acceptance:

1. At least one unit test exists for the init adapter to lock in “snapshot vs scrollback” canonicalization, mode fallbacks, and `viewportY` plumbing.
2. No Node.js imports are introduced in renderer code as part of this refactor.


### Milestone 6b: Stream Subscription + Buffering Hook (Renderer)

Scope:

1. Add a small “stream handler” helper (or hook) that owns buffering until ready:
   - Subscribe to `terminal.stream` and queue incoming events until the terminal is ready, then flush deterministically.
   - Keep the important invariant that the subscription does not complete on `exit` (exit is a state transition).
   - Keep the buffering mechanism bounded (by event count or bytes) and drop/compact safely if needed (prefer bounded queues over unbounded arrays).

Acceptance:

1. A focused unit test exists for “buffer until ready then flush in order”.
2. The stream still does not complete on exit.


### Milestone 6c: Integrate Helpers into `Terminal.tsx` (UI Wiring Only)

Scope:

1. Refactor `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/Terminal.tsx` to use the helpers from Milestones 6a/6b:
   - Keep UI concerns (overlays, buttons, focus) in `Terminal.tsx`.
   - Move protocol concerns (snapshot vs scrollback selection, restore sequencing, stream buffering) out of the component.
2. Preserve scroll restoration behavior on reattach:
   - Send `viewportY` during detach (when available).
   - Restore it during the next attach at the appropriate time in the restore ordering (after initial content is applied).
3. Clarify `useTerminalConnection` expectations:
   - `useTerminalConnection()` remains the tRPC mutation wrapper and is not a target for significant refactors in this milestone, beyond adapting call sites to the new helpers.

Acceptance:

1. `Terminal.tsx` still behaves identically (cold restore overlay, Start Shell flow, retry connection flow, exit prompt flow), but the core initialization/stream logic is exercised via helper functions that can be unit tested.
2. No Node.js imports are introduced in renderer code as part of this refactor.


### Milestone 7 (Cloud Readiness): Introduce `backendSessionId`

This milestone is required groundwork for cloud/SSH-style backends: it decouples renderer pane identity (`paneId`) from backend session identity (`backendSessionId`). Complete this before introducing any cloud/SSH provider to avoid reworking the router + renderer contracts again.

Scope:

1. Extend `createOrAttach` to return `backendSessionId` (for local backends it can equal `paneId`).
2. Store the mapping `{ paneId -> backendSessionId }` in renderer state and use `backendSessionId` for subsequent lifecycle operations (write/resize/signal/kill/detach and stream subscription), while continuing to key UI state by `paneId`.
3. Update the runtime registry to route by backend session identity:
   - Avoid relying on `getForPaneId(...)` as the long-term selection mechanism.
   - Prefer selecting runtimes by workspace/session IDs (cloud-safe), not by UI pane IDs.
4. Add lifecycle events needed for cloud-style backends (define the contract even if some implementations are stubs initially):
   - connection lifecycle: `connectionStateChanged`, `authExpired`
   - per-operation timeout/retry policy at the boundary (even if implemented as “none” initially)

Acceptance:

1. The contract no longer implies `paneId === backendSessionId`, but behavior remains identical for local backends.
2. A future cloud backend can implement the same runtime contract without changing `Terminal.tsx` and the tRPC router again.


## Validation

Run these commands from the repo root:

    bun run lint
    bun run typecheck --filter=@superset/desktop
    bun test --filter=@superset/desktop

Expected results:

1. `bun run lint` exits with code 0 (Biome check is strict in this repo).
2. Typecheck passes with no TypeScript errors.
3. Desktop tests pass (some terminal-host lifecycle tests may remain skipped; do not “fix” unrelated skips as part of this refactor).


## Idempotence / Safety

This plan is safe to apply iteratively:

1. Changes are limited to TypeScript source and tests; no production database access is required.
2. Each milestone should be merged/committed independently so failures can be bisected quickly.
3. If a milestone introduces a regression, revert the milestone commit and re-apply with a smaller diff.


## Risks and Mitigations

Risk: The runtime registry/adapters change event wiring in a way that causes missed output or duplicate listeners.

Mitigation: Keep the EventEmitter contract unchanged (`data:${paneId}`, `exit:${paneId}`), keep `terminal.stream` semantics unchanged, and use tests + manual matrix to confirm “output still flows after exit/cold restore”.

Risk: Output loss during attach if the stream subscription attaches after early PTY output (race between `createOrAttach` and `terminal.stream` subscribe).

Mitigation: Preserve the current renderer sequencing (subscription established while the component is mounted, initial state applied from snapshot/scrollback, and stream events queued until ready). During manual QA, include at least one “immediate output” command (example: `echo READY`) and confirm it is visible reliably. If a reproducible loss exists, add a small per-pane ring buffer (bounded bytes) at the backend boundary and flush it to the first subscriber (a “ready/attached handshake”).

Risk: Admin capability handling masks real errors (a true daemon failure being reported as “disabled”).

Mitigation: Represent persistence/session management as a nullable capability object (`management: null` when unavailable). When `management` is present but calls fail, propagate errors (and test this explicitly).

Risk: A future cloud backend would require different identity mapping than `paneId == sessionId`.

Mitigation: Introduce `backendSessionId` (Milestone 7) so the contract no longer implies `paneId === backendSessionId` (local can keep equality as an implementation detail). The future cloud backend should implement the same contract behind `TerminalRuntime` without changing the renderer again.

Risk: Process-global runtime assumptions block local + cloud workspaces from coexisting (forcing branching to leak back into routers/UI).

Mitigation: Make runtime selection workspace-/session-scoped via the registry. The router captures the registry, not a single global runtime.

Risk: Reattach scroll restoration regresses during refactor (missing `viewportY` plumbing or restoring at the wrong time).

Mitigation: Treat `viewportY` as part of the stable contract (detach includes it; init plan carries it; restore applier applies it after initial content). Add explicit verification to the PR matrix and (if needed) a focused unit test around the init plan adapter carrying `viewportY`.

Risk: A refactor accidentally calls `emit.complete()` on `exit` (observable completion is irreversible), reintroducing the cold-restore failure mode.

Mitigation: Keep the “stream does not complete on exit” regression test as P0 coverage and treat any adapter/hook changes to stream handling as test-gated.


## Progress

### Milestone 1

- [ ] Inventory terminal backend call sites and events
- [ ] Write TerminalBackend contract type and invariants comment
- [ ] Confirm no behavior change; run `bun run lint`

### Milestone 2

- [ ] Implement `getTerminalRuntimeRegistry()` in `apps/desktop/src/main/lib/terminal/`
- [ ] Implement session management as `management: TerminalManagement | null` (no no-op admin methods)
- [ ] Run `bun run typecheck --filter=@superset/desktop`

### Milestone 3

- [ ] Migrate `apps/desktop/src/lib/trpc/routers/terminal/terminal.ts` to runtime registry (`getTerminalRuntimeRegistry()`)
- [ ] Remove `instanceof DaemonTerminalManager` checks
- [ ] Run `bun test --filter=@superset/desktop`

### Milestone 4

- [ ] Add/adjust unit tests for capability presence (`management: null`) and error propagation
- [ ] Confirm stream exit regression test still covers “no complete on exit”
- [ ] Run full validation commands

### Milestone 5

- [ ] Manual verification with persistence disabled
- [ ] Manual verification with persistence enabled (warm attach)
- [ ] Manual verification for cold restore “Start Shell” path

### Milestone 6a

- [ ] Implement init plan adapter (normalize snapshot vs scrollback, modes, `viewportY`)
- [ ] Implement restore applier helper (rehydrate → snapshot → scroll restore → stream ready)
- [ ] Add focused unit tests for init plan invariants

### Milestone 6b

- [ ] Implement stream handler helper/hook (buffer until ready, flush deterministically)
- [ ] Add focused unit tests for buffering + no-complete-on-exit

### Milestone 6c

- [ ] Refactor `Terminal.tsx` to use helpers, preserving behavior
- [ ] Preserve detach/reattach scroll restoration (`viewportY`)

### Milestone 7 (Cloud Readiness)

- [ ] Add `backendSessionId` to `createOrAttach` response (local backends: equals `paneId`)
- [ ] Store `{ paneId -> backendSessionId }` mapping in renderer state; use backend ID for operations
- [ ] Update runtime registry selection to be workspace/session-based (avoid long-term reliance on `getForPaneId`)
- [ ] Define/introduce lifecycle events needed for cloud backends (connection/auth)


## Surprises & Discoveries

- 2026-01-11: Reviewed `docs/CLOUD_WORKSPACE_PLAN.md` — cloud is source of truth with optional local sync; implies a workspace-scoped provider boundary (terminal + agentEvents + changes/files), not “terminal-only”.
- 2026-01-11: Upstream main includes detach/reattach scroll restoration (`viewportY`, PR #698); treat as a stable behavior invariant during refactor.


## Decision Log

- 2026-01-11: Use a process-scoped **runtime registry** (`getTerminalRuntimeRegistry()`), not a single global runtime; router captures the registry and selects runtimes per workspace/session so local + cloud can coexist later.
- 2026-01-11: Keep the abstraction boundary provider-neutral: expose `management: TerminalManagement | null` (capability object) while keeping legacy endpoint names like `listDaemonSessions` for UI compatibility.
- 2026-01-11: Preserve renderer behavior; any `Terminal.tsx` changes are decomposition-only (init plan + applier + stream buffering), preserving “no complete on exit” and `viewportY` scroll restoration.
- 2026-01-11: Treat `backendSessionId` as required groundwork for cloud/SSH backends (Milestone 7). Local may keep `backendSessionId === paneId` as an implementation detail, but the contract must not assume it.


## Outcomes & Retrospective

(Fill this in at the end: what changed, how to verify, what follow-ups remain, what you would do differently.)
