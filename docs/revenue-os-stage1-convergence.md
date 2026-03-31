# Revenue OS Stage 1：主模型收口与迁移说明

## 目标范围

### 主模型（Main Model）
- `accounts`
- `contacts`
- `leads`
- `opportunities`
- `tasks`
- `jobs`（ServiceM8 作业映射层）
- `invoices`
- `activities`
- `external_links`
- `domain_events`
- `lead_sources`
- `campaigns`
- `ad_creatives`
- `lead_scores`
- `weekly_business_snapshots`

### Legacy / Compatibility
- `customers`
- `communications`
- `automations`

## 本次新增迁移

- `apps/crm/database/030_revenue_os_stage1_model_convergence.sql`
- `apps/crm/database/031_revenue_os_stage1_backfill.sql`

## 数据模型变更（Stage 1）

1. `invoices` 新增 `opportunity_id UUID -> opportunities(id)`。
2. `leads` 新增：
   - `landing_page_url`
   - `referrer_url`
   - `click_id`
3. 明确 `jobs` 角色：ServiceM8 作业映射层；经营主线以 `opportunities` 为核心。
4. 价值字段兼容策略：
   - 旧：`opportunities.value_estimate`
   - 新：`opportunities.estimated_value`
   - **写策略：新代码只写 `estimated_value`**
   - **读策略：`COALESCE(estimated_value, value_estimate)`**
   - 迁移中提供 `v_opportunities_value_normalized` 供 API/dashboard 过渡。

## 回填策略（Stage 1）

1. `invoices.opportunity_id` 回填：
   - 主路径：`invoices.job_id -> jobs.id -> jobs.source_opportunity_id`
   - 次路径：`invoices.servicem8_job_uuid -> jobs.servicem8_job_uuid -> jobs.source_opportunity_id`
2. `leads` 兼容查询准备：
   - 由 `source` 文本反推/补齐 `source_id`
   - 自动补字典行到 `lead_sources`
   - 无法映射时回落到 `legacy_unknown`
   - 补充过渡期索引以支撑 `source/source_id/campaign_id` 混合查询

## API 改造优先级（实施清单）

### P0（立即）
1. `POST /api/public/leads`
   - 支持入参：`utm_*`、`source_id`、`campaign_id`、`creative_id`、`product_interest`、`budget_signal`、`urgency_level`
   - 同时兼容 legacy `source`（string）
2. lead 创建后异步评分
   - 在 lead 创建成功后投递评分任务（或轻量异步执行）
   - 写入 `lead_scores`（至少：`lead_id`, `score`, `model_version`, `scored_at`）

### P1（短期）
3. `leads` 查询 API
   - 统一支持 `source/source_id/campaign_id/creative_id/utm_*` 筛选
   - 响应同时返回 `source`（legacy）和 `source_id`（main）
4. `invoices` 查询与任务联动
   - 增加 `opportunity_id` 过滤与回传
   - 任务创建支持 `invoice_id` + `opportunity_id`

### P2（后续）
5. dashboard 与 owner-dashboard
   - 逐步改用主模型查询（`accounts/contacts/leads/opportunities/tasks/jobs/invoices`）
   - legacy 仅作回溯与兜底

## 风险说明

1. **双字段窗口期风险**
   - `value_estimate` 与 `estimated_value` 并存期间，若读写不一致会出现统计偏差。
   - 处理：统一读表达式 + 新写入仅 `estimated_value`。

2. **source 归因离散风险**
   - legacy `source` 文本格式不统一，可能映射到多个 `lead_sources.code`。
   - 处理：先自动归一，再在运营侧建立 source 字典治理规则。

3. **opportunity 回填覆盖不足**
   - 部分历史 invoices 可能无法通过 `job_id/servicem8_job_uuid` 关联到 opportunity。
   - 处理：保留 `NULL`，后续在同步流程中持续补齐。

4. **legacy 查询依赖风险**
   - 现有页面/脚本可能还依赖 `customers/communications/automations`。
   - 处理：阶段内不删除 legacy 表，不改列，不做破坏性迁移。

## Legacy 兼容策略

1. `customers`
   - 保留用于历史客户分群、再激活等既有流程；
   - 新业务主链路不新增对 `customers` 的强依赖。

2. `communications`
   - 作为 legacy SMS log 继续可读写；
   - 新 CRM 通信域建议逐步迁移到 `crm_communications`。

3. `automations`
   - 继续支撑现有自动化触发配置；
   - 新自动化优先落在主模型字段与事件（`domain_events`）之上。
