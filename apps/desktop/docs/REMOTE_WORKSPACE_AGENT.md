# Remote Workspace Agent Architecture

> Enable full Superset functionality on remote machines via SSH

## Overview

The Remote Workspace Agent allows users to connect to remote machines and use all Superset features (terminals, git operations, workspace management, change inspection) as if working locally.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPERSET DESKTOP                                  │
│  ┌─────────────────┐    ┌──────────────────┐    ┌───────────────────────┐  │
│  │   Renderer      │    │   Main Process   │    │   SSH Connection      │  │
│  │   (React UI)    │◄──►│   (tRPC Router)  │◄──►│   Manager             │  │
│  └─────────────────┘    └──────────────────┘    └───────────┬───────────┘  │
│                                                              │              │
└──────────────────────────────────────────────────────────────┼──────────────┘
                                                               │
                                              SSH Tunnel (encrypted)
                                                               │
┌──────────────────────────────────────────────────────────────┼──────────────┐
│                         REMOTE MACHINE                       │              │
│  ┌───────────────────────────────────────────────────────────▼───────────┐  │
│  │                      SUPERSET AGENT                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │  │
│  │  │  Terminal    │  │  Git         │  │  File        │  │  Worktree │  │  │
│  │  │  Manager     │  │  Operations  │  │  Operations  │  │  Manager  │  │  │
│  │  │  (node-pty)  │  │  (simple-git)│  │  (fs)        │  │           │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Design Goals

1. **Full Feature Parity**: All local features work on remote machines
2. **Zero Friction Development**: Adding new features works for local AND remote automatically
3. **Transparent to Developers**: No special code paths for remote vs local
4. **Secure**: All communication over SSH, keys stored securely
5. **Resilient**: Handle disconnections gracefully, auto-reconnect
6. **Non-Breaking**: Existing local functionality unchanged

---

## Core Principle: Write Once, Works Everywhere

```typescript
// When building ANY feature, you just do this:
const ops = getOperations(projectId);
const status = await ops.git.status(repoPath);

// You NEVER think about local vs remote. It just works.
// The transport layer is completely invisible to feature development.
```

---

## Package Structure

```
packages/
  core/                          # Shared operations + RPC infrastructure
    src/
      operations/                # Operation interfaces + local implementations
        git/
          types.ts               # IGitOperations interface
          local.ts               # Implementation using simple-git
          index.ts
        files/
          types.ts               # IFileOperations interface
          local.ts               # Implementation using fs
          index.ts
        workspace/
          types.ts               # IWorkspaceOperations interface
          local.ts               # Worktree management
          index.ts
        index.ts                 # Barrel export
      rpc/
        types.ts                 # RPC protocol types
        client.ts                # RPC client (desktop uses for remote)
        server.ts                # RPC server (agent uses this)
        proxy.ts                 # Auto-generates RPC wrapper from interface
      index.ts
    package.json

  remote-agent/                    # Remote agent (standalone binary)
    src/
      index.ts                   # Entry point - TCP server
      terminal-manager.ts        # Agent-side terminal (node-pty)
    package.json
    build.ts                     # Builds for linux/darwin x64/arm64

apps/
  desktop/
    src/
      main/lib/
        ssh/
          connection-manager.ts  # Manages SSH connections per project
          agent-deployer.ts      # Auto-deploys agent to remote
          rpc-client.ts          # RPC client over SSH tunnel
        operations/
          provider.ts            # Returns ops for project (local or remote)
          terminal/              # Terminal is special (PTY handling)
            types.ts
            local.ts             # Local node-pty  
            ssh.ts               # SSH PTY channel
```

### Package Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   @superset/core                                                │
│   ├── simple-git                                                │
│   ├── (no electron dependencies!)                               │
│   └── exports: operations, rpc, types                           │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                            │                                    │
│   @superset/remote-agent   │    apps/desktop                    │
│   ├── @superset/core       │    ├── @superset/core              │
│   ├── node-pty             │    ├── ssh2                        │
│   └── (standalone binary)  │    ├── node-pty                    │
│                            │    └── electron                    │
│                            │                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Operation Interfaces

Define what operations are available. These interfaces are the contract between local and remote.

```typescript
// packages/core/src/operations/git/types.ts

export interface IGitOperations {
  status(repoPath: string): Promise<GitStatus>;
  diff(repoPath: string, options?: DiffOptions): Promise<string>;
  stage(repoPath: string, files: string[]): Promise<void>;
  unstage(repoPath: string, files: string[]): Promise<void>;
  commit(repoPath: string, message: string): Promise<{ hash: string }>;
  push(repoPath: string, options?: PushOptions): Promise<void>;
  pull(repoPath: string): Promise<void>;
  branches(repoPath: string, options?: BranchOptions): Promise<BranchInfo[]>;
  checkout(repoPath: string, branch: string): Promise<void>;
  createWorktree(params: CreateWorktreeParams): Promise<{ path: string }>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
}

export interface GitStatus {
  current: string | null;
  tracking: string | null;
  files: GitFileStatus[];
  ahead: number;
  behind: number;
}

export interface GitFileStatus {
  path: string;
  index: string;
  working_dir: string;
}

export interface DiffOptions {
  staged?: boolean;
  file?: string;
}

export interface PushOptions {
  setUpstream?: boolean;
  force?: boolean;
}

export interface BranchOptions {
  all?: boolean;
  remote?: boolean;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  tracking?: string;
}

export interface CreateWorktreeParams {
  repoPath: string;
  branch: string;
  path: string;
  startPoint: string;
}
```

