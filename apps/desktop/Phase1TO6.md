# Plan View: Phases 1-6 Technical Specification

This document provides detailed technical specifications, UX polish requirements, and validation criteria for Phases 1-6 of the Plan View implementation.

---

## Table of Contents

1. [Phase 1: UI Foundation & Navigation](#phase-1-ui-foundation--navigation)
2. [Phase 2: Database Schema](#phase-2-database-schema)
3. [Phase 3: tRPC Router Structure](#phase-3-trpc-router-structure)
4. [Phase 4: Kanban Board UI](#phase-4-kanban-board-ui)
5. [Phase 5: Task Execution Engine](#phase-5-task-execution-engine)
6. [Phase 6: Orchestration Chat](#phase-6-orchestration-chat)

---

## Phase 1: UI Foundation & Navigation

### 1.1 Overview

Add the Plan view as a first-class navigation destination in the desktop app, accessible from the sidebar.

### 1.2 Technical Specifications

#### 1.2.1 App State Changes

**File**: `apps/desktop/src/renderer/stores/app-state.ts`

```typescript
// Add to AppView union type
export type AppView = "workspace" | "settings" | "tasks" | "workspaces-list" | "plan";

// Add to AppState interface
interface AppState {
  // ... existing fields
  isPlanViewOpen: boolean;
  openPlan: () => void;
  closePlan: () => void;
}

// Add actions in store
openPlan: () => {
  set({ currentView: "plan", isPlanViewOpen: true });
},
closePlan: () => {
  set({ currentView: "workspace", isPlanViewOpen: false });
},

// Add convenience hooks
export const useOpenPlan = () => useAppStore((state) => state.openPlan);
export const useClosePlan = () => useAppStore((state) => state.closePlan);
export const useIsPlanViewOpen = () => useAppStore((state) => state.isPlanViewOpen);
```

#### 1.2.2 Sidebar Button Addition

**File**: `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx`

**Position**: Above "Workspaces" button, below "Toggle Sidebar"

**Requirements**:
- Icon: `LuClipboardList` from `react-icons/lu`
- Tooltip: "Plan" (show on hover)
- Active state: Highlighted when `currentView === "plan"`
- Click handler: Call `openPlan()`

#### 1.2.3 PlanView Component Structure

**Directory**: `apps/desktop/src/renderer/screens/main/components/PlanView/`

```
PlanView/
├── PlanView.tsx              # Main container with ResizablePanelGroup
├── index.ts                  # Barrel export
├── components/
│   ├── KanbanBoard/          # Drag-drop task board
│   │   ├── KanbanBoard.tsx   # Board container with columns
│   │   ├── KanbanColumn.tsx  # Single column with drop zone
│   │   ├── TaskCard.tsx      # Draggable task card
│   │   └── index.ts
│   ├── OrchestrationChat/    # AI chat panel
│   │   ├── OrchestrationChat.tsx  # Chat container
│   │   ├── ChatMessage.tsx        # Message renderer
│   │   ├── ChatInput.tsx          # Input with suggestions
│   │   ├── ToolCallDisplay.tsx    # Show tool executions
│   │   └── index.ts
│   ├── TaskDetailPanel/      # Slide-over for task details
│   │   ├── TaskDetailPanel.tsx
│   │   ├── ExecutionOutput.tsx    # Live output stream
│   │   ├── TaskMetadata.tsx       # Priority, status, links
│   │   └── index.ts
│   ├── CreateTaskDialog/     # Create local task modal
│   │   └── CreateTaskDialog.tsx
│   └── PlanHeader/           # Header with actions
│       ├── PlanHeader.tsx
│       └── index.ts
├── hooks/
│   ├── usePlanTasks.ts       # Task management hook
│   ├── useTaskExecution.ts   # Execution subscriptions
│   └── useChatMessages.ts    # Chat state management
└── stores/
    └── plan-view-state.ts    # Local UI state (selected task, panel sizes, etc.)
```

#### 1.2.4 Main Screen Integration

**File**: `apps/desktop/src/renderer/screens/main/index.tsx`

```typescript
const renderContent = () => {
  if (currentView === "settings") return <SettingsView />;
  if (currentView === "tasks" && hasTasksAccess) return <TasksView />;
  if (currentView === "workspaces-list") return <WorkspacesListView />;
  if (currentView === "plan") return <PlanView />;
  return <WorkspaceView />;
};
```

### 1.3 UX Polish Requirements

| Requirement | Description | Priority |
|-------------|-------------|----------|
| Smooth transition | Fade/slide animation when switching to Plan view | High |
| Keyboard shortcut | `Cmd+Shift+P` to toggle Plan view | Medium |
| Context preservation | Remember selected task when switching away and back | High |
| Loading state | Skeleton UI while plan data loads | High |
| Empty state | Friendly message when no tasks exist | High |
| Responsive layout | Panels resize properly on window resize | High |

### 1.4 Validation Criteria

#### 1.4.1 Manual Testing Checklist

- [ ] Click Plan button in sidebar → Plan view opens
- [ ] Click back arrow → Returns to previous view
- [ ] Plan button shows active state when Plan view is open
- [ ] Tooltip appears on Plan button hover
- [ ] View persists across app refresh (if plan was open)
- [ ] No console errors when navigating to/from Plan view

#### 1.4.2 Unit Tests

**File**: `apps/desktop/src/renderer/stores/app-state.test.ts`

```typescript
describe("Plan View Navigation", () => {
  it("should set currentView to 'plan' when openPlan is called", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.openPlan());
    expect(result.current.currentView).toBe("plan");
    expect(result.current.isPlanViewOpen).toBe(true);
  });

  it("should return to workspace view when closePlan is called", () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.openPlan());
    act(() => result.current.closePlan());
    expect(result.current.currentView).toBe("workspace");
    expect(result.current.isPlanViewOpen).toBe(false);
  });
});
```

#### 1.4.3 Integration Tests

**File**: `apps/desktop/src/renderer/screens/main/components/PlanView/PlanView.test.tsx`

```typescript
describe("PlanView", () => {
  it("should render kanban board and chat panels", () => {
    render(<PlanView />);
    expect(screen.getByTestId("kanban-board")).toBeInTheDocument();
    expect(screen.getByTestId("orchestration-chat")).toBeInTheDocument();
  });

  it("should show empty state when no tasks exist", () => {
    render(<PlanView />);
    expect(screen.getByText(/no tasks/i)).toBeInTheDocument();
  });

  it("should show loading skeleton while fetching", () => {
    // Mock loading state
    render(<PlanView />);
    expect(screen.getByTestId("plan-loading-skeleton")).toBeInTheDocument();
  });
});
```

---

## Phase 2: Database Schema

### 2.1 Overview

Define the SQLite schema for plans, tasks, execution logs, agent memory, and orchestration messages.

### 2.2 Technical Specifications

#### 2.2.1 Schema Types

**File**: `packages/local-db/src/schema/types.ts`

```typescript
export type PlanStatus = "draft" | "running" | "paused" | "completed";
export type PlanTaskStatus = "backlog" | "queued" | "running" | "completed" | "failed";
export type ExecutionStatus = "pending" | "creating_worktree" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";
export type LogType = "output" | "tool_use" | "error" | "progress" | "system";
export type MessageRole = "user" | "assistant" | "system" | "tool";
```

#### 2.2.2 Plans Table

**File**: `packages/local-db/src/schema/schema.ts`

```typescript
export const plans = sqliteTable("plans", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  projectId: text("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Plan"),
  description: text("description"),
  status: text("status").$type<PlanStatus>().notNull().default("draft"),

  // Configuration
  maxConcurrentTasks: integer("max_concurrent_tasks").notNull().default(10),
  autoStartQueued: integer("auto_start_queued", { mode: "boolean" }).notNull().default(false),

  // Timestamps
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
});
```

#### 2.2.3 Plan Tasks Table

```typescript
export const planTasks = sqliteTable("plan_tasks", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  planId: text("plan_id").notNull()
    .references(() => plans.id, { onDelete: "cascade" }),

  // Task content
  title: text("title").notNull(),
  description: text("description"),
  instructions: text("instructions"),  // Detailed instructions for Claude

  // Status & ordering
  status: text("status").$type<PlanTaskStatus>().notNull().default("backlog"),
  priority: text("priority").$type<TaskPriority>().notNull().default("medium"),
  columnOrder: integer("column_order").notNull().default(0),

  // Execution tracking
  workspaceId: text("workspace_id").references(() => workspaces.id),
  worktreeId: text("worktree_id").references(() => worktrees.id),
  executionStatus: text("execution_status").$type<ExecutionStatus>(),
  executionStartedAt: integer("execution_started_at"),
  executionCompletedAt: integer("execution_completed_at"),
  executionError: text("execution_error"),

  // Output tracking
  lastOutputAt: integer("last_output_at"),
  outputLineCount: integer("output_line_count").default(0),

  // Dependencies (future: task dependencies)
  dependsOn: text("depends_on", { mode: "json" }).$type<string[]>(),

  // External sync (Linear, GitHub Issues, etc.)
  externalProvider: text("external_provider"),  // "linear" | "github"
  externalId: text("external_id"),
  externalUrl: text("external_url"),
  externalSyncedAt: integer("external_synced_at"),

  // Timestamps
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
}, (table) => ({
  planIdIdx: index("plan_tasks_plan_id_idx").on(table.planId),
  statusIdx: index("plan_tasks_status_idx").on(table.status),
  externalIdx: index("plan_tasks_external_idx").on(table.externalProvider, table.externalId),
}));
```

#### 2.2.4 Execution Logs Table

```typescript
export const executionLogs = sqliteTable("execution_logs", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  taskId: text("task_id").notNull()
    .references(() => planTasks.id, { onDelete: "cascade" }),

  type: text("type").$type<LogType>().notNull(),
  content: text("content").notNull(),

  // For tool calls
  toolName: text("tool_name"),
  toolInput: text("tool_input", { mode: "json" }),
  toolOutput: text("tool_output", { mode: "json" }),

  timestamp: integer("timestamp").notNull().$defaultFn(() => Date.now()),
}, (table) => ({
  taskIdIdx: index("execution_logs_task_id_idx").on(table.taskId),
  timestampIdx: index("execution_logs_timestamp_idx").on(table.timestamp),
}));
```

#### 2.2.5 Agent Memory Table

```typescript
export const agentMemory = sqliteTable("agent_memory", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  projectId: text("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),

  // Memory key-value
  key: text("key").notNull(),
  value: text("value").notNull(),

  // Metadata
  source: text("source"),  // "orchestrator" | "task:${taskId}" | "user"
  importance: integer("importance").default(0),  // For pruning old memories

  // Timestamps
  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at").notNull().$defaultFn(() => Date.now()),
  expiresAt: integer("expires_at"),  // Optional TTL
}, (table) => ({
  projectKeyIdx: uniqueIndex("agent_memory_project_key_idx").on(table.projectId, table.key),
}));
```

#### 2.2.6 Orchestration Messages Table

```typescript
export const orchestrationMessages = sqliteTable("orchestration_messages", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  projectId: text("project_id").notNull()
    .references(() => projects.id, { onDelete: "cascade" }),

  // Message content
  role: text("role").$type<MessageRole>().notNull(),
  content: text("content").notNull(),

  // For tool calls/results
  toolCalls: text("tool_calls", { mode: "json" }).$type<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }[]>(),
  toolResults: text("tool_results", { mode: "json" }).$type<{
    callId: string;
    result: unknown;
    isError?: boolean;
  }[]>(),

  // Streaming state
  isStreaming: integer("is_streaming", { mode: "boolean" }).default(false),

  createdAt: integer("created_at").notNull().$defaultFn(() => Date.now()),
}, (table) => ({
  projectIdIdx: index("orchestration_messages_project_id_idx").on(table.projectId),
  createdAtIdx: index("orchestration_messages_created_at_idx").on(table.createdAt),
}));
```

#### 2.2.7 Relations

**File**: `packages/local-db/src/schema/relations.ts`

```typescript
export const plansRelations = relations(plans, ({ one, many }) => ({
  project: one(projects, {
    fields: [plans.projectId],
    references: [projects.id],
  }),
  tasks: many(planTasks),
}));

export const planTasksRelations = relations(planTasks, ({ one, many }) => ({
  plan: one(plans, {
    fields: [planTasks.planId],
    references: [plans.id],
  }),
  workspace: one(workspaces, {
    fields: [planTasks.workspaceId],
    references: [workspaces.id],
  }),
  worktree: one(worktrees, {
    fields: [planTasks.worktreeId],
    references: [worktrees.id],
  }),
  logs: many(executionLogs),
}));

export const executionLogsRelations = relations(executionLogs, ({ one }) => ({
  task: one(planTasks, {
    fields: [executionLogs.taskId],
    references: [planTasks.id],
  }),
}));
```

### 2.3 UX Considerations

| Consideration | Implementation |
|---------------|----------------|
| Fast queries | Add indexes on frequently queried columns |
| Cascade deletes | Clean up related data when plan/task deleted |
| Soft deletes | Consider `deletedAt` column for undo functionality |
| Data migration | Handle schema changes gracefully |

### 2.4 Validation Criteria

#### 2.4.1 Schema Validation

```bash
# Generate and apply migrations
cd packages/local-db
bun run db:generate
bun run db:push

# Verify tables exist
sqlite3 ~/.superset/local.db ".tables" | grep -E "plans|plan_tasks|execution_logs"
```

#### 2.4.2 Unit Tests

**File**: `packages/local-db/src/schema/schema.test.ts`

```typescript
describe("Plan Schema", () => {
  it("should create plan with default values", async () => {
    const plan = await db.insert(plans).values({
      projectId: "test-project",
    }).returning();

    expect(plan[0].status).toBe("draft");
    expect(plan[0].name).toBe("Plan");
    expect(plan[0].maxConcurrentTasks).toBe(10);
  });

  it("should cascade delete tasks when plan is deleted", async () => {
    const plan = await db.insert(plans).values({ projectId: "test-project" }).returning();
    await db.insert(planTasks).values({ planId: plan[0].id, title: "Test" });

    await db.delete(plans).where(eq(plans.id, plan[0].id));

    const tasks = await db.select().from(planTasks).where(eq(planTasks.planId, plan[0].id));
    expect(tasks).toHaveLength(0);
  });

  it("should enforce unique project-key constraint on agent_memory", async () => {
    await db.insert(agentMemory).values({ projectId: "p1", key: "k1", value: "v1" });

    await expect(
      db.insert(agentMemory).values({ projectId: "p1", key: "k1", value: "v2" })
    ).rejects.toThrow(/UNIQUE constraint/);
  });
});
```

---

## Phase 3: tRPC Router Structure

### 3.1 Overview

Create type-safe tRPC procedures for plan management, task operations, and execution control.

### 3.2 Technical Specifications

#### 3.2.1 Router Organization

**Directory**: `apps/desktop/src/lib/trpc/routers/plan/`

```
plan/
├── index.ts                    # Barrel exports
├── plan.ts                     # Merge all procedure routers
├── procedures/
│   ├── crud.ts                 # Plan CRUD operations
│   ├── tasks.ts                # Task CRUD, move, reorder, bulk operations
│   ├── execution.ts            # Start, stop, pause, resume, subscriptions
│   └── memory.ts               # Agent memory operations
└── utils/
    ├── task-helpers.ts         # Task ordering, status transitions
    └── validation.ts           # Input validation schemas
```

#### 3.2.2 CRUD Procedures

**File**: `apps/desktop/src/lib/trpc/routers/plan/procedures/crud.ts`

```typescript
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { plans, planTasks } from "@superset/local-db";
import { eq, and, desc } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

const createPlanInput = z.object({
  projectId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  maxConcurrentTasks: z.number().min(1).max(100).optional(),
});

const updatePlanInput = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "running", "paused", "completed"]).optional(),
  maxConcurrentTasks: z.number().min(1).max(100).optional(),
});

export const createPlanCrudProcedures = () => {
  return router({
    create: publicProcedure
      .input(createPlanInput)
      .mutation(async ({ input }) => {
        const result = localDb.insert(plans).values(input).returning().get();
        return result;
      }),

    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        return localDb.select().from(plans).where(eq(plans.id, input.id)).get();
      }),

    getAll: publicProcedure.query(() => {
      return localDb.select().from(plans).orderBy(desc(plans.createdAt)).all();
    }),

    getByProject: publicProcedure
      .input(z.object({ projectId: z.string() }))
      .query(({ input }) => {
        return localDb
          .select()
          .from(plans)
          .where(eq(plans.projectId, input.projectId))
          .orderBy(desc(plans.createdAt))
          .all();
      }),

    getActiveByProject: publicProcedure
      .input(z.object({ projectId: z.string() }))
      .query(({ input }) => {
        // Get the most recent non-completed plan, or create one if none exists
        const plan = localDb
          .select()
          .from(plans)
          .where(
            and(
              eq(plans.projectId, input.projectId),
              // Not completed status
            )
          )
          .orderBy(desc(plans.createdAt))
          .get();
        return plan ?? null;
      }),

    update: publicProcedure
      .input(updatePlanInput)
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return localDb
          .update(plans)
          .set({ ...data, updatedAt: Date.now() })
          .where(eq(plans.id, id))
          .returning()
          .get();
      }),

    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        localDb.delete(plans).where(eq(plans.id, input.id)).run();
        return { success: true };
      }),
  });
};
```

#### 3.2.3 Task Procedures

**File**: `apps/desktop/src/lib/trpc/routers/plan/procedures/tasks.ts`

```typescript
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { planTasks } from "@superset/local-db";
import { eq, and, gt, sql } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

const createTaskInput = z.object({
  planId: z.string(),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  instructions: z.string().optional(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  externalProvider: z.string().optional(),
  externalId: z.string().optional(),
  externalUrl: z.string().url().optional(),
});

const updateTaskInput = z.object({
  id: z.string(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
});

const moveTaskInput = z.object({
  id: z.string(),
  status: z.enum(["backlog", "queued", "running", "completed", "failed"]),
  columnOrder: z.number(),
});

export const createPlanTaskProcedures = () => {
  return router({
    createTask: publicProcedure
      .input(createTaskInput)
      .mutation(({ input }) => {
        // Get max columnOrder for backlog column
        const maxOrder = localDb
          .select({ max: sql<number>`MAX(column_order)` })
          .from(planTasks)
          .where(and(eq(planTasks.planId, input.planId), eq(planTasks.status, "backlog")))
          .get();

        const columnOrder = (maxOrder?.max ?? -1) + 1;

        return localDb
          .insert(planTasks)
          .values({ ...input, columnOrder, status: "backlog" })
          .returning()
          .get();
      }),

    updateTask: publicProcedure
      .input(updateTaskInput)
      .mutation(({ input }) => {
        const { id, ...data } = input;
        return localDb
          .update(planTasks)
          .set({ ...data, updatedAt: Date.now() })
          .where(eq(planTasks.id, id))
          .returning()
          .get();
      }),

    moveTask: publicProcedure
      .input(moveTaskInput)
      .mutation(({ input }) => {
        const { id, status, columnOrder } = input;

        // Get the task's current plan
        const task = localDb.select().from(planTasks).where(eq(planTasks.id, id)).get();
        if (!task) throw new Error("Task not found");

        // Update orders of other tasks in the target column
        localDb
          .update(planTasks)
          .set({ columnOrder: sql`column_order + 1` })
          .where(
            and(
              eq(planTasks.planId, task.planId),
              eq(planTasks.status, status),
              gt(planTasks.columnOrder, columnOrder - 1)
            )
          )
          .run();

        // Move the task
        return localDb
          .update(planTasks)
          .set({ status, columnOrder, updatedAt: Date.now() })
          .where(eq(planTasks.id, id))
          .returning()
          .get();
      }),

    deleteTask: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        localDb.delete(planTasks).where(eq(planTasks.id, input.id)).run();
        return { success: true };
      }),

    getTasksByPlan: publicProcedure
      .input(z.object({ planId: z.string() }))
      .query(({ input }) => {
        const tasks = localDb
          .select()
          .from(planTasks)
          .where(eq(planTasks.planId, input.planId))
          .all();
        return { tasks };
      }),

    bulkCreate: publicProcedure
      .input(z.object({
        planId: z.string(),
        tasks: z.array(z.object({
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
          externalProvider: z.string().optional(),
          externalId: z.string().optional(),
          externalUrl: z.string().url().optional(),
        })),
      }))
      .mutation(({ input }) => {
        const { planId, tasks } = input;

        // Get current max order
        const maxOrder = localDb
          .select({ max: sql<number>`MAX(column_order)` })
          .from(planTasks)
          .where(and(eq(planTasks.planId, planId), eq(planTasks.status, "backlog")))
          .get();

        let order = (maxOrder?.max ?? -1) + 1;

        const created = tasks.map((task) => {
          const result = localDb
            .insert(planTasks)
            .values({ ...task, planId, columnOrder: order++, status: "backlog" })
            .returning()
            .get();
          return result;
        });

        return { tasks: created };
      }),
  });
};
```

#### 3.2.4 Execution Procedures

**File**: `apps/desktop/src/lib/trpc/routers/plan/procedures/execution.ts`

```typescript
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { planTasks, plans, projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { taskExecutionManager, type TaskExecutionProgress, type TaskExecutionOutput } from "main/lib/task-execution";

export const createExecutionProcedures = () => {
  return router({
    start: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .mutation(({ input }) => {
        const task = localDb.select().from(planTasks).where(eq(planTasks.id, input.taskId)).get();
        if (!task) throw new Error(`Task ${input.taskId} not found`);

        const plan = localDb.select().from(plans).where(eq(plans.id, task.planId)).get();
        if (!plan) throw new Error(`Plan ${task.planId} not found`);

        const project = localDb.select().from(projects).where(eq(projects.id, plan.projectId)).get();
        if (!project?.mainRepoPath) throw new Error("Project main repo path not found");

        // Update task status to queued
        localDb
          .update(planTasks)
          .set({ status: "queued", executionStatus: "pending", updatedAt: Date.now() })
          .where(eq(planTasks.id, input.taskId))
          .run();

        // Enqueue the task for execution
        taskExecutionManager.enqueue(task, plan.projectId, project.mainRepoPath);

        return { success: true };
      }),

    stop: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .mutation(({ input }) => {
        taskExecutionManager.cancel(input.taskId);

        localDb
          .update(planTasks)
          .set({ status: "backlog", executionStatus: null, updatedAt: Date.now() })
          .where(eq(planTasks.id, input.taskId))
          .run();

        return { success: true };
      }),

    pause: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .mutation(({ input }) => {
        taskExecutionManager.pause(input.taskId);
        return { success: true };
      }),

    resume: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .mutation(({ input }) => {
        taskExecutionManager.resume(input.taskId);
        return { success: true };
      }),

    getStatus: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .query(({ input }) => {
        return taskExecutionManager.getProgress(input.taskId) ?? null;
      }),

    getAllRunning: publicProcedure.query(() => {
      return taskExecutionManager.getAllProgress();
    }),

    getStats: publicProcedure.query(() => {
      return taskExecutionManager.getStats();
    }),

    setMaxConcurrent: publicProcedure
      .input(z.object({ count: z.number().min(1).max(100) }))
      .mutation(({ input }) => {
        taskExecutionManager.setMaxConcurrent(input.count);
        return { success: true, maxConcurrent: input.count };
      }),

    // Subscriptions (using observable pattern for trpc-electron)
    subscribeProgress: publicProcedure.subscription(() => {
      return observable<TaskExecutionProgress>((emit) => {
        const handler = (progress: TaskExecutionProgress) => emit.next(progress);
        taskExecutionManager.on("progress", handler);
        return () => taskExecutionManager.off("progress", handler);
      });
    }),

    subscribeOutput: publicProcedure
      .input(z.object({ taskId: z.string() }))
      .subscription(({ input }) => {
        return observable<TaskExecutionOutput>((emit) => {
          const handler = (output: TaskExecutionOutput) => emit.next(output);
          taskExecutionManager.on(`output:${input.taskId}`, handler);
          return () => taskExecutionManager.off(`output:${input.taskId}`, handler);
        });
      }),

    subscribeAllOutput: publicProcedure.subscription(() => {
      return observable<TaskExecutionOutput>((emit) => {
        const handler = (output: TaskExecutionOutput) => emit.next(output);
        taskExecutionManager.on("output", handler);
        return () => taskExecutionManager.off("output", handler);
      });
    }),
  });
};
```

### 3.3 UX Considerations

| Consideration | Implementation |
|---------------|----------------|
| Optimistic updates | Update UI immediately, revert on error |
| Loading states | Show spinners during mutations |
| Error handling | Toast notifications for failures |
| Real-time updates | Use subscriptions for live task status |
| Debouncing | Debounce rapid status updates |

### 3.4 Validation Criteria

#### 3.4.1 Integration Tests

**File**: `apps/desktop/src/lib/trpc/routers/plan/plan.test.ts`

```typescript
describe("Plan Router", () => {
  describe("CRUD", () => {
    it("should create a plan", async () => {
      const plan = await caller.plan.create({ projectId: "test-project" });
      expect(plan.id).toBeDefined();
      expect(plan.status).toBe("draft");
    });

    it("should get plan by project", async () => {
      await caller.plan.create({ projectId: "p1" });
      const plans = await caller.plan.getByProject({ projectId: "p1" });
      expect(plans.length).toBeGreaterThan(0);
    });
  });

  describe("Tasks", () => {
    it("should create and move tasks", async () => {
      const plan = await caller.plan.create({ projectId: "test-project" });
      const task = await caller.plan.createTask({ planId: plan.id, title: "Test" });

      expect(task.status).toBe("backlog");

      const moved = await caller.plan.moveTask({ id: task.id, status: "queued", columnOrder: 0 });
      expect(moved.status).toBe("queued");
    });

    it("should bulk create tasks", async () => {
      const plan = await caller.plan.create({ projectId: "test-project" });
      const { tasks } = await caller.plan.bulkCreate({
        planId: plan.id,
        tasks: [{ title: "Task 1" }, { title: "Task 2" }, { title: "Task 3" }],
      });

      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.columnOrder)).toEqual([0, 1, 2]);
    });
  });

  describe("Execution", () => {
    it("should start and stop task execution", async () => {
      // This requires mocking the task execution manager
      const plan = await caller.plan.create({ projectId: "test-project" });
      const task = await caller.plan.createTask({ planId: plan.id, title: "Test" });

      await caller.plan.start({ taskId: task.id });
      const status = await caller.plan.getStatus({ taskId: task.id });
      expect(status).toBeDefined();

      await caller.plan.stop({ taskId: task.id });
    });
  });
});
```

---

## Phase 4: Kanban Board UI

### 4.1 Overview

Create a polished, accessible drag-and-drop kanban board for task management.

### 4.2 Technical Specifications

#### 4.2.1 Component Architecture

```
KanbanBoard/
├── KanbanBoard.tsx       # Main board container
├── KanbanColumn.tsx      # Column with drop zone
├── TaskCard.tsx          # Draggable task card
├── TaskCardSkeleton.tsx  # Loading skeleton
├── EmptyColumn.tsx       # Empty state for columns
└── index.ts
```

#### 4.2.2 KanbanBoard Component

**File**: `apps/desktop/src/renderer/screens/main/components/PlanView/components/KanbanBoard/KanbanBoard.tsx`

```typescript
interface KanbanBoardProps {
  tasks: PlanTask[];
  onMoveTask: (taskId: string, status: PlanTaskStatus, columnOrder: number) => void;
  onDeleteTask: (taskId: string) => void;
  onStartTask: (taskId: string) => void;
  onStopTask: (taskId: string) => void;
  onSelectTask: (taskId: string) => void;
  selectedTaskId?: string;
  isLoading?: boolean;
}

const COLUMN_CONFIG = [
  { status: "backlog", title: "Backlog", color: "bg-muted", description: "Tasks waiting to be worked on" },
  { status: "queued", title: "Queued", color: "bg-yellow-500", description: "Tasks waiting for a slot" },
  { status: "running", title: "Running", color: "bg-blue-500", description: "Currently executing" },
  { status: "completed", title: "Completed", color: "bg-green-500", description: "Successfully finished" },
  { status: "failed", title: "Failed", color: "bg-red-500", description: "Needs attention" },
] as const;
```

#### 4.2.3 Drag and Drop Implementation

Using HTML5 Drag API with proper accessibility:

```typescript
// TaskCard drag handlers
const handleDragStart = (e: React.DragEvent) => {
  e.dataTransfer.setData("application/json", JSON.stringify({
    taskId: task.id,
    sourceStatus: task.status,
    sourceOrder: task.columnOrder,
  }));
  e.dataTransfer.effectAllowed = "move";

  // Add visual feedback
  e.currentTarget.classList.add("opacity-50", "scale-95");
};

const handleDragEnd = (e: React.DragEvent) => {
  e.currentTarget.classList.remove("opacity-50", "scale-95");
};

// KanbanColumn drop handlers
const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";

  // Add drop indicator
  setIsDragOver(true);
};

const handleDragLeave = (e: React.DragEvent) => {
  // Only trigger if leaving the column, not entering a child
  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
    setIsDragOver(false);
  }
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  setIsDragOver(false);

  try {
    const data = JSON.parse(e.dataTransfer.getData("application/json"));
    onMoveTask(data.taskId, status, calculateDropPosition(e));
  } catch {
    console.error("[kanban] Failed to parse drop data");
  }
};
```

#### 4.2.4 TaskCard Component

```typescript
interface TaskCardProps {
  task: PlanTask;
  isSelected?: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onStart: () => void;
  onStop: () => void;
}

const priorityConfig = {
  urgent: { color: "bg-red-500", label: "Urgent" },
  high: { color: "bg-orange-500", label: "High" },
  medium: { color: "bg-yellow-500", label: "Medium" },
  low: { color: "bg-blue-500", label: "Low" },
  none: { color: "bg-muted", label: "None" },
} as const;

const statusIcons = {
  backlog: null,
  queued: <LuClock className="size-3 text-yellow-500" />,
  running: <LuLoader className="size-3 text-blue-500 animate-spin" />,
  completed: <LuCheck className="size-3 text-green-500" />,
  failed: <LuAlertCircle className="size-3 text-red-500" />,
} as const;
```

### 4.3 UX Polish Requirements

| Feature | Implementation | Priority |
|---------|----------------|----------|
| Drag preview | Ghost card follows cursor | High |
| Drop indicator | Visual line where card will be placed | High |
| Column highlight | Subtle highlight when dragging over | High |
| Smooth animations | 150ms transitions on move | High |
| Keyboard support | Tab navigation, Enter to select | Medium |
| Task count badges | Show count per column | High |
| Priority sorting | Sort within column by priority | Medium |
| Selection state | Clear highlight for selected task | High |
| Hover actions | Show action buttons on hover | High |
| Loading skeleton | Pulse animation while loading | High |
| Error recovery | Show toast on failed operations | High |
| Undo support | Undo last move action | Medium |

#### 4.3.1 Animation Specifications

```css
/* Smooth drag transitions */
.task-card {
  transition: transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease;
}

.task-card.is-dragging {
  opacity: 0.5;
  transform: scale(0.95);
}

.task-card.is-over {
  transform: translateY(2px);
}

/* Column drop indicator */
.column.is-drag-over {
  background: rgba(var(--primary), 0.05);
  border-color: rgba(var(--primary), 0.3);
}

/* Drop position indicator */
.drop-indicator {
  height: 2px;
  background: var(--primary);
  border-radius: 1px;
  animation: pulse 1s infinite;
}
```

#### 4.3.2 Accessibility Requirements

```typescript
// Keyboard navigation
const handleKeyDown = (e: React.KeyboardEvent) => {
  switch (e.key) {
    case "Enter":
    case " ":
      onSelect();
      break;
    case "Delete":
    case "Backspace":
      if (e.shiftKey) onDelete();
      break;
    case "ArrowLeft":
      // Move to previous column (if applicable)
      break;
    case "ArrowRight":
      // Move to next column (if applicable)
      break;
  }
};

// ARIA attributes
<div
  role="listitem"
  aria-selected={isSelected}
  aria-label={`Task: ${task.title}, Priority: ${task.priority}, Status: ${task.status}`}
  tabIndex={0}
  onKeyDown={handleKeyDown}
>
```

### 4.4 Validation Criteria

#### 4.4.1 Manual Testing Checklist

- [ ] Drag task from Backlog to Queued → Task moves, order preserved
- [ ] Drag task to new position in same column → Reordering works
- [ ] Drag task over non-droppable area → Returns to original position
- [ ] Click task → Task becomes selected, detail panel opens
- [ ] Hover over task → Action buttons appear
- [ ] Click Start on backlog task → Task moves to Queued, starts execution
- [ ] Click Stop on running task → Task moves to Backlog
- [ ] Resize window → Columns remain usable, no overflow
- [ ] Scroll within column → Long task lists scroll properly
- [ ] Delete task → Confirmation, task removed with animation

#### 4.4.2 Component Tests

**File**: `apps/desktop/src/renderer/screens/main/components/PlanView/components/KanbanBoard/KanbanBoard.test.tsx`

```typescript
describe("KanbanBoard", () => {
  const mockTasks = [
    { id: "1", title: "Task 1", status: "backlog", priority: "high", columnOrder: 0 },
    { id: "2", title: "Task 2", status: "running", priority: "medium", columnOrder: 0 },
  ];

  it("should render all columns", () => {
    render(<KanbanBoard tasks={mockTasks} {...mockHandlers} />);

    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("should group tasks by status", () => {
    render(<KanbanBoard tasks={mockTasks} {...mockHandlers} />);

    const backlogColumn = screen.getByTestId("column-backlog");
    expect(within(backlogColumn).getByText("Task 1")).toBeInTheDocument();

    const runningColumn = screen.getByTestId("column-running");
    expect(within(runningColumn).getByText("Task 2")).toBeInTheDocument();
  });

  it("should call onMoveTask when task is dropped", async () => {
    const onMoveTask = vi.fn();
    render(<KanbanBoard tasks={mockTasks} onMoveTask={onMoveTask} {...mockHandlers} />);

    const task = screen.getByText("Task 1");
    const queuedColumn = screen.getByTestId("column-queued");

    // Simulate drag and drop
    fireEvent.dragStart(task);
    fireEvent.dragOver(queuedColumn);
    fireEvent.drop(queuedColumn);

    expect(onMoveTask).toHaveBeenCalledWith("1", "queued", expect.any(Number));
  });

  it("should show loading skeleton when isLoading is true", () => {
    render(<KanbanBoard tasks={[]} isLoading {...mockHandlers} />);
    expect(screen.getAllByTestId("task-skeleton")).toHaveLength(5); // One per column
  });
});
```

#### 4.4.3 Visual Regression Tests

```typescript
describe("KanbanBoard Visual", () => {
  it("should match snapshot with tasks", async () => {
    const { container } = render(<KanbanBoard tasks={mockTasks} {...mockHandlers} />);
    expect(container).toMatchSnapshot();
  });

  it("should match snapshot in loading state", async () => {
    const { container } = render(<KanbanBoard tasks={[]} isLoading {...mockHandlers} />);
    expect(container).toMatchSnapshot();
  });

  it("should match snapshot in empty state", async () => {
    const { container } = render(<KanbanBoard tasks={[]} {...mockHandlers} />);
    expect(container).toMatchSnapshot();
  });
});
```

---

## Phase 5: Task Execution Engine

### 5.1 Overview

Build a robust task execution system that manages concurrent Claude CLI processes with worktree isolation.

### 5.2 Technical Specifications

#### 5.2.1 Architecture Overview

```
task-execution/
├── manager.ts          # Singleton execution manager
├── executor.ts         # Single task executor
├── queue.ts            # Priority queue for pending tasks
├── output-buffer.ts    # Buffered output management
└── index.ts            # Barrel exports
```

#### 5.2.2 Task Execution Manager

**File**: `apps/desktop/src/main/lib/task-execution/manager.ts`

```typescript
import { EventEmitter } from "events";

export interface TaskExecutionProgress {
  taskId: string;
  status: ExecutionStatus;
  message: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskExecutionOutput {
  taskId: string;
  type: "output" | "error" | "progress" | "tool_use";
  content: string;
  timestamp: number;
  toolName?: string;
  toolInput?: unknown;
}

interface ExecutionJob {
  taskId: string;
  planId: string;
  projectId: string;
  mainRepoPath: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
  };
  cancelled: boolean;
  paused: boolean;
  abortController: AbortController;
  worktreeCreated: boolean;
  worktreePath?: string;
  worktreeId?: string;
  workspaceId?: string;
}

class TaskExecutionManager extends EventEmitter {
  private jobs = new Map<string, ExecutionJob>();
  private runningCount = 0;
  private maxConcurrent = 10;
  private queue: ExecutionJob[] = [];
  private projectLocks = new Map<string, Promise<void>>();

  // Enqueue a task for execution
  enqueue(
    task: { id: string; title: string; description: string | null; instructions: string | null; planId: string },
    projectId: string,
    mainRepoPath: string,
  ): void {
    const job: ExecutionJob = {
      taskId: task.id,
      planId: task.planId,
      projectId,
      mainRepoPath,
      task,
      cancelled: false,
      paused: false,
      abortController: new AbortController(),
      worktreeCreated: false,
    };

    this.jobs.set(task.id, job);

    if (this.runningCount < this.maxConcurrent) {
      this.startJob(job);
    } else {
      this.queue.push(job);
      this.updateProgress(task.id, "pending", "Waiting in queue...");
    }
  }

  private async startJob(job: ExecutionJob): Promise<void> {
    this.runningCount++;

    try {
      const { executeTask } = await import("./executor");
      await executeTask(job, this);
    } catch (error) {
      console.error(`[task-execution] Job ${job.taskId} failed:`, error);
    } finally {
      this.runningCount--;
      this.jobs.delete(job.taskId);
      this.processQueue();
    }
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.runningCount < this.maxConcurrent) {
      const nextJob = this.queue.shift();
      if (nextJob && !nextJob.cancelled) {
        this.startJob(nextJob);
      }
    }
  }

  cancel(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.cancelled = true;
      job.abortController.abort();
      this.updateProgress(taskId, "cancelled", "Task cancelled");
    }

    // Also remove from queue
    const queueIndex = this.queue.findIndex(j => j.taskId === taskId);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }
  }

  pause(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.paused = true;
      this.updateProgress(taskId, "paused", "Task paused");
    }
  }

  resume(taskId: string): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.paused = false;
      this.updateProgress(taskId, "running", "Task resumed");
    }
  }

  isCancelled(taskId: string): boolean {
    return this.jobs.get(taskId)?.cancelled ?? true;
  }

  isPaused(taskId: string): boolean {
    return this.jobs.get(taskId)?.paused ?? false;
  }

  // Project-level locking for git operations
  async acquireProjectLock(projectId: string): Promise<void> {
    while (this.projectLocks.has(projectId)) {
      await this.projectLocks.get(projectId);
    }

    let resolve: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    this.projectLocks.set(projectId, promise);

    // Auto-release after completion (caller should call release)
    return;
  }

  releaseProjectLock(projectId: string): void {
    this.projectLocks.delete(projectId);
  }

  updateProgress(taskId: string, status: ExecutionStatus, message: string, error?: string): void {
    const progress: TaskExecutionProgress = {
      taskId,
      status,
      message,
      error,
      startedAt: status === "running" ? Date.now() : undefined,
      completedAt: status === "completed" || status === "failed" ? Date.now() : undefined,
    };

    this.emit("progress", progress);
  }

  emitOutput(output: TaskExecutionOutput): void {
    this.emit(`output:${output.taskId}`, output);
    this.emit("output", output);
  }

  markWorktreeCreated(
    taskId: string,
    path: string,
    worktreeId: string,
    workspaceId: string,
  ): void {
    const job = this.jobs.get(taskId);
    if (job) {
      job.worktreeCreated = true;
      job.worktreePath = path;
      job.worktreeId = worktreeId;
      job.workspaceId = workspaceId;
    }
  }

  getWorktreeInfo(taskId: string): {
    created: boolean;
    path?: string;
    worktreeId?: string;
    workspaceId?: string;
  } {
    const job = this.jobs.get(taskId);
    return {
      created: job?.worktreeCreated ?? false,
      path: job?.worktreePath,
      worktreeId: job?.worktreeId,
      workspaceId: job?.workspaceId,
    };
  }

  getProgress(taskId: string): TaskExecutionProgress | undefined {
    // Return cached progress or query from job
    const job = this.jobs.get(taskId);
    if (!job) return undefined;

    return {
      taskId,
      status: job.cancelled ? "cancelled" : job.paused ? "paused" : "running",
      message: "Task in progress",
    };
  }

  getAllProgress(): TaskExecutionProgress[] {
    return Array.from(this.jobs.values()).map(job => ({
      taskId: job.taskId,
      status: job.cancelled ? "cancelled" : job.paused ? "paused" : "running",
      message: "Task in progress",
    }));
  }

  getStats(): {
    running: number;
    queued: number;
    maxConcurrent: number;
  } {
    return {
      running: this.runningCount,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  setMaxConcurrent(count: number): void {
    this.maxConcurrent = count;
    // Process queue in case we can now run more
    this.processQueue();
  }
}

export const taskExecutionManager = new TaskExecutionManager();
```

#### 5.2.3 Task Executor

**File**: `apps/desktop/src/main/lib/task-execution/executor.ts`

```typescript
import { join } from "node:path";
import { planTasks, projects, workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { localDb } from "main/lib/local-db";
import { createWorktree, getDefaultBranch, removeWorktree, generateBranchName } from "lib/trpc/routers/workspaces/utils/git";
import { copySupersetConfigToWorktree } from "lib/trpc/routers/workspaces/utils/setup";
import { taskExecutionManager, type TaskExecutionOutput } from "./manager";

export async function executeTask(
  job: ExecutionJob,
  manager: typeof taskExecutionManager,
): Promise<void> {
  const { taskId, projectId, task, mainRepoPath } = job;

  if (!mainRepoPath) {
    manager.updateProgress(taskId, "failed", "No main repository path found");
    return;
  }

  try {
    // Step 1: Acquire project lock for git operations
    await manager.acquireProjectLock(projectId);

    if (manager.isCancelled(taskId)) return;

    // Step 2: Create worktree
    manager.updateProgress(taskId, "creating_worktree", "Creating git worktree...");

    const worktreeResult = await createTaskWorktree({
      taskId,
      projectId,
      taskTitle: task.title,
      mainRepoPath,
      manager,
    });

    if (!worktreeResult) return;

    const { worktreePath, worktreeId, workspaceId, branch } = worktreeResult;

    // Update task with worktree info
    localDb
      .update(planTasks)
      .set({ worktreeId, workspaceId, executionStatus: "running", updatedAt: Date.now() })
      .where(eq(planTasks.id, taskId))
      .run();

    manager.markWorktreeCreated(taskId, worktreePath, worktreeId, workspaceId);
    manager.releaseProjectLock(projectId);

    if (manager.isCancelled(taskId)) {
      await cleanupWorktree(mainRepoPath, worktreePath);
      return;
    }

    // Step 3: Run Claude in the worktree
    manager.updateProgress(taskId, "running", "Running Claude...");

    const prompt = buildClaudePrompt(task);
    await runClaudeInWorktree({
      taskId,
      worktreePath,
      prompt,
      manager,
      abortSignal: job.abortController.signal,
    });

    if (manager.isCancelled(taskId)) return;

    // Step 4: Mark as completed
    manager.updateProgress(taskId, "completed", "Task completed successfully");

    localDb
      .update(planTasks)
      .set({ status: "completed", executionStatus: "completed", executionCompletedAt: Date.now(), updatedAt: Date.now() })
      .where(eq(planTasks.id, taskId))
      .run();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[task-execution] Task ${taskId} failed:`, errorMessage);

    manager.updateProgress(taskId, "failed", "Task failed", errorMessage);

    localDb
      .update(planTasks)
      .set({ status: "failed", executionStatus: "failed", executionError: errorMessage, updatedAt: Date.now() })
      .where(eq(planTasks.id, taskId))
      .run();

    // Cleanup worktree if created
    const worktreeInfo = manager.getWorktreeInfo(taskId);
    if (worktreeInfo.created && worktreeInfo.path) {
      await cleanupWorktree(mainRepoPath, worktreeInfo.path);
    }
  } finally {
    manager.releaseProjectLock(projectId);
  }
}

function buildClaudePrompt(task: { title: string; description: string | null; instructions: string | null }): string {
  let prompt = `# Task: ${task.title}\n\n`;

  if (task.description) {
    prompt += `## Description\n${task.description}\n\n`;
  }

  if (task.instructions) {
    prompt += `## Instructions\n${task.instructions}\n\n`;
  }

  prompt += `## Requirements
- Complete the task as described above
- Commit your changes with a descriptive commit message
- If you encounter any blockers, document them clearly
`;

  return prompt;
}

async function runClaudeInWorktree({
  taskId,
  worktreePath,
  prompt,
  manager,
  abortSignal,
}: {
  taskId: string;
  worktreePath: string;
  prompt: string;
  manager: typeof taskExecutionManager;
  abortSignal: AbortSignal;
}): Promise<void> {
  const { execa } = await import("execa");

  const emitOutput = (type: TaskExecutionOutput["type"], content: string): void => {
    manager.emitOutput({ taskId, type, content, timestamp: Date.now() });
  };

  emitOutput("progress", `Starting Claude in ${worktreePath}...`);

  const claudeProcess = execa("claude", ["-p", prompt], {
    cwd: worktreePath,
    signal: abortSignal,
    timeout: 30 * 60 * 1000, // 30 minute timeout
    reject: false,
  });

  // Stream stdout
  claudeProcess.stdout?.on("data", (data: Buffer) => {
    emitOutput("output", data.toString());
  });

  // Stream stderr
  claudeProcess.stderr?.on("data", (data: Buffer) => {
    emitOutput("error", data.toString());
  });

  const result = await claudeProcess;

  if (abortSignal.aborted) {
    emitOutput("progress", "Task was cancelled");
    return;
  }

  if (result.exitCode !== 0) {
    throw new Error(`Claude exited with code ${result.exitCode}: ${result.stderr || result.stdout || "Unknown error"}`);
  }

  emitOutput("progress", "Claude completed successfully");
}
```

### 5.3 UX Polish Requirements

| Feature | Implementation | Priority |
|---------|----------------|----------|
| Progress indicators | Real-time status updates in UI | High |
| Output streaming | Live terminal output in detail panel | High |
| Cancellation feedback | Immediate UI response on cancel | High |
| Error display | Clear error messages with retry option | High |
| Queue position | Show position in queue for waiting tasks | Medium |
| Execution stats | Show running/queued counts in header | Medium |
| Auto-scroll output | Scroll to bottom on new output | High |
| Copy output | Button to copy execution log | Medium |

### 5.4 Validation Criteria

#### 5.4.1 Manual Testing Checklist

- [ ] Start task → Worktree created, Claude starts running
- [ ] View running task → Output streams in real-time
- [ ] Stop running task → Process cancelled, task returns to backlog
- [ ] Start multiple tasks → Respects concurrency limit
- [ ] Task fails → Error displayed, task marked as failed
- [ ] Retry failed task → Starts fresh execution
- [ ] Cancel queued task → Removed from queue immediately
- [ ] Window close during execution → Process cleaned up properly

#### 5.4.2 Unit Tests

**File**: `apps/desktop/src/main/lib/task-execution/manager.test.ts`

```typescript
describe("TaskExecutionManager", () => {
  beforeEach(() => {
    // Reset manager state
  });

  it("should enqueue tasks up to max concurrent", () => {
    const manager = new TaskExecutionManager();
    manager.setMaxConcurrent(2);

    manager.enqueue(mockTask("1"), "project", "/path");
    manager.enqueue(mockTask("2"), "project", "/path");
    manager.enqueue(mockTask("3"), "project", "/path");

    const stats = manager.getStats();
    expect(stats.running).toBe(2);
    expect(stats.queued).toBe(1);
  });

  it("should cancel running task", async () => {
    const manager = new TaskExecutionManager();
    manager.enqueue(mockTask("1"), "project", "/path");

    manager.cancel("1");

    expect(manager.isCancelled("1")).toBe(true);
  });

  it("should emit progress events", async () => {
    const manager = new TaskExecutionManager();
    const progressHandler = vi.fn();
    manager.on("progress", progressHandler);

    manager.updateProgress("1", "running", "Test message");

    expect(progressHandler).toHaveBeenCalledWith({
      taskId: "1",
      status: "running",
      message: "Test message",
      startedAt: expect.any(Number),
    });
  });

  it("should acquire and release project locks", async () => {
    const manager = new TaskExecutionManager();

    await manager.acquireProjectLock("project1");
    // Should not block different project
    await manager.acquireProjectLock("project2");

    manager.releaseProjectLock("project1");
    manager.releaseProjectLock("project2");
  });
});
```

#### 5.4.3 Integration Tests

**File**: `apps/desktop/src/main/lib/task-execution/executor.test.ts`

```typescript
describe("Task Executor", () => {
  it("should create worktree and run Claude", async () => {
    // Mock execa and git utilities
    const mockExeca = vi.fn().mockResolvedValue({ exitCode: 0 });
    vi.mock("execa", () => ({ execa: mockExeca }));

    await executeTask(mockJob, taskExecutionManager);

    expect(mockExeca).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["-p"]),
      expect.objectContaining({ cwd: expect.stringContaining("worktrees") }),
    );
  });

  it("should cleanup worktree on failure", async () => {
    const mockRemoveWorktree = vi.fn();
    vi.mock("lib/trpc/routers/workspaces/utils/git", () => ({
      removeWorktree: mockRemoveWorktree,
    }));

    const mockExeca = vi.fn().mockRejectedValue(new Error("Claude failed"));
    vi.mock("execa", () => ({ execa: mockExeca }));

    await executeTask(mockJob, taskExecutionManager);

    expect(mockRemoveWorktree).toHaveBeenCalled();
  });
});
```

---

## Phase 6: Orchestration Chat

### 6.1 Overview

Build an AI-powered chat interface using Vercel AI SDK that can orchestrate tasks, read the codebase, and manage plan execution.

### 6.2 Technical Specifications

#### 6.2.1 Architecture Overview

```
orchestration/
├── engine.ts           # Main chat engine with tool definitions
├── tools/              # Tool implementations
│   ├── task-tools.ts   # createTask, modifyTask, startTask, stopTask
│   ├── code-tools.ts   # readFile, searchCode, listFiles
│   └── memory-tools.ts # getMemory, setMemory
├── context-broker.ts   # Manages shared context/memory
├── system-prompt.ts    # System prompt builder
└── index.ts
```

#### 6.2.2 Chat Engine

**File**: `apps/desktop/src/main/lib/orchestration/engine.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { streamText, tool } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { localDb } from "main/lib/local-db";
import { orchestrationMessages, planTasks, plans, agentMemory } from "@superset/local-db";
import { eq, desc } from "drizzle-orm";
import { taskExecutionManager } from "../task-execution";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    callId: string;
    result: unknown;
    isError?: boolean;
  }>;
  createdAt: number;
}

