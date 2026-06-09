# SEO Control Center Phase 1 精简版规范 v1

## 1. Phase 1 目标

一句话定义：**每周 SEO task dashboard + 人工创建/管理内容任务**。

---

## 2. Phase 1 明确不做

Phase 1 范围内明确排除以下能力：

- 不接 Google Search Console（GSC）
- 不接 GA4
- 不接 Google Ads
- 不做 AI 自动草稿生成
- 不做自动发布
- 不改 `apps/web` 内容
- 不做 SEO performance ROI（不做内容到营收归因）

---

## 3. 状态枚举（定稿）

### 3.1 任务状态 `task_status`

- `draft`
- `pending_approval`
- `approved`
- `in_progress`
- `done`
- `rejected`

### 3.2 关键词状态 `keyword_status`

- `active`
- `paused`
- `used`

### 3.3 优先级 `priority`

- `high`
- `medium`
- `low`

### 3.4 意图分类 `intent`

- `pre_purchase`
- `builder`
- `service`
- `suburb`
- `advisory`
- `informational`

---

## 4. Phase 1 数据模型定稿

Phase 1 仅包含 3 张核心表：

- `seo_keywords`
- `seo_content_tasks`
- `seo_weekly_reports`

后置可选：`seo_task_activity_logs`（本期不做）。

### 4.1 `seo_keywords`

- purpose  
  维护 SEO 关键词机会池（人工录入/维护），作为任务创建的来源之一。

- required fields  
  - `id` (uuid, pk)  
  - `keyword` (text)  
  - `intent` (enum: intent)  
  - `status` (enum: keyword_status)  
  - `priority` (enum: priority)  
  - `created_at` (timestamp)  
  - `updated_at` (timestamp)

- optional fields  
  - `target_page_hint` (text)  
  - `notes` (text)  
  - `source` (text, 默认 `manual`)  
  - `created_by` (text/uuid, 视 CRM 用户模型而定)

- enum fields  
  - `intent`  
  - `status`  
  - `priority`

- relationships  
  - 1:N -> `seo_content_tasks.keyword_id`

- timestamps  
  - `created_at` / `updated_at`

- indexes 建议  
  - `idx_seo_keywords_status` on (`status`)  
  - `idx_seo_keywords_intent` on (`intent`)  
  - `idx_seo_keywords_priority` on (`priority`)  
  - `idx_seo_keywords_keyword_unique` unique on (`keyword`)

### 4.2 `seo_content_tasks`

- purpose  
  管理每周 SEO 内容任务，从创建、审批到执行完成的完整状态流。

- required fields  
  - `id` (uuid, pk)  
  - `week_start_date` (date)  
  - `title` (text)  
  - `status` (enum: task_status)  
  - `priority` (enum: priority)  
  - `intent` (enum: intent)  
  - `owner_id` (text/uuid)  
  - `created_by` (text/uuid)  
  - `created_at` (timestamp)  
  - `updated_at` (timestamp)

- optional fields  
  - `keyword_id` (uuid, nullable fk -> `seo_keywords.id`)  
  - `target_page` (text)  
  - `task_type` (text; 先用字符串，Phase 1 不强制 enum)  
  - `description` (text)  
  - `approval_note` (text)  
  - `approved_by` (text/uuid)  
  - `approved_at` (timestamp)  
  - `completed_at` (timestamp)

- enum fields  
  - `status`  
  - `priority`  
  - `intent`

- relationships  
  - N:1 -> `seo_keywords`（可为空，允许不绑定关键词直接建任务）

- timestamps  
  - `created_at` / `updated_at`  
  - （业务时间）`approved_at` / `completed_at`（可选）

- indexes 建议  
  - `idx_seo_tasks_week_status` on (`week_start_date`, `status`)  
  - `idx_seo_tasks_owner` on (`owner_id`)  
  - `idx_seo_tasks_priority` on (`priority`)  
  - `idx_seo_tasks_intent` on (`intent`)  
  - `idx_seo_tasks_keyword_id` on (`keyword_id`)