```typescript
// packages/core/src/operations/files/types.ts

export interface IFileOperations {
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Buffer>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, content: Buffer): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<FileInfo[]>;
  stat(path: string): Promise<FileStat>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  copy(src: string, dest: string): Promise<void>;
  move(src: string, dest: string): Promise<void>;
}

export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
  size: number;
  modifiedAt: string;
}

export interface FileStat {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  isSymbolicLink: boolean;
  modifiedAt: string;
  createdAt: string;
}
```

```typescript
// packages/core/src/operations/workspace/types.ts

export interface IWorkspaceOperations {
  createWorktree(params: CreateWorktreeParams): Promise<WorktreeInfo>;
  removeWorktree(repoPath: string, worktreePath: string): Promise<void>;
  listWorktrees(repoPath: string): Promise<WorktreeInfo[]>;
  getDefaultBranch(repoPath: string): Promise<string>;
  hasOriginRemote(repoPath: string): Promise<boolean>;
  fetchBranch(repoPath: string, branch: string): Promise<void>;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}
```

### 2. Local Implementations

Implement operations using local tools (simple-git, fs, etc.).

```typescript
// packages/core/src/operations/git/local.ts

import simpleGit from 'simple-git';
import type { 
  IGitOperations, 
  GitStatus, 
  DiffOptions,
  PushOptions,
  BranchOptions,
  BranchInfo,
  CreateWorktreeParams,
} from './types';

export class LocalGitOperations implements IGitOperations {
  async status(repoPath: string): Promise<GitStatus> {
    const git = simpleGit(repoPath);
    const status = await git.status();
    return {
      current: status.current,
      tracking: status.tracking,
      files: status.files.map(f => ({
        path: f.path,
        index: f.index,
        working_dir: f.working_dir,
      })),
      ahead: status.ahead,
      behind: status.behind,
    };
  }

  async diff(repoPath: string, options?: DiffOptions): Promise<string> {
    const git = simpleGit(repoPath);
    const args: string[] = [];
    
    if (options?.staged) {
      args.push('--cached');
    }
    if (options?.file) {
      args.push('--', options.file);
    }
    
    return args.length > 0 ? git.diff(args) : git.diff();
  }

  async stage(repoPath: string, files: string[]): Promise<void> {
    const git = simpleGit(repoPath);
    await git.add(files);
  }

  async unstage(repoPath: string, files: string[]): Promise<void> {
    const git = simpleGit(repoPath);
    await git.reset(['HEAD', '--', ...files]);
  }

  async commit(repoPath: string, message: string): Promise<{ hash: string }> {
    const git = simpleGit(repoPath);
    const result = await git.commit(message);
    return { hash: result.commit };
  }

  async push(repoPath: string, options?: PushOptions): Promise<void> {
    const git = simpleGit(repoPath);
    
    if (options?.setUpstream) {
      const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
      const args = ['--set-upstream', 'origin', branch.trim()];
      if (options.force) args.unshift('--force');
      await git.push(args);
    } else if (options?.force) {
      await git.push(['--force']);
    } else {
      await git.push();
    }
  }

  async pull(repoPath: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.pull(['--rebase']);
  }

  async branches(repoPath: string, options?: BranchOptions): Promise<BranchInfo[]> {
    const git = simpleGit(repoPath);
    const args: string[] = [];
    
    if (options?.all) args.push('-a');
    else if (options?.remote) args.push('-r');
    
    const result = await git.branch(args);
    
    return Object.entries(result.branches).map(([name, info]) => ({
      name,
      current: info.current,
      commit: info.commit,
      tracking: info.label?.includes('origin') ? info.label : undefined,
    }));
  }

  async checkout(repoPath: string, branch: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.checkout(branch);
  }

  async createWorktree(params: CreateWorktreeParams): Promise<{ path: string }> {
    const git = simpleGit(params.repoPath);
    await git.raw([
      'worktree', 
      'add', 
      '-b', 
      params.branch, 
      params.path, 
      params.startPoint,
    ]);
    return { path: params.path };
  }

  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.raw(['worktree', 'remove', '--force', worktreePath]);
  }
}

// Singleton for local use
export const localGitOperations = new LocalGitOperations();
```

