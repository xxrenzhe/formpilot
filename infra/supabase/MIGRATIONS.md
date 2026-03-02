# Supabase Migrations (ADS Scenario)

本目录新增了面向**存量生产库**的增量迁移，替代直接重跑 `schema.sql` 的方式。

## 执行顺序

必须按文件名前缀顺序执行：

1. `migrations/20260301_0001_credits_foundation.sql`
2. `migrations/20260301_0002_compliance_and_prompts.sql`
3. `migrations/20260301_0003_usage_metrics_and_invites.sql`
4. `migrations/20260301_0004_rls_views_functions_and_seed.sql`
5. `migrations/20260302_0005_legacy_cleanup.sql`
6. `migrations/20260302_0006_drop_users_plan.sql`
7. `migrations/20260302_0007_credit_rpc_and_usage_sum.sql`
8. `migrations/20260302_0008_feedback_event_semantics.sql`

## 启动自动执行（已接入 BFF）

BFF 现已在启动阶段自动按顺序执行迁移。对应实现见：

- `apps/bff/src/migrations.ts`
- `apps/bff/src/server.ts`

必需环境变量：

- `SUPABASE_DB_URL`：Postgres 连接串（建议 direct 连接）。

可选环境变量：

- `AUTO_RUN_MIGRATIONS`：默认 `true`，设为 `false` 可跳过自动迁移。
- `MIGRATIONS_DIR`：默认 `infra/supabase/migrations`。
- `MIGRATION_DB_SSL`：默认 `true`。
- `MIGRATION_DB_SSL_REJECT_UNAUTHORIZED`：默认 `false`。

幂等保证：

- SQL 文件本身使用 `if not exists` / `drop ... if exists` / 回填语句，支持重复执行。
- 运行器维护 `formpilot_schema_migrations` 并做 checksum 校验，已执行版本会被跳过。

## 执行前检查

1. 备份生产库。
2. 确认服务端已经部署支持 `credits` 的 BFF（避免新老逻辑混跑）。
3. 若历史 `metrics_events` 中存在非白名单 `event_type`，`0003` 会跳过新约束并输出 notice，不会中断迁移。

## 执行后校验

1. `users` 表存在并可读写 `credits`。
2. `device_credit_claims`、`compliance_profiles`、`prompt_templates`、`prompt_feedback` 表存在。
3. `usage_logs` 包含 `credits_cost/cost_tier/prompt_template_id/scenario`。
4. `increment_user_credits`（返回最新余额）、`decrement_user_credits`、`get_lifetime_credits_used_sum` RPC 可调用。
5. `prompt_templates` 至少包含 `Default ADS Compliance v1` 与 `Default General v1`。
6. `users` 表中的 `stripe_customer_id/stripe_subscription_id/current_period_end` 已移除。
7. `personas` 表已移除。
8. `users.plan` 已移除（系统仅保留 `credits` 计量模型）。

## 说明

- `infra/supabase/schema.sql` 继续作为最新全量快照。
- 生产升级请优先使用本目录迁移脚本，不建议对存量库直接执行全量快照。
