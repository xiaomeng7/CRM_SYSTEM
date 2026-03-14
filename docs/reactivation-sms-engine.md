# Reactivation SMS Engine（激活短信引擎）

## 1. 引擎做什么

Reactivation SMS Engine 是客户激活系统的执行层，负责：

1. 从 segmentation view 中选出值得联系的客户
2. 生成「短信待发送队列」
3. 用户预览短信内容
4. 用户确认后批量发送
5. 发送后写入 activities，形成审计闭环

**目标**：每天/每周找出一小批高价值老客户，由系统排队，人工确认，分批发送，后续客户回复进入 Reply Inbox。不是「自动群发垃圾短信」，而是可控、可审计的激活流程。

## 2. 队列表的作用

`reactivation_sms_queue` 表用于：

- 持久化待发/已发短信
- 支持按 batch_id 分组、按 status 筛选
- 支持预览、重试、审计
- 后续 campaign 分析、retry 逻辑都基于此表

status 值：`queued` | `preview` | `sent` | `failed` | `cancelled`。

## 3. generate 和 send 的区别

| 接口 | 作用 |
|------|------|
| `POST /api/reactivation/queue/generate` | 从候选客户生成队列，写入 `reactivation_sms_queue`，status=preview。**不发短信**。 |
| `POST /api/reactivation/queue/send` | 对指定 batch_id 的 preview/queued 记录逐条调用 Twilio 发送，并写入 activities。**人工调用**。 |

## 4. 为什么先 preview 再 send

- **可控**：先生成队列，人工预览内容、数量后再决定是否发送
- **防误发**：不会自动群发
- **可审计**：每条记录都有 status，发送前可检查、取消

## 5. 排除规则

生成队列时排除：

- 无 phone 的客户
- 最近 30 天已有联系记录的 contact（activities 中有 sms/inbound_sms/outbound_sms/call）
- 已在队列中且 status 为 queued/preview/sent 的 contact（去重）
- priority_score < min_priority_score 的
- months_since_last_job < 6 的（由 view 已过滤）

**do_not_contact**：`contacts.do_not_contact = true` 的客户会排除：

- `crm_account_reactivation_contacts` view 中已排除 `do_not_contact = true` 的 contacts
- `POST /api/reactivation/queue/generate` 使用的候选来自该 view，故 do_not_contact 的 contact 不会进入队列
- 若 account 下多个 contact，被标记 do_not_contact 的不会入选；若仍有其他可联系 contact，该 account 仍可入选

## 6. Activity 审计如何写入

每次 Twilio 发送成功后：

- 插入 `activities`：
  - `activity_type = 'outbound_sms'`
  - `contact_id`
  - `summary` = 短信内容（截断 500 字）
  - `created_by = 'reactivation-engine'`

activities 表无 account_id 列，仅用 contact_id。所有发送动作均可追溯。

## 7. 未来接入 dashboard / campaign UI

- **Dashboard**：可读取 queue 中 preview/queued 数量、今日 sent 数量（queue 或 activities），与现有 summary 卡片对接
- **Campaign 页面**：展示 batch_id、queued/sent/failed 数量、每条短信预览、人工确认发送按钮

## API 速查

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/reactivation/queue/generate` | 生成队列，body: `{ limit, min_priority_score }` |
| GET | `/api/reactivation/queue` | 查询队列，params: `status`, `batch_id`, `limit` |
| POST | `/api/reactivation/queue/send` | 发送批次，body: `{ batch_id }` |