```typescript
// packages/core/src/operations/files/local.ts

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IFileOperations, FileInfo, FileStat } from './types';

export class LocalFileOperations implements IFileOperations {
  async read(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8');
  }

  async readBinary(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  async write(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async writeBinary(filePath: string, content: Buffer): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(dirPath: string): Promise<FileInfo[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    return Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        };
      })
    );
  }

  async stat(filePath: string): Promise<FileStat> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymbolicLink: stats.isSymbolicLink(),
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtime.toISOString(),
    };
  }

  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.mkdir(dirPath, { recursive: options?.recursive ?? false });
  }

  async remove(filePath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.rm(filePath, { recursive: options?.recursive ?? false, force: true });
  }

  async copy(src: string, dest: string): Promise<void> {
    await fs.cp(src, dest, { recursive: true });
  }

  async move(src: string, dest: string): Promise<void> {
    await fs.rename(src, dest);
  }
}

// Singleton for local use
export const localFileOperations = new LocalFileOperations();
```

### 3. RPC Infrastructure

The magic: auto-generate RPC wrappers from interfaces using Proxy.

```typescript
// packages/core/src/rpc/types.ts

export interface RpcMessage {
  id: string;
  method: string;
  params: unknown[];
}

export interface RpcResponse {
  id: string;
  result?: unknown;
  error?: string;
}

export interface RpcClient {
  call<T>(method: string, params: unknown[]): Promise<T>;
  close(): void;
}
```

```typescript
// packages/core/src/rpc/proxy.ts

import type { RpcClient } from './types';

/**
 * Creates a proxy that automatically converts method calls to RPC calls.
 * 
 * When you add a new method to an interface + local implementation,
 * the RPC version works automatically with ZERO additional code.
 * 
 * @example
 * const gitOps = createRpcProxy<IGitOperations>(rpcClient, 'git');
 * 
 * // This call:
 * await gitOps.status('/path/to/repo');
 * 
 * // Becomes:
 * await rpcClient.call('git.status', ['/path/to/repo']);
 */
export function createRpcProxy<T extends object>(
  rpcClient: RpcClient,
  namespace: string
): T {
  return new Proxy({} as T, {
    get(_, method: string) {
      // Return a function that calls RPC
      return async (...args: unknown[]) => {
        return rpcClient.call(`${namespace}.${method}`, args);
      };
    },
  });
}
```

```typescript
// packages/core/src/rpc/server.ts

import type { RpcMessage, RpcResponse } from './types';

type Handler = (...args: unknown[]) => Promise<unknown>;

export class RpcServer {
  private handlers = new Map<string, Handler>();

  /**
   * Register an entire operations object.
   * All methods become RPC handlers automatically.
   * 
   * @example
   * const server = new RpcServer();
   * server.registerOperations('git', localGitOperations);
   * server.registerOperations('files', localFileOperations);
   */
  registerOperations<T extends object>(namespace: string, operations: T): void {
    // Get all method names from the object's prototype
    const proto = Object.getPrototypeOf(operations);
    const methods = Object.getOwnPropertyNames(proto)
      .filter(name => 
        name !== 'constructor' && 
        typeof (operations as Record<string, unknown>)[name] === 'function'
      );

    for (const method of methods) {
      const fullName = `${namespace}.${method}`;
      const fn = (operations as Record<string, Function>)[method].bind(operations);
      this.handlers.set(fullName, fn);
    }
  }

  /**
   * Register a single handler function.
   */
  register(method: string, handler: Handler): void {
    this.handlers.set(method, handler);
  }

  /**
   * Handle an incoming RPC message and return the response.
   */
  async handle(messageStr: string): Promise<string> {
    let message: RpcMessage;
    
    try {
      message = JSON.parse(messageStr);
    } catch {
      return JSON.stringify({ 
        id: 'unknown', 
        error: 'Invalid JSON' 
      } satisfies RpcResponse);
    }

    const { id, method, params } = message;
    const handler = this.handlers.get(method);

    if (!handler) {
      return JSON.stringify({ 
        id, 
        error: `Unknown method: ${method}` 
      } satisfies RpcResponse);
    }

    try {
      const result = await handler(...(Array.isArray(params) ? params : [params]));
      return JSON.stringify({ id, result } satisfies RpcResponse);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return JSON.stringify({ id, error: errorMessage } satisfies RpcResponse);
    }
  }

  /**
   * List all registered methods (useful for debugging).
   */
  listMethods(): string[] {
    return Array.from(this.handlers.keys());
  }
}
```

### 4. Operations Provider (Desktop)

The provider returns local or remote operations based on project configuration.

