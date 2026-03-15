# Owner Dashboard

Owner Dashboard 是 CRM 首页，目标：**让业务负责人 30 秒内了解公司状态**。

---

## 1. 页面布局（快速浏览优先）

自上而下五块区域：

| 顺序 | 区域 | 说明 |
|------|------|------|
| 1 | **Cashflow** | 顶部，5 个指标卡片 |
| 2 | **Priority Customers** | 前 5 个优先级联系人 |
| 3 | **Tasks** | 按 Overdue / Today / Upcoming 分组 |
| 4 | **Opportunities** | 按 stage 的漏斗 + 潜在收入 |
| 5 | **SMS Replies** | 最新入站短信 |

---

## 2. 区域明细

### 2.1 Cashflow

| 指标 | 数据来源 | 说明 |
|------|----------|------|
| Jobs Won This Week | CRM opportunities | `stage = 'won'` 且 `won_at` / `closed_at` 在本周 |
| Quotes Sent | CRM opportunities | `stage = 'quote_sent'` |
| Invoices Issued | ServiceM8 invoices | 本周开具数量 |
| Payments Received | ServiceM8 invoices | `status = 'paid'` 金额总和 |
| Outstanding | ServiceM8 invoices | `status != 'paid'` 金额总和 |

### 2.2 Priority Customers

- **来源**：`crm_priority_contacts` 视图，按 `priority_score` 降序取前 5
- **展示**：name, phone, priority_score
- **操作**：Call, SMS, Create Lead

### 2.3 Tasks

- **来源**：`tasks` 表，`status IN ('open','pending')`
- **分组**：Overdue（过期）、Today（今天到期）、Upcoming（未来）
- **展示**：任务标题、联系人、到期日
- **操作**：Call, SMS, Complete

### 2.4 Opportunities

- **来源**：`opportunities` 表
- **展示**：各 stage 数量：`site_visit_booked`, `inspection_done`, `quote_sent`, `decision_pending`, `won`
- **潜在收入**：`SUM(value_estimate)`（open 机会）

### 2.5 SMS Replies

- **来源**：`activities` 表，`activity_type IN ('inbound_sms','inbound_sms_unmatched')`
- **展示**：contact, message（summary）, received_at（occurred_at）
- **操作**：Create Task, Create Opportunity

---

## 3. API

| 端点 | 说明 |
|------|------|
| `GET /api/owner-dashboard` | 一次性返回：cashflow, priorityCustomers, tasks, opportunities, smsReplies |

---

## 4. 前端

- **页面**：`index.html`（CRM 首页）
- **加载**：单次 `GET /api/owner-dashboard`，减少请求数
- **样式**：grid 布局、紧凑表格、操作按钮，方便快速浏览和操作