export interface StreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onToolCall?: (toolCall: { id: string; name: string; input: unknown }) => void;
  onToolResult?: (result: { callId: string; result: unknown }) => void;
  onComplete?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

export async function sendMessage({
  projectId,
  planId,
  content,
  callbacks,
}: {
  projectId: string;
  planId: string;
  content: string;
  callbacks: StreamCallbacks;
}): Promise<void> {
  const { onStart, onToken, onToolCall, onToolResult, onComplete, onError } = callbacks;

  try {
    onStart?.();

    // Get conversation history
    const history = await getConversationHistory(projectId);

    // Get current plan context
    const planContext = await getPlanContext(planId);

    // Build system prompt
    const systemPrompt = buildSystemPrompt({ projectId, planId, planContext });

    // Define tools
    const tools = defineOrchestrationTools({ projectId, planId });

    // Stream the response
    const { textStream, toolCalls, toolResults } = await streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      messages: [
        ...history.map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user", content },
      ],
      tools,
      maxTokens: 4096,
    });

    let fullContent = "";

    // Stream tokens
    for await (const chunk of textStream) {
      fullContent += chunk;
      onToken?.(chunk);
    }

    // Handle tool calls
    const collectedToolCalls: ChatMessage["toolCalls"] = [];
    const collectedToolResults: ChatMessage["toolResults"] = [];

    for await (const call of toolCalls) {
      collectedToolCalls.push({
        id: call.toolCallId,
        name: call.toolName,
        input: call.args as Record<string, unknown>,
      });
      onToolCall?.({ id: call.toolCallId, name: call.toolName, input: call.args });
    }

    for await (const result of toolResults) {
      collectedToolResults.push({
        callId: result.toolCallId,
        result: result.result,
        isError: result.isError,
      });
      onToolResult?.({ callId: result.toolCallId, result: result.result });
    }

    // Save messages to database
    await saveMessage(projectId, "user", content);
    const assistantMessage = await saveMessage(projectId, "assistant", fullContent, {
      toolCalls: collectedToolCalls,
      toolResults: collectedToolResults,
    });

    onComplete?.(assistantMessage);
  } catch (error) {
    onError?.(error instanceof Error ? error : new Error(String(error)));
  }
}