```typescript
// apps/desktop/src/main/lib/operations/provider.ts

import {
  type IGitOperations,
  type IFileOperations,
  type IWorkspaceOperations,
  localGitOperations,
  localFileOperations,
  localWorkspaceOperations,
  createRpcProxy,
} from '@superset/core';
import { sshConnectionManager } from '../ssh/connection-manager';
import { localDb } from '../local-db';
import { projects } from '@superset/local-db';
import { eq } from 'drizzle-orm';

/**
 * All available operations.
 * Terminal is handled separately due to PTY requirements.
 */
export interface Operations {
  git: IGitOperations;
  files: IFileOperations;
  workspace: IWorkspaceOperations;
}

// Local operations singleton
const localOperations: Operations = {
  git: localGitOperations,
  files: localFileOperations,
  workspace: localWorkspaceOperations,
};

// Cache remote operation proxies per project
const remoteOpsCache = new Map<string, Operations>();

/**
 * Get operations for a project.
 * 
 * Returns local implementations for local projects,
 * or RPC proxies for remote projects.
 * 
 * @example
 * const ops = getOperations(projectId);
 * const status = await ops.git.status(repoPath);
 * // Works identically for local and remote!
 */
export function getOperations(projectId: string): Operations {
  const project = localDb
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  // Local project - use local implementations directly
  if (!project.remoteConfig) {
    return localOperations;
  }

  // Remote project - use cached RPC proxies or create new ones
  const cached = remoteOpsCache.get(projectId);
  if (cached && sshConnectionManager.isConnected(projectId)) {
    return cached;
  }

  // Create new RPC proxies
  const rpcClient = sshConnectionManager.getRpcClient(projectId);
  
  if (!rpcClient) {
    throw new Error(`Not connected to remote for project ${projectId}`);
  }

  const ops: Operations = {
    git: createRpcProxy<IGitOperations>(rpcClient, 'git'),
    files: createRpcProxy<IFileOperations>(rpcClient, 'files'),
    workspace: createRpcProxy<IWorkspaceOperations>(rpcClient, 'workspace'),
  };

  remoteOpsCache.set(projectId, ops);
  return ops;
}

/**
 * Clear cached operations for a project.
 * Call this when disconnecting from remote.
 */
export function clearOperationsCache(projectId: string): void {
  remoteOpsCache.delete(projectId);
}

/**
 * Check if a project is remote.
 */
export function isRemoteProject(projectId: string): boolean {
  const project = localDb
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  return !!project?.remoteConfig;
}
```

### 5. Remote Agent

The agent runs on the remote machine and exposes local operations via RPC.

```typescript
// packages/remote-agent/src/index.ts

import * as net from 'node:net';
import {
  RpcServer,
  localGitOperations,
  localFileOperations,
  localWorkspaceOperations,
} from '@superset/core';
import { AgentTerminalManager } from './terminal-manager';

const VERSION = '1.0.0';
const AGENT_PORT = parseInt(process.env.SUPERSET_AGENT_PORT || '19999', 10);
const AGENT_HOST = '127.0.0.1'; // Only localhost for security

console.log(`[Agent] Superset Agent v${VERSION}`);
console.log(`[Agent] PID: ${process.pid}`);

// Create RPC server
const rpcServer = new RpcServer();

// Register all operations - they're now available via RPC automatically!
rpcServer.registerOperations('git', localGitOperations);
rpcServer.registerOperations('files', localFileOperations);
rpcServer.registerOperations('workspace', localWorkspaceOperations);

// Terminal requires special handling (PTY management)
const terminalManager = new AgentTerminalManager();
rpcServer.registerOperations('terminal', terminalManager);

console.log(`[Agent] Registered methods:`, rpcServer.listMethods());

// TCP Server
const server = net.createServer((socket) => {
  const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[Agent] Client connected: ${clientAddr}`);

  let buffer = '';

  socket.on('data', async (data) => {
    buffer += data.toString();

    // Process complete messages (newline-delimited JSON)
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const message = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);

      if (message.trim()) {
        const response = await rpcServer.handle(message);
        socket.write(response + '\n');
      }
    }
  });

  socket.on('error', (err) => {
    console.error(`[Agent] Socket error (${clientAddr}):`, err.message);
  });

  socket.on('close', () => {
    console.log(`[Agent] Client disconnected: ${clientAddr}`);
  });
});

server.on('error', (err) => {
  console.error('[Agent] Server error:', err);
  process.exit(1);
});

