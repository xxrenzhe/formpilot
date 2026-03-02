# FormPilot 本地核心功能测试：参数获取与填写指南

本文用于一次性说明本地联调时，所有关键环境变量如何获取、填写到哪里、以及如何验证生效。

## 1. 适用范围

适用于以下本地测试场景：

- BFF 启动自动迁移（按顺序、幂等）
- 启动自动创建/修正管理员并重置密码
- Admin 登录与后台管理接口
- Extension 调用生成接口（含普通场景与广告合规场景）
- 点数扣减、邀请码功能

## 2. 前置准备

1. 准备一个可用 Supabase 项目（建议单独用于本地测试）。
2. 准备一个可用的 AI Provider Key（如 OpenAI Key）。
3. 本地仓库已安装依赖：`npm ci`。

## 3. 需要填写的文件

1. `apps/bff/.env`
2. `apps/admin/.env.local`
3. `apps/extension/.env`

可先复制模板：

```bash
cp apps/bff/.env.example apps/bff/.env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/extension/.env.example apps/extension/.env
```

## 4. 参数获取方法（逐项）

### 4.1 Supabase 相关

在 Supabase 控制台中获取：

- 路径：`Project Settings -> API`
- 可得到：
  - `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` / `PLASMO_PUBLIC_SUPABASE_URL`（Project URL）
  - `SUPABASE_SERVICE_ROLE_KEY`（service_role key，机密）
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `PLASMO_PUBLIC_SUPABASE_ANON_KEY`（anon key，公开）

数据库连接串：

- 路径：`Project Settings -> Database -> Connection string -> URI`
- 变量：`SUPABASE_DB_URL`
- 建议使用 Direct 连接串（非 pooler），用于启动迁移。

示例（仅格式示例）：

```text
postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require
```

### 4.2 AI Provider 相关

- `AI_API_KEY`：在你的 AI 服务商控制台创建 API Key。
- `AI_BASE_URL`：若使用 OpenAI 官方，可用默认值 `https://api.openai.com/v1`。
- `AI_PROVIDER`：默认 `openai`。
- `AI_MODEL`：推荐先用 `gpt-4o-mini`。
- `AI_MODEL_GENERAL` / `AI_MODEL_ADS`：可选，不填时回退到 `AI_MODEL`。

### 4.3 BFF 与前端地址

- `PORT`：BFF 端口，默认 `8787`。
- `NEXT_PUBLIC_BFF_URL`、`PLASMO_PUBLIC_BFF_URL`：本地统一填 `http://localhost:8787`。
- `APP_BASE_URL`：可填你本地主站地址，例如 `http://localhost:3000`。
- `CORS_ORIGINS`：本地可用 `*`，生产请用白名单。

### 4.4 迁移与管理员相关

- `AUTO_RUN_MIGRATIONS=true`：建议保持开启。
- `MIGRATIONS_DIR=infra/supabase/migrations`：一般不改。
- `MIGRATION_DB_SSL=true`：通常保持默认。
- `MIGRATION_DB_SSL_REJECT_UNAUTHORIZED=false`：通常保持默认。
- `ADMIN_TOKEN`：可选；若需要通过 `x-admin-token` 调用部分管理接口则填写。

管理员固定行为（当前代码）：

- 启动时会确保管理员存在，用户名 `formpilot`，邮箱 `formpilot@formpilot.local`
- 每次服务启动会重置管理员密码为 `LYTu@TDmw345Jn1AZg#DRjinHhjk`

## 5. 三个文件推荐填写示例

### 5.1 `apps/bff/.env`

```env
NODE_ENV=development
PORT=8787
APP_BASE_URL=http://localhost:3000
CORS_ORIGINS=*

SUPABASE_URL=https://<PROJECT_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
SUPABASE_DB_URL=postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require

AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=<AI_API_KEY>
AI_MODEL=gpt-4o-mini
AI_MODEL_GENERAL=
AI_MODEL_ADS=

FREE_SIGNUP_CREDITS=20
GLOBAL_CONTEXT_LIMIT=6000
ADMIN_TOKEN=

AUTO_RUN_MIGRATIONS=true
MIGRATIONS_DIR=infra/supabase/migrations
MIGRATION_DB_SSL=true
MIGRATION_DB_SSL_REJECT_UNAUTHORIZED=false
```

### 5.2 `apps/admin/.env.local`

```env
NEXT_PUBLIC_BFF_URL=http://localhost:8787
NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
```

### 5.3 `apps/extension/.env`

```env
PLASMO_PUBLIC_BFF_URL=http://localhost:8787
PLASMO_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
PLASMO_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
```

## 6. 启动与验收命令

1. 启动 BFF

```bash
npm run dev:bff
```

预期：

- 启动日志出现迁移执行/跳过信息
- 启动日志出现 bootstrap admin 信息

2. 启动 Admin

```bash
npm run dev:admin
```

登录验证：

- 用户名可输入 `formpilot`
- 密码：`LYTu@TDmw345Jn1AZg#DRjinHhjk`

3. 启动 Extension（开发模式）

```bash
npm run dev:extension
```

在浏览器加载扩展后，验证生成请求可成功打到 `http://localhost:8787`。

4. 健康检查

```bash
curl http://localhost:8787/health
```

预期返回：

```json
{"status":"ok"}
```

## 7. 常见问题排查

1. 迁移阶段连接数据库失败  
优先检查 `SUPABASE_DB_URL` 是否可直连、密码是否正确；必要时保留 `MIGRATION_DB_SSL=true` 与 `MIGRATION_DB_SSL_REJECT_UNAUTHORIZED=false`。

2. Admin 能打开但无法登录  
检查 `apps/admin/.env.local` 的 `NEXT_PUBLIC_SUPABASE_*` 是否与 BFF 使用的 Supabase 项目一致。

3. Extension 请求报跨域  
检查 BFF `CORS_ORIGINS`；本地联调先用 `*`，生产再收敛白名单。

4. 生成接口报 AI 认证错误  
检查 `AI_API_KEY`、`AI_BASE_URL`、`AI_PROVIDER` 与模型名是否匹配。

## 8. 安全提醒

- 不要提交 `.env` 与 `.env.local` 到仓库。
- `SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_DB_URL`、`AI_API_KEY`、`ADMIN_TOKEN` 仅能出现在服务端环境。