function defineOrchestrationTools({ projectId, planId }: { projectId: string; planId: string }) {
  return {
    createTask: tool({
      description: "Create a new task in the plan",
      parameters: z.object({
        title: z.string().describe("The task title"),
        description: z.string().optional().describe("Detailed description"),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
        instructions: z.string().optional().describe("Specific instructions for Claude"),
      }),
      execute: async ({ title, description, priority, instructions }) => {
        const task = localDb
          .insert(planTasks)
          .values({ planId, title, description, priority, instructions, status: "backlog", columnOrder: 0 })
          .returning()
          .get();
        return { success: true, taskId: task.id, title };
      },
    }),

    modifyTask: tool({
      description: "Update an existing task's details",
      parameters: z.object({
        taskId: z.string().describe("The task ID to modify"),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
        instructions: z.string().optional(),
      }),
      execute: async ({ taskId, ...updates }) => {
        localDb
          .update(planTasks)
          .set({ ...updates, updatedAt: Date.now() })
          .where(eq(planTasks.id, taskId))
          .run();
        return { success: true, taskId };
      },
    }),

    startTask: tool({
      description: "Start executing a task. Creates a worktree and runs Claude.",
      parameters: z.object({
        taskId: z.string().describe("The task ID to start"),
      }),
      execute: async ({ taskId }) => {
        const task = localDb.select().from(planTasks).where(eq(planTasks.id, taskId)).get();
        if (!task) return { success: false, error: "Task not found" };
        if (task.status === "running") return { success: false, error: "Task already running" };

        // Trigger execution via execution procedures
        // This would need to call the execution start logic
        return { success: true, taskId, message: "Task queued for execution" };
      },
    }),

    stopTask: tool({
      description: "Stop a running or queued task",
      parameters: z.object({
        taskId: z.string().describe("The task ID to stop"),
      }),
      execute: async ({ taskId }) => {
        taskExecutionManager.cancel(taskId);
        return { success: true, taskId };
      },
    }),

    listTasks: tool({
      description: "List all tasks in the current plan with their status",
      parameters: z.object({
        status: z.enum(["backlog", "queued", "running", "completed", "failed"]).optional(),
      }),
      execute: async ({ status }) => {
        let query = localDb.select().from(planTasks).where(eq(planTasks.planId, planId));
        if (status) {
          query = query.where(eq(planTasks.status, status));
        }
        const tasks = query.all();
        return { tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })) };
      },
    }),

    getTaskOutput: tool({
      description: "Get the execution output/logs for a task",
      parameters: z.object({
        taskId: z.string(),
        limit: z.number().optional().default(100),
      }),
      execute: async ({ taskId, limit }) => {
        // Fetch from execution_logs table
        const logs = localDb
          .select()
          .from(executionLogs)
          .where(eq(executionLogs.taskId, taskId))
          .orderBy(desc(executionLogs.timestamp))
          .limit(limit)
          .all();
        return { logs: logs.reverse() };
      },
    }),

    readFile: tool({
      description: "Read the contents of a file from the project",
      parameters: z.object({
        path: z.string().describe("Relative path from project root"),
        startLine: z.number().optional(),
        endLine: z.number().optional(),
      }),
      execute: async ({ path, startLine, endLine }) => {
        // Implementation would read from the main repo path
        // This requires access to the project's mainRepoPath
        return { content: "File content here", path };
      },
    }),

    searchCode: tool({
      description: "Search for code patterns in the project",
      parameters: z.object({
        query: z.string().describe("Search query (regex supported)"),
        filePattern: z.string().optional().describe("Glob pattern for files"),
        maxResults: z.number().optional().default(20),
      }),
      execute: async ({ query, filePattern, maxResults }) => {
        // Implementation would use ripgrep or similar
        return { results: [], query };
      },
    }),

    setMemory: tool({
      description: "Store information in shared memory for future reference",
      parameters: z.object({
        key: z.string().describe("Memory key"),
        value: z.string().describe("Value to store"),
        importance: z.number().optional().describe("Importance score 0-10"),
      }),
      execute: async ({ key, value, importance }) => {
        localDb
          .insert(agentMemory)
          .values({ projectId, key, value, importance: importance ?? 5, source: "orchestrator" })
          .onConflictDoUpdate({
            target: [agentMemory.projectId, agentMemory.key],
            set: { value, importance: importance ?? 5, updatedAt: Date.now() },
          })
          .run();
        return { success: true, key };
      },
    }),

    getMemory: tool({
      description: "Retrieve information from shared memory",
      parameters: z.object({
        key: z.string().optional().describe("Specific key to retrieve"),
        keys: z.array(z.string()).optional().describe("Multiple keys to retrieve"),
      }),
      execute: async ({ key, keys }) => {
        if (key) {
          const memory = localDb
            .select()
            .from(agentMemory)
            .where(and(eq(agentMemory.projectId, projectId), eq(agentMemory.key, key)))
            .get();
          return { memory: memory ? { [key]: memory.value } : {} };
        }
        if (keys) {
          const memories = localDb
            .select()
            .from(agentMemory)
            .where(and(eq(agentMemory.projectId, projectId), inArray(agentMemory.key, keys)))
            .all();
          return { memory: Object.fromEntries(memories.map(m => [m.key, m.value])) };
        }
        return { memory: {} };
      },
    }),
  };
}

