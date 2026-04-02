-- Down migration for 0000_init
-- Drops all tables in reverse dependency order (children before parents).
-- SQLite requires disabling foreign keys during drop to avoid constraint violations.

PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS `think_decisions_task_run_id_idx`;
DROP TABLE IF EXISTS `think_decisions`;

DROP INDEX IF EXISTS `run_messages_correlation_id_idx`;
DROP INDEX IF EXISTS `run_messages_task_run_id_idx`;
DROP TABLE IF EXISTS `run_messages`;

DROP INDEX IF EXISTS `task_runs_correlation_id_idx`;
DROP INDEX IF EXISTS `task_runs_task_id_idx`;
DROP TABLE IF EXISTS `task_runs`;

DROP INDEX IF EXISTS `tasks_plan_id_idx`;
DROP INDEX IF EXISTS `tasks_plan_id_order_index_unique`;
DROP TABLE IF EXISTS `tasks`;

DROP INDEX IF EXISTS `plan_materials_plan_id_idx`;
DROP TABLE IF EXISTS `plan_materials`;

DROP INDEX IF EXISTS `plans_project_id_idx`;
DROP TABLE IF EXISTS `plans`;

DROP TABLE IF EXISTS `projects`;

PRAGMA foreign_keys = ON;
