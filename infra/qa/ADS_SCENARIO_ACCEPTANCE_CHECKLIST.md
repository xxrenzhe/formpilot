# ADS Scenario 验收清单

用于本地/预发对 `docs/ADS_SCENARIO_OPTIMIZATION_PLAN.md` 的落地结果做最终验收。

## A. 测试前准备

1. Supabase 项目可用，已执行 `infra/supabase/migrations` 全部脚本。
2. BFF 环境变量已配置：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AI_API_KEY`
   - `AI_MODEL`（或 `AI_MODEL_GENERAL` / `AI_MODEL_ADS`）
   - `ADS_ONLY_MODE=true`
   - `FREE_SIGNUP_CREDITS`（默认 20）
   - `TRIAL_IP_CLAIM_WINDOW_HOURS`（默认 24）
   - `TRIAL_IP_CLAIM_MAX_PER_WINDOW`（默认 4）
3. Extension 已加载并可登录，`PLASMO_PUBLIC_BFF_URL` 指向当前 BFF。
4. 准备两个测试账号（A、B）与同一浏览器设备。
5. Admin 账号具备后台访问权限。
6. 准备至少一个充值码批次（例如 50 点面额）。

## B. 必测用例

1. 设备首赠拦截
   - 同一设备上，A 首次登录后调用 `/api/usage`，应获得 `credits=20`、`trialStatus=granted`。
   - 同设备切换 B 登录后调用 `/api/usage`，应为 `trialStatus=already_claimed` 且提示“该设备已体验过免费额度”。
   - 同一网络在窗口期内高频触发新设备首赠后，`trialStatus` 应出现 `rate_limited`（提示暂不可发放）。
2. 阶梯扣费准确性
   - `shortText` 扣 1 点。
   - `longDoc` 扣 5 点。
   - 含超长上下文/附件信号（upload/attachment 或超阈值）扣 10 点。
   - `usage_logs` 中 `credits_cost/cost_tier/scenario` 写入正确。
3. 点数不足拦截
   - 人为设置余额 < 所需点数，触发生成。
   - 插件应直接展示充值区块（无“先生成再模糊”诱饵）。
   - BFF 返回 `INSUFFICIENT_CREDITS`，包含 `requiredCredits/currentCredits`。
4. 合规资料缺失提醒
   - 清空 `compliance_profiles` 关键字段后在 Ads 场景生成。
   - 插件应显示缺失警告；SSE `meta.missingFields` 应含缺失字段。
5. Prompt 反馈调权
   - 生成后提交 success/fail 反馈。
   - `prompt_feedback` 新增记录。
   - 对应 `prompt_templates.weight` 按规则变化（成功 +0.15，失败 -0.25，边界 [0.1, 100]）。
6. 邀请码充值
   - Admin 批量制码成功；前端可兑换。
   - 兑换后用户点数增加，`invite_codes` 状态转为已兑换。
7. Stealth 基线
   - Content UI 运行在 `closed` ShadowRoot。
   - 网络请求通过 Background 代理，不由 Content Script 直连 BFF。
   - 默认无全局 `focusin` 高频监听，需快捷键/悬浮球/右键菜单主动触发。
8. Ads-only 场景收口
   - 发送 `scenario=general` 的生成/反馈请求时，服务端仍按 `ads_compliance` 处理。
   - Admin Prompt 列表/新建/沙盒在 `ADS_ONLY_MODE=true` 下均只使用 `ads_compliance`。

## C. Admin 验收

1. `过审漏斗` 页面可看到近 7 天汇总与模板表现。
2. `制码对账` 页面支持批次、库存统计与 CSV 导出。
3. `Prompt 炼丹炉` 支持创建/编辑/启停模板并沙盒运行。
4. `系统健康` 页面显示 BFF、Supabase、模板数、近 24 小时错误数。

## D. 回归构建

1. `npm run build` 全仓通过。
2. 关键工作区单独构建通过：
   - `npm --workspace apps/bff run build`
   - `npm --workspace apps/admin run build`
   - `npm --workspace apps/extension run build`

## E. 充值回归脚本

可用脚本快速验证“余额不足 -> 充值 -> 再生成”闭环：

```bash
BFF_URL=http://localhost:8787 \
ACCESS_TOKEN=<user_access_token> \
DEVICE_ID=<device_id> \
RECHARGE_CODE=FP-ADS-XXXX-XXXX-XXXX-XXXX \
npm run qa:recharge-flow
```

## F. 落地页漏斗回归脚本

可用脚本快速验证 Landing/Recharge 的关键漏斗保护项（CTA 不回退 `/login`、`/recharge` 入口存在、Nginx 域名映射存在）：

```bash
npm run qa:landing-funnel
```

## G. 判定标准

全部 A/B/C/D/E/F 项通过，判定 ADS 场景优化方案达到“可上线落地”。
