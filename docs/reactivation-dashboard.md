# 客户激活仪表盘

本文档说明客户激活仪表盘当前接入的数据源、统计口径、状态判断逻辑及后续扩展方向。

## 1. 数据源

| 模块 | 数据源 | 说明 |
|------|--------|------|
| 候选客户 | `crm_account_reactivation_contacts` | 优先使用；若 view 不存在则回退到 `crm_account_reactivation_candidates`（无 contact 明细） |
| 客户回复 | `activities` | `activity_type IN ('inbound_sms','inbound_sms_unmatched')` |
| 待跟进任务 | `tasks` | `status IN ('open','pending')`，优先展示 `created_by = 'twilio-webhook'` |
| 状态推导 | `activities` | 根据 contact 的 outbound / inbound / 关联 task 推导候选客户状态 |

## 2. 顶部统计卡片口径

| 卡片 | 计算方式 |
|------|----------|
| **候选客户** | `crm_account_reactivation_contacts` 行数（最多 200） |
| **待发送** | 候选客户中 `status = '待发送'` 的数量 |
| **队列待发** | `reactivation_sms_queue` 中 `status IN ('preview','queued')` |
| **今日已发** | `activities` 中 `activity_type IN ('sms','outbound_sms')` 且 `occurred_at` 为今天 |
| **已回复** | 最近 30 天 `activity_type IN ('inbound_sms','inbound_sms_unmatched')` 的记录数 |
| **今日待跟进** | `tasks` 中 `status IN ('open','pending')` 且 `due_at` 为今天 |
| **勿再联系** | 当前无正式字段，固定为 0 |

## 3. 激活流程统计

| 阶段 | 来源 |
|------|------|
| 待筛选 | 候选客户总数 |
| 待发送 | 候选客户中 status=待发送 |
| 已发送 | 候选客户中 status=已发送 |
| 已回复 | 候选客户中 status=已回复 |
| 待跟进 | 候选客户中 status=待跟进 |

## 4. 候选客户状态判断

按以下优先级判断（先匹配者优先）：

1. **已回复**：contact 在 `activities` 中有 `inbound_sms` 或 `inbound_sms_unmatched`
2. **待跟进**：contact 有关联的 `status IN ('open','pending')` 的 task
3. **已发送**：contact 在 `activities` 中有 `activity_type IN ('sms','outbound_sms')` 的 outbound 记录
4. **待发送**：以上都不满足

## 5. 按钮

- **批量发送短信**：链接至 SMS Campaign 页面（`/reactivation-queue.html`）
- **发短信**：单条发送，调用 `POST /api/contacts/:id/reactivate`，弹确认框后发送，成功后刷新 dashboard
- **详情**：跳转到 `/contact-detail.html?id=...` 或 `/account-detail.html?id=...`
- 以下为占位：生成今日名单、导出 CSV、创建 Lead

## 5.1 单条发短信

1. 今日优先客户列表中每行有「发短信」按钮
2. 点击后弹确认 modal，显示 contact_name、phone
3. 确认后调用 `POST /api/contacts/:id/reactivate`
4. 成功后当前行状态更新为「已发送」，并刷新 dashboard 数据

## 5.2 Dashboard Details 跳转

- 有 contact_id → `/contact-detail.html?id={contact_id}`
- 仅有 account_id → `/account-detail.html?id={account_id}`

## 6. API

- **GET /api/reactivation/dashboard**：返回 `{ summary, pipeline, candidates, replies, tasks }`

## 7. 下一步

1. **P1 Data Maintenance**：数据维护面板
2. **P2 Reply Inbox**：客户回复中心
3. 接入真实动作：发短信（调用现有 `POST /api/contacts/:id/reactivate`）、创建 Lead、详情跳转
