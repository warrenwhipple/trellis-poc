CREATE TABLE `agent_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_memory_project_id_idx` ON `agent_memory` (`project_id`);--> statement-breakpoint
CREATE INDEX `agent_memory_key_idx` ON `agent_memory` (`key`);--> statement-breakpoint
CREATE TABLE `execution_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `plan_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `execution_logs_task_id_idx` ON `execution_logs` (`task_id`);--> statement-breakpoint
CREATE INDEX `execution_logs_timestamp_idx` ON `execution_logs` (`timestamp`);--> statement-breakpoint
CREATE TABLE `orchestration_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `orchestration_messages_project_id_idx` ON `orchestration_messages` (`project_id`);--> statement-breakpoint
CREATE INDEX `orchestration_messages_created_at_idx` ON `orchestration_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `plan_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'medium',
	`column_order` integer DEFAULT 0 NOT NULL,
	`workspace_id` text,
	`worktree_id` text,
	`execution_status` text,
	`execution_started_at` integer,
	`execution_completed_at` integer,
	`execution_error` text,
	`external_provider` text,
	`external_id` text,
	`external_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`worktree_id`) REFERENCES `worktrees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `plan_tasks_plan_id_idx` ON `plan_tasks` (`plan_id`);--> statement-breakpoint
CREATE INDEX `plan_tasks_status_idx` ON `plan_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `plan_tasks_workspace_id_idx` ON `plan_tasks` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `plan_tasks_external_id_idx` ON `plan_tasks` (`external_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text DEFAULT 'Plan' NOT NULL,
	`status` text DEFAULT 'draft',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plans_project_id_idx` ON `plans` (`project_id`);--> statement-breakpoint
CREATE INDEX `plans_status_idx` ON `plans` (`status`);