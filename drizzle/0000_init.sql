CREATE TABLE `plan_materials` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`type` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plan_materials_plan_id_idx` ON `plan_materials` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plans_project_id_idx` ON `plans` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `run_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_run_id` integer NOT NULL,
	`correlation_id` text DEFAULT '' NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `run_messages_task_run_id_idx` ON `run_messages` (`task_run_id`);--> statement-breakpoint
CREATE INDEX `run_messages_correlation_id_idx` ON `run_messages` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`correlation_id` text DEFAULT '' NOT NULL,
	`error_code` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_runs_task_id_idx` ON `task_runs` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_runs_correlation_id_idx` ON `task_runs` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`order_index` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_plan_id_order_index_unique` ON `tasks` (`plan_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `tasks_plan_id_idx` ON `tasks` (`plan_id`);--> statement-breakpoint
CREATE TABLE `think_decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_run_id` integer NOT NULL,
	`correlation_id` text DEFAULT '' NOT NULL,
	`trigger_type` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `think_decisions_task_run_id_idx` ON `think_decisions` (`task_run_id`);