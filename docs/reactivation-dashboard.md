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
| **勿再联系** | 候选客户中 `contacts.do_not_contact = true` 的数量 |

## 3. 客户回复去哪里看

**客户回复的完整处理请前往 Reply Inbox（`/reply-inbox.html`）。**

- Dashboard 上「客户回复」模块仅展示最近回复的预览
- 如需查看全部回复、标记 sentiment、创建跟进任务等，请点击 **查看全部回复** 按钮进入 Reply Inbox

## 4. 今日优先客户 vs 完整列表

- **今日优先客户**（默认）：每天只显示 **20 条** 未联系的客户，按评分从高到低，联系过的次日不再出现
- **完整列表**：点击顶部「候选客户」卡片可切换为完整候选列表（最多 200 人），包含各状态
- 再次点击「候选客户」可返回今日优先视图

## 5. 激活流程统计

| 阶段 | 来源 |
|------|------|
| 待筛选 | 候选客户总数 |
| 待发送 | 候选客户中 status=待发送 |
| 已加入队列 | 候选客户中 status=已加入队列 |
| 已发送 | 候选客户中 status=已发送 |
| 已回复 | 候选客户中 status=已回复 |
| 待跟进 | 候选客户中 status=待跟进 |
| 勿再联系 | 候选客户中 status=勿再联系 |

## 6. 候选客户状态判断

按以下**优先级**判断（先匹配者优先）：

1. **勿再联系**：`contacts.do_not_contact = true`
2. **已回复**：contact 在 `activities` 中有 `inbound_sms` 或 `inbound_sms_unmatched`
3. **待跟进**：contact 有关联的 `status IN ('open','pending')` 的 task
4. **已加入队列**：contact 在 `reactivation_sms_queue` 中 `status IN ('preview','queued')`
5. **已发送**：contact 在 `activities` 中有 `activity_type IN ('sms','outbound_sms')` 的 outbound 记录
6. **待发送**：以上都不满足

## 7. 状态颜色与行背景

| 状态 | Badge 颜色 | 行背景 |
|------|------------|--------|
| 待发送 | 灰色 | 白色 |
| 已加入队列 | 蓝色 | 浅蓝 (bg-blue-50/60) |
| 已发送 | 灰蓝 | 浅灰 (bg-slate-50/80) |
| 已回复 | 绿色 | 浅绿 (bg-emerald-50/60) |
| 待跟进 | 黄色 | 浅黄 (bg-amber-50/60) |
| 勿再联系 | 红色 | 浅红 (bg-rose-50/60) |

## 8. Last SMS 显示规则

- 在「客户」列下方，若该 contact 曾发送过短信，显示：`Last SMS: 14 Mar 2026`
- 数据来源：`activities` 中 `activity_type IN ('sms','outbound_sms')` 的 `occurred_at` 或 `reactivation_sms_queue.sent_at`，取最近一次
- 若从未发过短信，则不显示

## 9. 按钮

- **批量发送短信**：链接至 SMS Campaign 页面（`/reactivation-queue.html`）
- **Add to Campaign（加入短信队列）**：将客户加入 SMS Campaign 预览队列，不发送短信；需在 SMS Campaign 页面查看、编辑后发送
- **详情**：跳转到 `/contact-detail.html?id=...` 或 `/account-detail.html?id=...`
- 以下为占位：生成今日名单、导出 CSV、创建 Lead

## 9.1 Dashboard 不直接发送 SMS

**所有短信必须通过 SMS Campaign 页面（`/reactivation-queue.html`）发送。** Dashboard 不提供直接发送功能，避免未经预览即发送的风险。

- 今日优先客户列表中每行有 **Add to Campaign** 按钮
- 点击后弹确认 modal，确认后调用 `POST /api/reactivation/queue/add`，body: `{ contact_id, source: "dashboard" }`
- 后端将客户加入 `reactivation_sms_queue`，status = 'preview'，生成 message 使用 buildReactivationMessage
- 成功后提示：Customer added to SMS Campaign. Please review message before sending.
- 用户需进入 SMS Campaign 页面查看、编辑、选择模板后再发送

## 9.2 Dashboard Details 跳转

- 有 contact_id → `/contact-detail.html?id={contact_id}`
- 仅有 account_id → `/account-detail.html?id={account_id}`

## 10. API 与 candidate 字段

**GET /api/reactivation/dashboard** 返回的 `candidates` 中每个 item 包含：

- 基础字段：account_id, contact_id, contact_name, phone, suburb, jobs_count, last_job_date, months_since_last_job, priority_score
- 状态相关：status, do_not_contact, has_inbound_sms, has_open_task, in_queue_status（'preview' 或 'queued' 或 null）, last_sms_at

- **GET /api/reactivation/dashboard**：返回 `{ summary, pipeline, candidates, replies, tasks }`
- **POST /api/reactivation/queue/add**：将单个 contact 加入预览队列，body: `{ contact_id, source?: "dashboard" }`，返回 `{ ok, batch_id }`

## 11. 下一步

1. **P1 Data Maintenance**：数据维护面板
2. **P2 Reply Inbox**：客户回复中心
3. 接入真实动作：Add to Campaign（`POST /api/reactivation/queue/add`）、创建 Lead、详情跳转
