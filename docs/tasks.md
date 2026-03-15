# CRM Tasks 设计原则

## 核心原则

**Tasks 只用于提醒用户做机器无法完成的事情。**

机器可以完成的工作（SMS 自动回复、初筛、批量发送、联系人同步等）**不应该**生成 task。

Tasks 页面**只显示需要人工行动**的任务。

---

## 允许的 Task 类型

| 类型 | 说明 |
|------|------|
| Call customer | 致电客户 |
| Prepare quote | 准备报价 |
| Schedule inspection | 安排检查 |
| Follow up quote | 报价跟进 |
| Review complex SMS | 审阅无法理解的 SMS |

---

## Task 自动生成规则

### 1. 客户 SMS 请求电话

- **触发**：intent = `call_request`
- **创建 Task**：
  - title = `"Call {contact_name} (SMS request)"`
  - priority = high
  - due_at = today
  - source = `sms_intent`

### 2. 客户询价

- **触发**：intent = `quote_request`
- **创建 Task**：
  - title = `"Prepare quote for {contact_name}"`
  - priority = high
  - due_at = today
  - source = `sms_intent`

### 3. 客户同意检查

- **触发**：intent = `inspection_request`
- **创建 Task**：
  - title = `"Schedule inspection for {contact_name}"`
  - priority = high
  - due_at = today
  - source = `sms_intent`

### 4. 报价后 follow-up

- **触发**：quote_sent event
- **创建 Task**：
  - title = `"Follow up quote with {contact_name}"`
  - priority = medium
  - due_at = now + 3 days
  - source = `quote_sent`

### 5. AI 无法理解 SMS

- **触发**：intent = `unknown`
- **创建 Task**：
  - title = `"Review SMS from {contact_name}"`
  - priority = medium
  - due_at = today
  - source = `sms_intent`

---

## 禁止生成 Task 的场景

以下场景**不应**创建 task：

- 自动短信回复
- SMS 初筛
- SMS campaign 发送
- 联系人同步
- 系统维护任务

---

## Tasks 页面 UI

### 设计要求

页面必须简单，每个 task card 包含：

| 字段 | 说明 |
|------|------|
| title | 任务标题 |
| contact_name | 联系人姓名 |
| phone | 电话 |
| suburb | 区域 |
| due date | 到期日 |
| source | 来源（如 sms_intent, quote_sent） |

### 按钮

- **Call**：拨打电话
- **SMS**：发送短信
- **Complete**：标记完成

### 分组建议

- Overdue
- Today
- Upcoming

---

## Outcome 驱动的完成流程

完成 task 时必须记录 outcome，系统根据 outcome 自动创建下一步。

### 适用范围

仅对 **title 以 "Call" 开头** 的 task 要求选择 outcome；其他 task 可直接完成。

### 点击 Complete 时

- 若为 Call task：弹出 **Call Outcome** 弹窗，必须选择以下之一
- 若非 Call task：可直接完成

### Call Outcome 选项与后续动作

| Outcome | 系统动作 |
|---------|----------|
| **Interested** | 创建 opportunity，stage = discovery |
| **Needs quote** | 创建 task `Prepare quote for {contact_name}`，due = today |
| **Book inspection** | 创建 task `Schedule inspection for {contact_name}`，due = today |
| **Call later** | 用户选择延迟（1 week / 1 month / 3 months），创建 task `Follow up with {contact_name}` |
| **No answer** | 创建 task `Call {contact_name} again`，due = tomorrow |
| **Not interested** | 将 contact 标记为 inactive，关闭相关 opportunity |

### Task 状态

- `open`
- `completed`
- `cancelled`

---

## API

- **GET /api/tasks**：列表（status=open,pending，按 due_at 排序），返回 contact_name、phone、suburb、source
- **POST /api/tasks**：创建 task（需 contact_id）
- **PATCH /api/tasks/:id**：更新 status
- **POST /api/tasks/:id/complete**：完成并记录 outcome，body: `{ outcome?, follow_up_delay? }`（Call task 必填 outcome，call_later 时必填 follow_up_delay）

---

## 与 Dashboard 的关联

- **今日待跟进**：`tasks` 中 `status IN ('open','pending')` 且 `due_at` 为今天 的数量
- Dashboard 上「今日待跟进任务」模块展示今日到期任务，点击「进入任务页」跳转 `/tasks.html`