function buildSystemPrompt({
  projectId,
  planId,
  planContext,
}: {
  projectId: string;
  planId: string;
  planContext: { tasks: Array<{ id: string; title: string; status: string }> };
}): string {
  return `You are an orchestration assistant for a software development project. Your role is to help manage and coordinate tasks in a plan.

## Current Plan Status
${planContext.tasks.length === 0 ? "No tasks yet." : planContext.tasks.map(t => `- [${t.status}] ${t.title} (${t.id})`).join("\n")}

## Capabilities
You can:
- Create, modify, and manage tasks
- Start and stop task execution
- Read files from the codebase
- Search for code patterns
- Store and retrieve shared memory

## Guidelines
1. Be concise and helpful
2. When creating tasks, provide clear titles and descriptions
3. Use memory to track important decisions and context
4. When starting tasks, ensure they have sufficient instructions
5. Monitor running tasks and report on progress

Always confirm actions and provide clear feedback on what you've done.`;
}

async function getConversationHistory(projectId: string, limit = 50): Promise<ChatMessage[]> {
  const messages = localDb
    .select()
    .from(orchestrationMessages)
    .where(eq(orchestrationMessages.projectId, projectId))
    .orderBy(desc(orchestrationMessages.createdAt))
    .limit(limit)
    .all();

  return messages.reverse().map(m => ({
    id: m.id,
    role: m.role as ChatMessage["role"],
    content: m.content,
    toolCalls: m.toolCalls as ChatMessage["toolCalls"],
    toolResults: m.toolResults as ChatMessage["toolResults"],
    createdAt: m.createdAt,
  }));
}