### 4.3 `seo_weekly_reports`

- purpose  
  记录每周 SEO 任务执行总结与下周行动计划（运营复盘文档）。

- required fields  
  - `id` (uuid, pk)  
  - `week_start_date` (date)  
  - `summary` (text)  
  - `created_by` (text/uuid)  
  - `created_at` (timestamp)  
  - `updated_at` (timestamp)

- optional fields  
  - `highlights` (text/json)  
  - `blockers` (text/json)  
  - `next_actions` (text/json)  
  - `status` (text, 默认 `draft`)

- enum fields  
  - Phase 1 不强制 enum（保持轻量）

- relationships  
  - 逻辑上按 `week_start_date` 与 `seo_content_tasks` 关联（不强制外键）

- timestamps  
  - `created_at` / `updated_at`

- indexes 建议  
  - `idx_seo_weekly_reports_week_unique` unique on (`week_start_date`)  
  - `idx_seo_weekly_reports_created_by` on (`created_by`)

### 4.4 后置表说明：`seo_task_activity_logs`（不在 Phase 1 实施）

- 用于记录任务字段和状态变更轨迹（审计增强）。
- Phase 1 暂用 `updated_at` + `approved_by/approved_at` 满足最小审计。

---

## 5. API v1 定稿

Phase 1 仅保留以下 API。

### 5.1 `GET /api/seo/dashboard`

- purpose  
  返回当前周任务运营概览 KPI（任务视角，不含外部 SEO 平台指标）。

- request  
  - query: `week_start_date`（可选，不传则取当前周）

- response  
  - `week_start_date`
  - `kpi`: `total_tasks`, `pending_approval`, `approved`, `in_progress`, `done`, `rejected`
  - `high_priority_open_tasks`
  - `recent_updates`（可选）

- validation  
  - `week_start_date` 必须为合法日期格式（YYYY-MM-DD）

- error handling  
  - `400` 参数格式错误  
  - `500` 服务端错误

### 5.2 `GET /api/seo/opportunities`

- purpose  
  查询关键词机会列表。

- request  
  - query: `status?`, `intent?`, `priority?`, `keyword?`

- response  
  - `items[]`: keyword 记录列表  
  - `pagination`（可选）

- validation  
  - 枚举参数必须在定义范围内

- error handling  
  - `400` 非法枚举值  
  - `500` 服务端错误

### 5.3 `POST /api/seo/opportunities`

- purpose  
  人工新增关键词机会。

- request  
  - body: `keyword`, `intent`, `priority`, `status?`, `target_page_hint?`, `notes?`

- response  
  - `id`  
  - `item`（创建后的完整记录）

- validation  
  - `keyword` 非空且去除首尾空格后有效  
  - `intent/priority/status` 枚举校验  
  - keyword 唯一性校验

- error handling  
  - `400` 必填缺失/格式错误  
  - `409` keyword 冲突  
  - `500` 服务端错误

### 5.4 `PATCH /api/seo/opportunities/:id`

- purpose  
  编辑关键词机会（状态、优先级、备注等）。

- request  
  - params: `id`
  - body: 可选字段 patch（`intent`, `priority`, `status`, `target_page_hint`, `notes`）

- response  
  - `id`
  - `item`（更新后）

- validation  
  - `id` 合法  
  - patch 字段必须在允许范围  
  - 枚举值校验

- error handling  
  - `400` 非法参数  
  - `404` 记录不存在  
  - `500` 服务端错误

### 5.5 `GET /api/seo/tasks`

- purpose  
  查询任务列表（按周、状态、负责人筛选）。

- request  
  - query: `week_start_date?`, `status?`, `priority?`, `intent?`, `owner_id?`

- response  
  - `items[]`：任务列表  
  - `summary`（可选：按状态计数）

- validation  
  - 日期和枚举参数校验

- error handling  
  - `400` 参数错误  
  - `500` 服务端错误

### 5.6 `POST /api/seo/tasks`

- purpose  
  人工创建任务。