server.listen(AGENT_PORT, AGENT_HOST, () => {
  console.log(`[Agent] Listening on ${AGENT_HOST}:${AGENT_PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('[Agent] Shutting down...');
  terminalManager.cleanup();
  server.close(() => {
    console.log('[Agent] Server closed');
    process.exit(0);
  });
  
  // Force exit after timeout
  setTimeout(() => {
    console.log('[Agent] Force exit');
    process.exit(1);
  }, 5000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

```typescript
// packages/remote-agent/src/terminal-manager.ts

import * as pty from 'node-pty';
import * as os from 'node:os';

interface TerminalSession {
  pty: pty.IPty;
  subscribers: Set<(data: string) => void>;
}

export class AgentTerminalManager {
  private sessions = new Map<string, TerminalSession>();

  async create(params: {
    sessionId: string;
    cwd?: string;
    cols?: number;
    rows?: number;
    env?: Record<string, string>;
  }): Promise<{ sessionId: string }> {
    const { sessionId, cwd, cols = 80, rows = 24, env = {} } = params;

    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const shell = process.env.SHELL || '/bin/bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: cwd || os.homedir(),
      env: { ...process.env, ...env },
    });

    const session: TerminalSession = {
      pty: ptyProcess,
      subscribers: new Set(),
    };

    this.sessions.set(sessionId, session);

    return { sessionId };
  }

  async write(sessionId: string, data: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.pty.write(data);
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    session.pty.resize(cols, rows);
  }

  async kill(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.pty.kill();
    this.sessions.delete(sessionId);
  }

  cleanup(): void {
    for (const [sessionId, session] of this.sessions) {
      try {
        session.pty.kill();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.sessions.clear();
  }
}
```

---

## SSH Transport

### SSH Connection Manager

```typescript
// apps/desktop/src/main/lib/ssh/connection-manager.ts

import { Client } from 'ssh2';
import { safeStorage } from 'electron';
import { localDb } from '../local-db';
import { projects, sshKeys } from '@superset/local-db';
import { eq } from 'drizzle-orm';
import { SshRpcClient } from './rpc-client';
import { AgentDeployer } from './agent-deployer';
import { clearOperationsCache } from '../operations/provider';
import type { RpcClient } from '@superset/core';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ConnectionState {
  client: Client;
  rpcClient: SshRpcClient;
  status: ConnectionStatus;
  error?: string;
}

class SshConnectionManager {
  private connections = new Map<string, ConnectionState>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  async connect(projectId: string): Promise<void> {
    // Already connected?
    const existing = this.connections.get(projectId);
    if (existing?.status === 'connected') {
      return;
    }

    // Get project configuration
    const project = localDb
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();

    if (!project?.remoteConfig) {
      throw new Error('Project is not configured for remote access');
    }

    const config = project.remoteConfig;

    // Load SSH key
    const sshKey = localDb
      .select()
      .from(sshKeys)
      .where(eq(sshKeys.id, config.sshKeyId))
      .get();

    if (!sshKey) {
      throw new Error('SSH key not found');
    }

    const privateKey = safeStorage.decryptString(
      Buffer.from(sshKey.encryptedPrivateKey)
    );

    // Create SSH client
    const client = new Client();

    // Update status
    this.connections.set(projectId, {
      client,
      rpcClient: null!,
      status: 'connecting',
    });

    try {
      // Connect SSH
      await new Promise<void>((resolve, reject) => {
        client
          .on('ready', resolve)
          .on('error', reject)
          .connect({
            host: config.host,
            port: config.port,
            username: config.username,
            privateKey: Buffer.from(privateKey),
            keepaliveInterval: 30000,
            keepaliveCountMax: 3,
          });
      });

      // Ensure agent is running (auto-deploy if needed)
      const deployer = new AgentDeployer(client);
      const deployResult = await deployer.ensureAgentRunning();
      
      if (!deployResult.success) {
        throw new Error(deployResult.error || 'Failed to start agent');
      }

      // Connect to agent via port forwarding
      const rpcClient = new SshRpcClient(client, config.agentPort || 19999);
      await rpcClient.connect();

      // Update state
      this.connections.set(projectId, {
        client,
        rpcClient,
        status: 'connected',
      });

      // Set up disconnect handler
      client.on('close', () => {
        this.handleDisconnect(projectId);
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.connections.set(projectId, {
        client,
        rpcClient: null!,
        status: 'error',
        error: errorMessage,
      });
      client.end();
      throw error;
    }
  }

  private handleDisconnect(projectId: string): void {
    const state = this.connections.get(projectId);
    if (state) {
      state.status = 'disconnected';
    }

    // Clear operation cache
    clearOperationsCache(projectId);

    // Schedule reconnection
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(projectId);
      this.connect(projectId).catch((err) => {
        console.error(`[SSH] Reconnection failed for ${projectId}:`, err.message);
      });
    }, 5000);

    this.reconnectTimers.set(projectId, timer);
  }

  async disconnect(projectId: string): Promise<void> {
    // Cancel reconnection
    const timer = this.reconnectTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(projectId);
    }

    // Close connection
    const state = this.connections.get(projectId);
    if (state) {
      state.rpcClient?.close();
      state.client.end();
      this.connections.delete(projectId);
    }

    // Clear cache
    clearOperationsCache(projectId);
  }

  getRpcClient(projectId: string): RpcClient | null {
    const state = this.connections.get(projectId);
    if (state?.status !== 'connected') {
      return null;
    }
    return state.rpcClient;
  }

  isConnected(projectId: string): boolean {
    return this.connections.get(projectId)?.status === 'connected';
  }

  getStatus(projectId: string): ConnectionStatus {
    return this.connections.get(projectId)?.status || 'disconnected';
  }

  getError(projectId: string): string | undefined {
    return this.connections.get(projectId)?.error;
  }
}

export const sshConnectionManager = new SshConnectionManager();
```

### SSH RPC Client

```typescript
// apps/desktop/src/main/lib/ssh/rpc-client.ts

import type { Client, ClientChannel } from 'ssh2';
import type { RpcClient, RpcResponse } from '@superset/core';

export class SshRpcClient implements RpcClient {
  private channel: ClientChannel | null = null;
  private pending = new Map<string, { 
    resolve: (value: unknown) => void; 
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private buffer = '';

  constructor(
    private sshClient: Client,
    private agentPort: number
  ) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sshClient.forwardOut(
        '127.0.0.1',
        0,
        '127.0.0.1',
        this.agentPort,
        (err, channel) => {
          if (err) {
            reject(new Error(`Failed to connect to agent: ${err.message}`));
            return;
          }

          this.channel = channel;

          channel.on('data', (data: Buffer) => {
            this.handleData(data.toString());
          });

          channel.on('close', () => {
            this.channel = null;
            // Reject all pending requests
            for (const [id, { reject, timeout }] of this.pending) {
              clearTimeout(timeout);
              reject(new Error('Connection closed'));
            }
            this.pending.clear();
          });

          resolve();
        }
      );
    });
  }

  private handleData(data: string): void {
    this.buffer += data;

    let idx: number;
    while ((idx = this.buffer.indexOf('\n')) !== -1) {
      const message = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 1);

      if (!message.trim()) continue;

      try {
        const response: RpcResponse = JSON.parse(message);
        const pending = this.pending.get(response.id);

        if (pending) {
          this.pending.delete(response.id);
          clearTimeout(pending.timeout);

          if (response.error) {
            pending.reject(new Error(response.error));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch (err) {
        console.error('[RPC] Failed to parse response:', err);
      }
    }
  }

  async call<T>(method: string, params: unknown[]): Promise<T> {
    if (!this.channel) {
      throw new Error('Not connected to agent');
    }

    const id = crypto.randomUUID();
    const message = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, 30000);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.channel!.write(message + '\n');
    });
  }

  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
