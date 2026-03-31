# Revenue OS Phase 1 API 影响点清单

本次升级为**加法迁移**，不删字段、不改现有字段类型、不移除旧接口行为。

## 迁移文件

- `apps/crm/database/028_revenue_os_phase1_model_upgrade.sql`
- `apps/crm/database/029_revenue_os_phase1_backfill.sql`

## 新增表影响

- `lead_sources` / `campaigns` / `ad_creatives`
  - 新增营销归因实体，现有 API 不依赖这些表，不会影响当前读写。
- `lead_scores`
  - 用于多版本线索评分，新增视图 `v_latest_lead_scores` 供查询“当前分数”。
- `weekly_business_snapshots`
  - 周级快照表，仅新增能力，不影响现有报表接口。
- `integration_links`
  - 统一外部系统映射表，不替代现有 `external_links`；可并行存在。

## 现有表新增字段影响

### `leads`
- 新增：`source_id`、`campaign_id`、`creative_id`、`utm_*`、`product_interest`、`budget_signal`、`urgency_level`
- 兼容策略：
  - 保留旧字段 `source`（string）继续可读可写；
  - 回填脚本将历史 `source` 尝试映射到 `lead_sources`，无法映射时回填 `legacy_unknown`。

### `opportunities`
- 新增：`pipeline`、`estimated_value`、`probability`、`expected_close_date`、`won_at`、`lost_at`
- 兼容策略：
  - 继续保留旧字段 `value_estimate` 与 `closed_at`；
  - 回填 `estimated_value <- value_estimate`；
  - 回填 `won_at/lost_at <- closed_at`（按 stage）；
  - 旧概率空值按阶段给默认值。

### `invoices`
- 新增：`amount_paid`、`amount_due`、`paid_at`、`last_reminder_at`
- 兼容策略：
  - 保留旧 `amount`、`status`、`last_reminder_sent_at`；
  - 回填 `amount_paid/amount_due`，并从 `last_reminder_sent_at` 回填 `last_reminder_at`。

### `contacts`
- 新增：`preferred_channel`、`last_replied_at`（`role` 已存在，迁移保持幂等）
- 兼容策略：
  - `preferred_channel` 按历史手机/邮箱推断；
  - `last_replied_at` 从 `activities` 的 inbound 类型回填。

### `tasks`
- 新增：`invoice_id`、`completed_at`（`lead_id`/`opportunity_id`/`assigned_to` 已存在，迁移保持幂等）
- 兼容策略：
  - 已完成状态任务回填 `completed_at <- updated_at`。

## 新增视图影响

- `v_latest_lead_scores`
  - 每个 `lead_id` 取最新评分，供 API 直接查询。
- `v_campaign_revenue_summary`
  - 聚合每个 campaign 的线索、转化、商机、估算收入、加权 pipeline 收入。
  - 收入默认使用 `COALESCE(estimated_value, value_estimate, 0)`，兼容 legacy 字段。

## API 代码建议改造点（按优先级）

1. `apps/crm/api/routes/leads.js`
   - `POST / PATCH`：支持写入 `source_id/campaign_id/creative_id`、`utm_*`、`product_interest`、`budget_signal`、`urgency_level`。
   - `GET`：支持按 `source_id/campaign_id/urgency_level` 过滤。
2. `apps/crm/services/leads.js`
   - 查询字段加入营销归因字段，写入时兼容 `source` 和 `source_id`。
3. `apps/crm/api/routes/opportunities.js`
   - `POST / PATCH`：支持 `pipeline/estimated_value/probability/expected_close_date/won_at/lost_at`。
   - 列表支持按 `pipeline`、`expected_close_date` 筛选。
4. `apps/crm/api/routes/cashflow.js` 与 `apps/crm/api/routes/owner-dashboard.js`
   - 统计可优先读取 `estimated_value`，fallback 到 `value_estimate`。
5. `apps/crm/api/routes/tasks.js`
   - 支持 `invoice_id`、`completed_at`；完成动作同时写 `completed_at`。
6. `apps/crm/api/routes/contacts.js`
   - 支持 `preferred_channel`、`last_replied_at` 返回和编辑。
7. 新增只读路由（可选）
   - `/api/analytics/lead-scores/latest`（读 `v_latest_lead_scores`）
   - `/api/analytics/campaign-revenue`（读 `v_campaign_revenue_summary`）

## 不破坏现有功能的保证点

- 所有新增列均 `NULL` 允许，默认不影响旧写入语句。
- 所有 DDL 使用 `IF NOT EXISTS` 或约束存在性检查（幂等）。
- 旧核心字段保留：`leads.source`、`opportunities.value_estimate/closed_at`、`invoices.amount` 等。
- 新视图使用 `COALESCE` 兼容 legacy 数据形态。