- request  
  - body: `week_start_date`, `title`, `priority`, `intent`, `owner_id`, `keyword_id?`, `target_page?`, `description?`

- response  
  - `id`
  - `item`（创建后的任务，默认 `status=draft`）

- validation  
  - 必填字段校验  
  - 枚举校验  
  - `keyword_id` 存在性校验（若传入）

- error handling  
  - `400` 参数错误  
  - `404` 关联 keyword 不存在  
  - `500` 服务端错误

### 5.7 `PATCH /api/seo/tasks/:id`

- purpose  
  编辑任务基础信息（非审批动作）。

- request  
  - params: `id`
  - body: patch 字段（`title`, `priority`, `intent`, `owner_id`, `target_page`, `description`, `keyword_id`）

- response  
  - `id`
  - `item`

- validation  
  - `id` 合法  
  - patch 字段白名单校验  
  - 枚举/外键校验

- error handling  
  - `400` 非法 patch  
  - `404` 任务不存在  
  - `500` 服务端错误

### 5.8 `POST /api/seo/tasks/:id/approve`

- purpose  
  审批任务（approve/reject）。

- request  
  - params: `id`
  - body: `action` (`approve` | `reject`), `note?`

- response  
  - `id`
  - `status`（`approved` 或 `rejected`）
  - `approved_by`
  - `approved_at`

- validation  
  - `action` 必须为 `approve/reject`  
  - 仅 owner/admin 角色可调用  
  - 状态流转合法性校验（如 `pending_approval` 才可审批）

- error handling  
  - `400` action 非法/状态非法  
  - `403` 无权限  
  - `404` 任务不存在  
  - `500` 服务端错误

### 5.9 `POST /api/seo/tasks/:id/status`

- purpose  
  执行中的状态流转。

- request  
  - params: `id`
  - body: `status`（目标状态）, `note?`

- response  
  - `id`
  - `status`
  - `updated_at`

- validation  
  - 目标状态必须在 `task_status`  
  - 状态机规则校验（示例：`approved -> in_progress -> done`，禁止跳转到不合理状态）

- error handling  
  - `400` 非法状态/非法流转  
  - `403` 无权限  
  - `404` 任务不存在  
  - `500` 服务端错误

### 5.10 `GET /api/seo/weekly-reports`

- purpose  
  查询周报列表/详情。

- request  
  - query: `week_start_date?`

- response  
  - `items[]` 或单条 `item`

- validation  
  - `week_start_date` 日期格式校验

- error handling  
  - `400` 参数错误  
  - `500` 服务端错误

### 5.11 `POST /api/seo/weekly-reports`

- purpose  
  新增或更新周报（按周幂等 upsert）。

- request  
  - body: `week_start_date`, `summary`, `highlights?`, `blockers?`, `next_actions?`

- response  
  - `id`
  - `item`

- validation  
  - `week_start_date` 与 `summary` 必填  
  - 文本长度上限控制（避免超大 payload）

- error handling  
  - `400` 必填缺失/格式错误  
  - `500` 服务端错误

---

## 6. UI 页面 v1

Phase 1 仅做：

- `/admin/seo`
- `/admin/seo/tasks`
- `/admin/seo/opportunities`

### 6.1 `/admin/seo`

- 页面目标  
  提供“本周 SEO 任务运营总览”，作为周一例会入口。

- 显示数据  
  - 本周任务 KPI（total/pending_approval/approved/in_progress/done/rejected）
  - 高优先未完成任务列表（Top N）
  - 最近更新任务（可选）

- 主要按钮  
  - `查看任务`（跳转 `/admin/seo/tasks`）
  - `新增任务`
  - `新增关键词机会`

- 筛选条件  
  - 周（默认当前周）

- 空状态  
  - “本周暂无任务，请先新增关键词机会或创建任务”

- mobile 支持  
  - Phase 1 采用 **desktop-first**，移动端仅保证基础可读，不做专门交互优化。

### 6.2 `/admin/seo/tasks`

- 页面目标  
  完成任务全生命周期管理（创建、审批、执行、完成）。