```

---

## Agent Installation

### Hybrid Approach: Auto-deploy with Manual Fallback

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONNECTION FLOW                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  SSH Connect    │
                    └────────┬────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Check if agent  │
                    │ is running      │──────────────┐
                    └────────┬────────┘              │
                              │                      │
                         Not running              Running
                              │                      │
                              ▼                      │
                    ┌─────────────────┐              │
                    │ Check if agent  │              │
                    │ binary exists   │              │
                    └────────┬────────┘              │
                              │                      │
                    ┌─────┴─────┐                   │
                 Exists    Not exists               │
                    │           │                    │
                    ▼           ▼                    │
              ┌─────────┐  ┌─────────────┐          │
              │  Start  │  │ Auto-deploy │          │
              │  Agent  │  │   binary    │          │
              └────┬────┘  └──────┬──────┘          │
                    │              │                 │
                    │         ┌────┴────┐           │
                    │      Success    Failed        │
                    │         │          │          │
                    │         ▼          ▼          │
                    │    ┌─────────┐ ┌──────────┐   │
                    │    │  Start  │ │  Show    │   │
                    │    │  Agent  │ │  Manual  │   │
                    │    └────┬────┘ │  Install │   │
                    │         │      │  Dialog  │   │
                    │         │      └──────────┘   │
                    └────┬────┴─────────────────────┘
                         │
                         ▼
                    ┌─────────────────┐
                    │   Connected!    │
                    └─────────────────┘
```

### Agent Deployer