async function getPlanContext(planId: string) {
  const tasks = localDb.select().from(planTasks).where(eq(planTasks.planId, planId)).all();
  return { tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status })) };
}

async function saveMessage(
  projectId: string,
  role: ChatMessage["role"],
  content: string,
  options?: { toolCalls?: ChatMessage["toolCalls"]; toolResults?: ChatMessage["toolResults"] },
): Promise<ChatMessage> {
  const message = localDb
    .insert(orchestrationMessages)
    .values({
      projectId,
      role,
      content,
      toolCalls: options?.toolCalls,
      toolResults: options?.toolResults,
    })
    .returning()
    .get();

  return {
    id: message.id,
    role: message.role as ChatMessage["role"],
    content: message.content,
    toolCalls: message.toolCalls as ChatMessage["toolCalls"],
    toolResults: message.toolResults as ChatMessage["toolResults"],
    createdAt: message.createdAt,
  };
}
```

#### 6.2.3 tRPC Orchestration Router

**File**: `apps/desktop/src/lib/trpc/routers/plan/procedures/orchestration.ts`

```typescript
import { observable } from "@trpc/server/observable";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { orchestrationMessages } from "@superset/local-db";
import { eq, desc } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { sendMessage } from "main/lib/orchestration/engine";
import { EventEmitter } from "events";

