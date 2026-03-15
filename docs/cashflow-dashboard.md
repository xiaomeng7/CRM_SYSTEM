# Cashflow Dashboard

本文档定义 CRM 的「收入与现金流」仪表盘，遵循原则：**所有财务数据来源于 ServiceM8，CRM 仅展示聚合数据**。不在 CRM 内创建或修改发票逻辑。

---

## 1. 数据来源原则

| 数据类型 | 来源 | CRM 职责 |
|----------|------|----------|
| Invoice（发票） | ServiceM8 API 同步 | 只读展示，不创建、不修改 |
| Opportunity（机会） | CRM | 用于 Jobs Won、Quotes Sent 等销售漏斗指标 |
| 财务汇总 | 对 ServiceM8 同步数据的聚合 | 展示仅 |

---

## 2. Revenue & Cashflow 指标

| 指标 | 数据来源 | 计算逻辑 |
|------|----------|----------|
| **Jobs Won This Week** | CRM opportunities | `stage = 'won'` 且 `won_at`（或 `closed_at`）在本周内 |
| **Quotes Sent** | CRM opportunities | `stage = 'quote_sent'` |
| **Invoices Issued This Week** | ServiceM8 → invoices | `invoice_date` 在本周内 |
| **Payments Received** | ServiceM8 → invoices | `status` 为 paid（不区分大小写） |
| **Outstanding Amount** | ServiceM8 → invoices | `status` 为 unpaid（或 Sent 等未付状态）的 `amount` 之和 |

---

## 3. 表格

### 3.1 Outstanding Invoices（待收发票）

| 字段 | 来源 | 说明 |
|------|------|------|
| customer | accounts.name | 客户名称 |
| amount | invoices.amount | 未付金额 |
| due_date | invoices.due_date | 到期日（来自 ServiceM8 同步） |
| days_overdue | 计算 | `CURRENT_DATE - due_date`，当 `due_date < today` 时 |

- 筛选条件：`invoices.status` 表示未付（unpaid、sent 等）
- `due_date` 由 ServiceM8 API 同步，若 API 不提供则可为空

### 3.2 Quotes Waiting Decision（待决报价）

| 字段 | 来源 | 说明 |
|------|------|----------|
| customer | accounts.name | 客户名称 |
| quote_value | opportunities.value_estimate | 报价金额 |
| quote_sent_at | opportunities.quote_sent_at | 报价发送时间 |
| days_since_quote | 计算 | `CURRENT_DATE - quote_sent_at::date` |

- 筛选条件：`opportunities.stage` 为 `quote_sent` 或 `decision_pending`

---

## 4. 发票同步（ServiceM8 → CRM）

- 所有发票数据通过 `syncAllFromServiceM8` 从 ServiceM8 API 拉取
- 映射字段：`invoice_number`, `amount`, `invoice_date`, `status`, `due_date`（若 API 提供）
- 状态（status）按 ServiceM8 原始值存储，展示时用不区分大小写匹配（如 paid、Paid、PAID）

---

## 5. API

| 端点 | 说明 |
|------|------|
| `GET /api/cashflow/dashboard` | 返回：指标（jobsWonThisWeek, quotesSent, invoicesIssuedThisWeek, paymentsReceived, outstandingAmount）、outstandingInvoices、quotesWaitingDecision |

---

## 6. 前端

- 仪表盘位置：主 Dashboard 页面的「Revenue & Cashflow」区域
- 展示：5 个指标卡片 + Outstanding Invoices 表 + Quotes Waiting Decision 表

---

## 7. 数据库迁移

部署前需执行：

```bash
psql "$DATABASE_URL" -f apps/crm/database/014_invoices_due_date.sql
psql "$DATABASE_URL" -f apps/crm/database/015_opportunities_quote_won_dates.sql
```

- `014`：为 invoices 增加 `due_date`（从 ServiceM8 同步）
- `015`：为 opportunities 增加 `quote_sent_at`、`won_at`