```typescript
// apps/desktop/src/main/lib/ssh/agent-deployer.ts

import type { Client } from 'ssh2';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { app } from 'electron';

interface DeployResult {
  success: boolean;
  error?: string;
  needsManualInstall?: boolean;
}

const AGENT_BINARIES: Record<string, string> = {
  'linux-x64': 'superset-agent-linux-x64',
  'linux-arm64': 'superset-agent-linux-arm64',
  'darwin-x64': 'superset-agent-darwin-x64',
  'darwin-arm64': 'superset-agent-darwin-arm64',
};

const AGENT_PATH = '$HOME/.superset/bin/superset-agent';
const AGENT_PORT = 19999;

export class AgentDeployer {
  constructor(private client: Client) {}

  async ensureAgentRunning(): Promise<DeployResult> {
    // Check if already running
    if (await this.isAgentRunning()) {
      return { success: true };
    }

    // Check if binary exists
    if (await this.agentBinaryExists()) {
      return this.startAgent();
    }

    // Try to deploy
    const deployResult = await this.deployAgent();
    if (!deployResult.success) {
      return deployResult;
    }

    return this.startAgent();
  }

  private async isAgentRunning(): Promise<boolean> {
    try {
      const result = await this.exec(
        `nc -z 127.0.0.1 ${AGENT_PORT} 2>/dev/null && echo "running" || echo "not running"`
      );
      return result.trim() === 'running';
    } catch {
      return false;
    }
  }

  private async agentBinaryExists(): Promise<boolean> {
    try {
      const result = await this.exec(
        `test -f ${AGENT_PATH} && echo "exists" || echo "not found"`
      );
      return result.trim() === 'exists';
    } catch {
      return false;
    }
  }

  private async deployAgent(): Promise<DeployResult> {
    try {
      const platform = await this.detectPlatform();
      const arch = await this.detectArch();
      const key = `${platform}-${arch}`;

      const binaryName = AGENT_BINARIES[key];
      if (!binaryName) {
        return {
          success: false,
          needsManualInstall: true,
          error: `Unsupported platform: ${platform}-${arch}`,
        };
      }

      // Get bundled binary path
      const bundledPath = path.join(
        app.isPackaged
          ? path.join(process.resourcesPath, 'agent-binaries')
          : path.join(__dirname, '../../../../../remote-agent/dist'),
        binaryName
      );

      // Check if we have the binary
      try {
        await fs.access(bundledPath);
      } catch {
        return {
          success: false,
          needsManualInstall: true,
          error: `Agent binary not found for ${platform}-${arch}`,
        };
      }

      // Create remote directories
      await this.exec('mkdir -p ~/.superset/bin ~/.superset/logs');

      // Get home directory
      const homeDir = (await this.exec('echo $HOME')).trim();
      const remotePath = `${homeDir}/.superset/bin/superset-agent`;

      // Upload via SFTP
      await this.uploadFile(bundledPath, remotePath);

      // Make executable
      await this.exec(`chmod +x ${remotePath}`);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        needsManualInstall: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async startAgent(): Promise<DeployResult> {
    try {
      await this.exec(
        `nohup ${AGENT_PATH} > ~/.superset/logs/agent.log 2>&1 & ` +
        `sleep 0.5 && nc -z 127.0.0.1 ${AGENT_PORT}`
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async detectPlatform(): Promise<string> {
    const result = await this.exec('uname -s');
    return result.trim().toLowerCase();
  }

  private async detectArch(): Promise<string> {
    const result = await this.exec('uname -m');
    const arch = result.trim();
    if (arch === 'x86_64' || arch === 'amd64') return 'x64';
    if (arch === 'aarch64' || arch === 'arm64') return 'arm64';
    return arch;
  }

  private async uploadFile(localPath: string, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          reject(err);
          return;
        }

        sftp.fastPut(localPath, remotePath, (err) => {
          sftp.end();
          err ? reject(err) : resolve();
        });
      });
    });
  }

  private async exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, channel) => {
        if (err) {
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        channel.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        channel.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        channel.on('close', (code: number) => {
          code === 0 ? resolve(stdout) : reject(new Error(stderr || `Exit code ${code}`));
        });
      });
    });
  }
}
```

### Manual Install Script

Hosted at `https://superset.sh/install-agent`:

```bash
#!/bin/bash
set -e

VERSION="1.0.0"
INSTALL_DIR="$HOME/.superset/bin"
AGENT_BIN="$INSTALL_DIR/superset-agent"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

case "$OS" in
  linux|darwin) ;;
  *) echo "Unsupported OS: $OS"; exit 1 ;;
esac

URL="https://github.com/superset-sh/superset/releases/download/agent-v${VERSION}/superset-agent-${OS}-${ARCH}"

echo "Installing Superset Agent v${VERSION}..."
echo "Platform: ${OS}-${ARCH}"

mkdir -p "$INSTALL_DIR" "$HOME/.superset/logs"

echo "Downloading..."
curl -fsSL "$URL" -o "$AGENT_BIN"
chmod +x "$AGENT_BIN"

echo ""
echo "✓ Installed to $AGENT_BIN"
echo ""
echo "The agent will start automatically when you connect from Superset."
```

---

## Using Operations in tRPC Routers

With this architecture, routers become thin and transport-agnostic:

```typescript
// apps/desktop/src/lib/trpc/routers/changes/status.ts

import { z } from 'zod';
import { publicProcedure, router } from '../..';
import { getOperations } from 'main/lib/operations';

export const createStatusRouter = () => {
  return router({
    // Works for BOTH local and remote projects!
    getStatus: publicProcedure
      .input(z.object({
        projectId: z.string(),
        repoPath: z.string(),
      }))
      .query(async ({ input }) => {
        const ops = getOperations(input.projectId);
        return ops.git.status(input.repoPath);
      }),

    getDiff: publicProcedure
      .input(z.object({
        projectId: z.string(),
        repoPath: z.string(),
        staged: z.boolean().optional(),
        file: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const ops = getOperations(input.projectId);
        return ops.git.diff(input.repoPath, {
          staged: input.staged,
          file: input.file,
        });
      }),

    stage: publicProcedure
      .input(z.object({
        projectId: z.string(),
        repoPath: z.string(),
        files: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        const ops = getOperations(input.projectId);
        await ops.git.stage(input.repoPath, input.files);
        return { success: true };
      }),

    unstage: publicProcedure
      .input(z.object({
        projectId: z.string(),
        repoPath: z.string(),
        files: z.array(z.string()),
      }))
      .mutation(async ({ input }) => {
        const ops = getOperations(input.projectId);
        await ops.git.unstage(input.repoPath, input.files);
        return { success: true };
      }),

    commit: publicProcedure
      .input(z.object({
        projectId: z.string(),
        repoPath: z.string(),
        message: z.string(),
      }))
      .mutation(async ({ input }) => {
        const ops = getOperations(input.projectId);
        return ops.git.commit(input.repoPath, input.message);
      }),
  });
};
```