- 显示数据  
  - 任务列表：标题、状态、优先级、intent、负责人、周、更新时间
  - 任务详情抽屉/面板：描述、目标页面、审批备注

- 主要按钮  
  - `新建任务`
  - `编辑任务`
  - `提交审批`（`draft -> pending_approval`）
  - `Approve` / `Reject`（owner/admin）
  - `标记进行中` / `标记完成`

- 筛选条件  
  - week, status, priority, intent, owner

- 空状态  
  - “暂无任务，点击新建任务开始本周计划”

- mobile 支持  
  - desktop-first。

### 6.3 `/admin/seo/opportunities`

- 页面目标  
  维护关键词机会池，支撑任务创建。

- 显示数据  
  - keyword、intent、priority、status、target_page_hint、updated_at

- 主要按钮  
  - `新增关键词`
  - `编辑`
  - `暂停`（状态改为 `paused`）
  - `标记已使用`（状态改为 `used`）

- 筛选条件  
  - status, intent, priority, keyword 模糊搜索

- 空状态  
  - “暂无关键词机会，请先新增”

- mobile 支持  
  - desktop-first。

---

## 7. 权限规则

最小 RBAC 规则：

- owner/admin  
  - 可 approve/reject  
  - 可创建/编辑任务与关键词  
  - 可修改任务状态

- marketing assistant  
  - 可创建/编辑 tasks  
  - 可创建/编辑 opportunities  
  - 不可 approve/reject（仅提交审批）

- technician/inspector  
  - Phase 1 暂不进入主流程  
  - “上传 notes/photos”能力后置（不纳入本期页面）

- AI assistant  
  - 可提供建议（若未来接入）  
  - 不能直接 approve/publish  
  - 不能越权改任务最终状态

---

## 8. 每周一操作流程（v1）

1. owner/admin 打开 `/admin/seo` 查看本周任务概览。  
2. marketing assistant 在 `/admin/seo/opportunities` 录入/更新关键词机会。  
3. marketing assistant 在 `/admin/seo/tasks` 基于机会创建本周任务。  
4. 创建者将任务从 `draft` 提交到 `pending_approval`。  
5. owner/admin 审批任务：`approved` 或 `rejected`。  
6. 已审批任务进入执行：更新为 `in_progress`。  
7. 执行完成后标记为 `done`。  
8. 周末或下周一在 `/api/seo/weekly-reports` 记录周报总结。  
9. 周报中记录下周重点关键词和任务方向。  

---

## 9. Phase 1 开发顺序（Sprint）

按以下顺序执行：

1. migration（仅实现本规范最小三表，避免超范围）  
2. API（先 tasks，再 opportunities，再 dashboard/weekly-reports）  
3. `/admin/seo/tasks` 页面  
4. `/admin/seo/opportunities` 页面  
5. `/admin/seo` dashboard 页面  
6. QA（流程测试 + 权限测试 + 状态机测试）

---

## 10. 验收标准（Checklist）

- [ ] 能创建关键词（`seo_keywords`）  
- [ ] 能创建任务（`seo_content_tasks`）  
- [ ] 能审批任务（approve/reject）  
- [ ] 能按规则做状态流转（`draft -> pending_approval -> approved -> in_progress -> done`）  
- [ ] Dashboard KPI 统计正确  
- [ ] Weekly report 可新增/更新并按周查询  
- [ ] 全流程不触碰 `apps/web` 内容  
- [ ] 不依赖 GSC/GA4/Google Ads 外部数据

---

## 11. 风险控制

Phase 1 必须遵循以下红线：

- 不做 AI spam  
- 不自动改 H1  
- 不自动发文章  
- 不产生虚假案例  
- 不影响 CRM 现有模块稳定性

补充控制建议：

- 任务状态流转做后端白名单校验，避免脏状态。  
- 审批动作记录 `approved_by`/`approved_at`，保证可追溯。  
- 所有“自动化”按钮在 Phase 1 UI 不展示，避免误操作。  