const chatEventEmitter = new EventEmitter();

interface ChatStreamEvent {
  type: "start" | "token" | "tool_call" | "tool_result" | "complete" | "error";
  data: unknown;
}

export const createOrchestrationProcedures = () => {
  return router({
    sendMessage: publicProcedure
      .input(z.object({
        projectId: z.string(),
        planId: z.string(),
        content: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        const { projectId, planId, content } = input;

        // Start streaming
        sendMessage({
          projectId,
          planId,
          content,
          callbacks: {
            onStart: () => {
              chatEventEmitter.emit(`chat:${projectId}`, { type: "start", data: null });
            },
            onToken: (token) => {
              chatEventEmitter.emit(`chat:${projectId}`, { type: "token", data: token });
            },
            onToolCall: (toolCall) => {
              chatEventEmitter.emit(`chat:${projectId}`, { type: "tool_call", data: toolCall });
            },
            onToolResult: (result) => {
              chatEventEmitter.emit(`chat:${projectId}`, { type: "tool_result", data: result });
            },
            onComplete: (message) => {
              chatEventEmitter.emit(`chat:${projectId}`, { type: "complete", data: message });
            },
            onError: (error) => {
              chatEventEmitter.emit(`chat:${projectId}`, { type: "error", data: error.message });
            },
          },
        });

        return { success: true };
      }),

    getHistory: publicProcedure
      .input(z.object({
        projectId: z.string(),
        limit: z.number().optional().default(50),
      }))
      .query(({ input }) => {
        const messages = localDb
          .select()
          .from(orchestrationMessages)
          .where(eq(orchestrationMessages.projectId, input.projectId))
          .orderBy(desc(orchestrationMessages.createdAt))
          .limit(input.limit)
          .all();

        return { messages: messages.reverse() };
      }),

    clearHistory: publicProcedure
      .input(z.object({ projectId: z.string() }))
      .mutation(({ input }) => {
        localDb.delete(orchestrationMessages).where(eq(orchestrationMessages.projectId, input.projectId)).run();
        return { success: true };
      }),

    subscribeToStream: publicProcedure
      .input(z.object({ projectId: z.string() }))
      .subscription(({ input }) => {
        return observable<ChatStreamEvent>((emit) => {
          const handler = (event: ChatStreamEvent) => emit.next(event);
          chatEventEmitter.on(`chat:${input.projectId}`, handler);
          return () => chatEventEmitter.off(`chat:${input.projectId}`, handler);
        });
      }),
  });
};
```

#### 6.2.4 Chat UI Component

**File**: `apps/desktop/src/renderer/screens/main/components/PlanView/components/OrchestrationChat/OrchestrationChat.tsx`

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "renderer/lib/trpc";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@superset/ui/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageActions,
} from "@superset/ui/ai-elements/message";
import { Tool, ToolHeader, ToolContent } from "@superset/ui/ai-elements/tool";
import { LuSend, LuLoader, LuSparkles, LuTrash2 } from "react-icons/lu";

interface OrchestrationChatProps {
  projectId: string;
  planId: string;
}

export function OrchestrationChat({ projectId, planId }: OrchestrationChatProps) {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [pendingToolCalls, setPendingToolCalls] = useState<Array<{
    id: string;
    name: string;
    input: unknown;
    result?: unknown;
    isLoading: boolean;
  }>>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch history
  const { data: historyData, refetch: refetchHistory } = trpc.plan.orchestration.getHistory.useQuery(
    { projectId },
    { enabled: !!projectId },
  );

  // Send message mutation
  const sendMutation = trpc.plan.orchestration.sendMessage.useMutation();

  // Clear history mutation
  const clearMutation = trpc.plan.orchestration.clearHistory.useMutation({
    onSuccess: () => refetchHistory(),
  });

  // Subscribe to streaming events
  trpc.plan.orchestration.subscribeToStream.useSubscription(
    { projectId },
    {
      onData: (event) => {
        switch (event.type) {
          case "start":
            setIsStreaming(true);
            setStreamingContent("");
            setPendingToolCalls([]);
            break;
          case "token":
            setStreamingContent((prev) => prev + (event.data as string));
            break;
          case "tool_call":
            const call = event.data as { id: string; name: string; input: unknown };
            setPendingToolCalls((prev) => [...prev, { ...call, isLoading: true }]);
            break;
          case "tool_result":
            const result = event.data as { callId: string; result: unknown };
            setPendingToolCalls((prev) =>
              prev.map((tc) =>
                tc.id === result.callId ? { ...tc, result: result.result, isLoading: false } : tc,
              ),
            );
            break;
          case "complete":
            setIsStreaming(false);
            setStreamingContent("");
            setPendingToolCalls([]);
            refetchHistory();
            break;
          case "error":
            setIsStreaming(false);
            console.error("[orchestration] Stream error:", event.data);
            break;
        }
      },
    },
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isStreaming) return;

      sendMutation.mutate({ projectId, planId, content: input.trim() });
      setInput("");
    },
    [input, isStreaming, projectId, planId, sendMutation],
  );

  const handleClearHistory = useCallback(() => {
    if (confirm("Clear all chat history?")) {
      clearMutation.mutate({ projectId });
    }
  }, [projectId, clearMutation]);

  const messages = historyData?.messages ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <LuSparkles className="size-4 text-primary" />
          <h2 className="text-xs font-medium">Orchestrator</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={handleClearHistory}
          disabled={messages.length === 0}
        >
          <LuTrash2 className="size-3" />
        </Button>
      </div>

      {/* Messages */}
      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.length === 0 && !isStreaming ? (
            <ConversationEmptyState
              title="Plan Orchestrator"
              description="I can help you create tasks, manage execution, and explore your codebase."
              icon={<LuSparkles className="size-8" />}
            />
          ) : (
            <>
              {messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    {message.content}
                    {message.toolCalls?.map((call) => (
                      <Tool key={call.id}>
                        <ToolHeader
                          title={call.name}
                          type="tool-use"
                          state="output-available"
                        />
                        <ToolContent>
                          <pre className="text-xs overflow-auto">
                            {JSON.stringify(call.input, null, 2)}
                          </pre>
                        </ToolContent>
                      </Tool>
                    ))}
                  </MessageContent>
                </Message>
              ))}

              {/* Streaming message */}
              {isStreaming && (
                <Message from="assistant">
                  <MessageContent>
                    {streamingContent}
                    {streamingContent === "" && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <LuLoader className="size-3 animate-spin" />
                        Thinking...
                      </span>
                    )}
                    {pendingToolCalls.map((call) => (
                      <Tool key={call.id}>
                        <ToolHeader
                          title={call.name}
                          type="tool-use"
                          state={call.isLoading ? "input-available" : "output-available"}
                        />
                        {call.result && (
                          <ToolContent>
                            <pre className="text-xs overflow-auto">
                              {JSON.stringify(call.result, null, 2)}
                            </pre>
                          </ToolContent>
                        )}
                      </Tool>
                    ))}
                  </MessageContent>
                </Message>
              )}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-border/50 p-2">
        <div className="flex gap-1.5">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about tasks, code, or get help..."
            className="flex-1 h-8 text-xs"
            disabled={isStreaming}
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 px-3 flex-shrink-0"
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <LuLoader className="size-3 animate-spin" />
            ) : (
              <LuSend className="size-3" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

### 6.3 UX Polish Requirements

| Feature | Implementation | Priority |
|---------|----------------|----------|
| Streaming response | Character-by-character rendering | High |
| Tool call visualization | Collapsible cards showing input/output | High |
| Loading states | Skeleton for history, spinner for streaming | High |
| Error handling | Toast for errors, retry option | High |
| Suggestions | Quick action buttons for common tasks | Medium |
| Markdown rendering | Support code blocks, lists, links | High |
| Copy messages | Copy button on assistant messages | Medium |
| Message timestamps | Show relative time on hover | Low |
| Empty state | Friendly message with suggestions | High |
| Scroll to bottom | Button to jump to latest message | Medium |

#### 6.3.1 Suggested Actions

```typescript
const suggestedActions = [
  { label: "List all tasks", prompt: "Show me all tasks in the current plan" },
  { label: "Create a task", prompt: "Create a new task for..." },
  { label: "Start all queued", prompt: "Start all queued tasks" },
  { label: "Summarize progress", prompt: "Give me a summary of the current plan progress" },
];
```

### 6.4 Validation Criteria

#### 6.4.1 Manual Testing Checklist

- [ ] Send message → Response streams in real-time
- [ ] Tool call → Shows tool name and result
- [ ] Create task via chat → Task appears in kanban
- [ ] Start task via chat → Task execution begins
- [ ] Stop task via chat → Task execution stops
- [ ] Clear history → All messages removed
- [ ] Scroll up → New messages don't auto-scroll
- [ ] Click scroll button → Scrolls to bottom
- [ ] Long conversation → Performance remains smooth
- [ ] Network error → Error message displayed

#### 6.4.2 Integration Tests

**File**: `apps/desktop/src/main/lib/orchestration/engine.test.ts`

```typescript
describe("Orchestration Engine", () => {
  it("should stream response tokens", async () => {
    const tokens: string[] = [];

    await sendMessage({
      projectId: "test",
      planId: "test-plan",
      content: "Hello",
      callbacks: {
        onToken: (token) => tokens.push(token),
        onComplete: () => {},
      },
    });

    expect(tokens.length).toBeGreaterThan(0);
  });

  it("should execute tool calls", async () => {
    const toolCalls: Array<{ name: string }> = [];

    await sendMessage({
      projectId: "test",
      planId: "test-plan",
      content: "Create a task called Test Task",
      callbacks: {
        onToolCall: (call) => toolCalls.push(call),
        onComplete: () => {},
      },
    });

    expect(toolCalls).toContainEqual(expect.objectContaining({ name: "createTask" }));
  });

  it("should save messages to database", async () => {
    await sendMessage({
      projectId: "test",
      planId: "test-plan",
      content: "Hello",
      callbacks: { onComplete: () => {} },
    });

    const messages = await db.select().from(orchestrationMessages).where(eq(orchestrationMessages.projectId, "test"));
    expect(messages).toHaveLength(2); // User + Assistant
  });
});
```

#### 6.4.3 Component Tests

**File**: `apps/desktop/src/renderer/screens/main/components/PlanView/components/OrchestrationChat/OrchestrationChat.test.tsx`

```typescript
describe("OrchestrationChat", () => {
  it("should render empty state when no messages", () => {
    render(<OrchestrationChat projectId="test" planId="test-plan" />);
    expect(screen.getByText(/Plan Orchestrator/)).toBeInTheDocument();
  });

  it("should render message history", () => {
    // Mock history query
    render(<OrchestrationChat projectId="test" planId="test-plan" />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("should disable input while streaming", () => {
    // Set isStreaming state
    render(<OrchestrationChat projectId="test" planId="test-plan" />);
    const input = screen.getByPlaceholderText(/Ask about/);
    expect(input).toBeDisabled();
  });

  it("should show tool calls during streaming", () => {
    // Simulate tool call event
    render(<OrchestrationChat projectId="test" planId="test-plan" />);
    expect(screen.getByText("createTask")).toBeInTheDocument();
  });
});
```

---

## Appendix: Testing Strategy

### Test Types

1. **Unit Tests**: Test individual functions and components in isolation
2. **Integration Tests**: Test interactions between modules (e.g., router + database)
3. **Component Tests**: Test React components with mocked data
4. **E2E Tests**: Test complete user flows (optional, Playwright)

### Test File Locations

```
src/
├── lib/
│   └── trpc/routers/plan/
│       └── plan.test.ts              # Router integration tests
├── main/
│   └── lib/
│       ├── task-execution/
│       │   ├── manager.test.ts       # Unit tests
│       │   └── executor.test.ts      # Integration tests
│       └── orchestration/
│           └── engine.test.ts        # Integration tests
└── renderer/
    └── screens/main/components/PlanView/
        ├── PlanView.test.tsx         # Component tests
        └── components/
            ├── KanbanBoard/
            │   └── KanbanBoard.test.tsx
            └── OrchestrationChat/
                └── OrchestrationChat.test.tsx
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/main/lib/task-execution/manager.test.ts

# Run tests with coverage
bun test --coverage

# Run tests in watch mode
bun test --watch
```

### CI Validation

```yaml
# .github/workflows/test.yml
- name: Run tests
  run: bun test

- name: Check coverage
  run: |
    bun test --coverage
    # Fail if coverage below 80%
```

---

## Appendix: Component Checklist

For each component, ensure:

- [ ] TypeScript types defined
- [ ] Props documented
- [ ] Loading states implemented
- [ ] Error states handled
- [ ] Empty states designed
- [ ] Accessibility (ARIA, keyboard nav)
- [ ] Responsive design
- [ ] Unit tests written
- [ ] Visual regression tests (optional)