---

## Developer Workflow: Adding New Operations

### Step 1: Add to Interface

```typescript
// packages/core/src/operations/git/types.ts
export interface IGitOperations {
  // ... existing methods
  
  cherryPick(repoPath: string, commit: string): Promise<void>;
  rebase(repoPath: string, onto: string): Promise<void>;
  stash(repoPath: string): Promise<{ id: string }>;
  stashPop(repoPath: string): Promise<void>;
}
```

### Step 2: Implement Locally

```typescript
// packages/core/src/operations/git/local.ts
export class LocalGitOperations implements IGitOperations {
  // ... existing methods
  
  async cherryPick(repoPath: string, commit: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.raw(['cherry-pick', commit]);
  }
  
  async rebase(repoPath: string, onto: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.rebase([onto]);
  }
  
  async stash(repoPath: string): Promise<{ id: string }> {
    const git = simpleGit(repoPath);
    await git.stash();
    const list = await git.stashList();
    return { id: list.latest?.hash || 'stash@{0}' };
  }
  
  async stashPop(repoPath: string): Promise<void> {
    const git = simpleGit(repoPath);
    await git.stash(['pop']);
  }
}
```

### Step 3: Use It (Done!)

```typescript
// In any router, component, or service
const ops = getOperations(projectId);
await ops.git.cherryPick(repoPath, commitHash);

// That's it! No additional code needed for:
// ❌ RPC handler registration
// ❌ RPC client methods
// ❌ Agent updates
// ❌ Transport logic

// The Proxy pattern handles it all automatically!
```

---

## Data Model Updates

### Project Schema

```typescript
// packages/local-db/src/schema/projects.ts

export interface RemoteConfig {
  host: string;
  port: number;
  username: string;
  sshKeyId: string;
  agentPort: number;
  remotePath: string;
}

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  mainRepoPath: text('main_repo_path').notNull(),
  defaultBranch: text('default_branch'),
  color: text('color').notNull().default('#6366f1'),
  
  // Remote configuration (null = local project)
  remoteConfig: text('remote_config', { mode: 'json' }).$type<RemoteConfig | null>(),
  
  tabOrder: integer('tab_order'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastOpenedAt: integer('last_opened_at', { mode: 'timestamp' }),
});
```

### SSH Keys Schema

```typescript
// packages/local-db/src/schema/ssh-keys.ts

export const sshKeys = sqliteTable('ssh_keys', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  encryptedPrivateKey: blob('encrypted_private_key').notNull(),
  publicKey: text('public_key'),
  fingerprint: text('fingerprint').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

---

## Implementation Phases

| Phase | Scope | Effort | Can Ship Independently? |
|-------|-------|--------|------------------------|
| **1** | Create `packages/core` with interfaces + local impls | 2-3 days | ✅ Yes - improves code organization |
| **2** | Refactor existing routers to use `getOperations()` | 2-3 days | ✅ Yes - pure refactor |
| **3** | Add `packages/remote-agent` with RPC server | 1-2 days | ❌ No - needs Phase 4 |
| **4** | Add SSH transport + connection manager | 2-3 days | ❌ No - needs Phase 3 |
| **5** | Agent auto-deployment | 1 day | ❌ No - needs Phase 3-4 |
| **6** | Data model updates + migration | 1 day | ❌ No - needs Phase 4 |
| **7** | UI: Add Remote Project dialog | 2 days | ❌ No - needs Phase 6 |
| **8** | UI: Connection status indicators | 1 day | ❌ No - needs Phase 7 |
| **9** | Testing + polish | 2-3 days | ❌ No |

**Total: ~2-3 weeks**

**Key insight**: Phases 1-2 can ship immediately as pure code organization improvements, even before any remote functionality exists.

---

## Security Considerations

1. **SSH Keys**: Encrypted using Electron's `safeStorage` API (OS keychain)
2. **Agent Binding**: Only listens on `127.0.0.1` (localhost)
3. **Transport**: All communication over SSH tunnel
4. **No Password Auth**: SSH key-based authentication only
5. **Path Validation**: Agent validates paths to prevent traversal attacks

---

## Future Enhancements

1. **Agent Auto-Update**: Desktop checks agent version, re-deploys if outdated
2. **Multi-hop SSH**: Support for jump hosts / bastion servers
3. **Port Forwarding**: Forward dev server ports to local machine
4. **File Sync**: Selective sync for offline work
5. **SSH Config Import**: Read hosts from `~/.ssh/config`
6. **Connection Pooling**: Reuse SSH connections across projects on same host
