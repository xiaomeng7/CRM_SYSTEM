# Reply Inbox（客户回复中心）

Reply Inbox 用于集中查看和处理 Twilio inbound SMS 客户回复，是客户激活流程的核心工作台。

## 1. 数据来源

| 模块 | 数据源 |
|------|--------|
| 回复列表 | `activities`，`activity_type IN ('inbound_sms','inbound_sms_unmatched')` |
| 统计 | 基于上述 activities 及 `tasks` 表聚合 |

字段：`id`, `contact_id`, `account_id`（来自 contact），`phone`, `summary`（短信内容），`occurred_at`，`handled`。

## 2. API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reactivation/replies` | 返回 stats + replies（最多 100 条） |
| PATCH | `/api/reactivation/replies/:id/handled` | 标记该 activity 为已处理 |
| POST | `/api/tasks` | 创建跟进任务 |
| GET | `/api/contacts/:id/activities?limit=5` | 获取联系人最近活动 |

## 3. 统计口径

| 统计 | 计算方式 |
|------|----------|
| Today Replies | 今日 inbound_sms 数量 |
| Unhandled | 无 open task 且 `handled = false` 的回复数 |
| Needs Attention | 消息长度 > 30 或包含 price/quote/call/when/urgent 的回复数 |
| Tasks Created Today | 今日创建的所有 task 数量 |

## 4. 状态判断

| 状态 | 条件 |
|------|------|
| Follow Up | 该 contact 有 open/pending task |
| Handled | activity.handled = true |
| New | 其他情况 |

## 5. 按钮行为

| 按钮 | 当前实现 |
|------|----------|
| 创建跟进任务 | 真实调用 POST /api/tasks |
| 创建 Lead | 真实调用 POST /api/leads，成功后写 activity (activity_type=lead_created)，UI 显示 Lead 已创建 |
| 标记已处理 | 真实调用 PATCH /api/reactivation/replies/:id/handled |
| Do Not Contact | 真实调用 PATCH /api/contacts/:id/do-not-contact，弹确认框填写 reason，成功后 UI 标记 |

## 5.1 Create Lead 真实流程

1. 用户点击「创建 Lead」
2. 前端调用 `POST /api/leads`，body: `{ contact_id, account_id?, source: "reply_inbox", status: "new" }`
3. 后端插入 `leads` 表，并插入 `activities` 记录 (`activity_type = 'lead_created'`, `summary = 'Lead created from reply inbox'`)
4. 前端成功后显示「Lead 已创建」，按钮 disabled 或隐藏

## 5.2 Do Not Contact 真实流程

1. 用户点击「Do Not Contact」
2. 前端弹确认框，可选填写 reason
3. 确认后调用 `PATCH /api/contacts/:id/do-not-contact`，body: `{ value: true, reason }`
4. 后端更新 `contacts.do_not_contact`、`do_not_contact_at`、`do_not_contact_reason`，并写入 activity (`activity_type = 'do_not_contact'`)
5. 前端成功后显示「已标记勿联系」

## 6. 数据库

需执行迁移增加 `handled` 列：

```bash
pnpm --filter @bht/crm run db:activities-handled-migration
```

或手动执行 `apps/crm/database/008_activities_handled.sql`。

## 7. 下一步建议

1. **Automation**：自动创建 follow-up task（部分已在 webhook 实现）
2. **Reactivation Queue**：将 Reply Inbox 与仪表盘批量发送打通
3. **Create Lead**：接入真实创建 Lead API
4. **Do Not Contact**：接入勿再联系标记
