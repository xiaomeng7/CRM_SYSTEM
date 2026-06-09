# SEO Control Center / Marketing Command Center Architecture (Draft v0.1)

## 1) 产品目标

SEO Control Center 是 BHT 在 CRM 内部的一个“每周增长操作系统”，目标是把 SEO 分析、内容规划、人工审核发布、线索回收追踪串成闭环，而不是自动批量生成低质量内容。

核心目标：

- 每周 SEO 任务中心：固定节奏输出“本周该做什么”。
- AI 辅助内容策略：识别关键词机会、给出页面更新建议和文章方向。
- 人工审核发布：所有可见内容必须经过 owner/marketing 审核。
- 业务数据打通：连接 website、CRM、inspection/report 数据，追踪文章到线索和营收。
- 保守上线：不破坏现有 `apps/web`、`apps/crm`、`apps/essential-report`、Netlify 部署链路。

---

## 2) 用户角色

### CEO / Owner

- 定义本周优先级（市场、服务、区域、业务目标）。
- 审批关键词机会和内容任务。
- 审核终稿并批准发布。
- 查看 ROI 仪表盘（内容 -> lead -> inspection -> revenue）。

### Marketing Assistant

- 处理日常任务：补充素材、整理 brief、维护内容日历。
- 对 AI 生成的大纲/草稿进行编辑和事实校验。
- 执行发布前 checklist（合规、品牌语气、链接、CTA）。

### Technician / Inspector

- 提供真实工地照片、现场 observations、常见故障模式。
- 补充“真实案例证据”，提升 E-E-A-T。
- 对技术结论做事实确认（避免错误承诺）。

### AI Assistant

- 每周分析关键词和页面表现，输出机会与任务建议。
- 生成内容大纲与初稿建议。
- 推荐内链和 sitemap 更新建议。
- 不可越权发布，不可直接修改核心 money page。

---

## 3) 核心模块设计

### A. SEO Dashboard

功能视图：

- Traffic overview：sessions、organic users、trend（7/28/90 天）。
- Top pages：按流量、转化率、平均排名、CTR 展示。
- Top keywords：曝光/点击/CTR/排名变化。
- CTR opportunities：高曝光低 CTR 关键词和页面。
- Landing page performance：各 funnel 页面流量与转化。
- Lead conversion summary：SEO leads 数量、合格线索、预约数、营收贡献。

设计原则：

- “趋势 + 行动”并列展示（不只看报表，要能直接转任务）。
- 支持按服务线（pre-purchase / switchboard / smart-home 等）筛选。

### B. Keyword Opportunity Engine

输入数据源：

- Google Search Console（query/page/impressions/clicks/position）。
- Google Ads search terms（商业意图词、否定词提示）。
- CRM lead source/UTM（线索质量和成交反馈）。
- internal site pages（当前页面覆盖主题与薄弱区）。

输出：

- keyword opportunities（机会词清单）。
- suggested page updates（已有页面优化建议）。
- suggested new articles（新增内容建议）。
- priority score（综合评分）。

建议评分维度（0-100）：

- Opportunity（曝光高 + 排名 5-20 + CTR 偏低）。
- Business fit（与 BHT 服务契合度）。
- Commercial intent（成交可能性）。
- Evidence availability（是否有真实案例/照片支撑）。
- Competition difficulty（竞争难度惩罚）。

### C. Content Task Generator

能力：

- 每周自动生成内容任务包（默认周一）。
- 每条任务包含：
  - keyword
  - target page（existing/new）
  - content type（blog / landing update / FAQ / case study）
  - suggested title
  - search intent
  - priority
- 任务状态流：`suggested -> approved -> in_progress -> review -> ready_to_publish -> published -> archived`。
- 强制 human approval gate：未审批不能进入草稿生成。

### D. Content Draft Workflow

流程：

1. AI creates outline（结构、关键段落、FAQ、CTA 建议）。
2. owner/marketing 上传 real photos / site notes / inspection findings。
3. AI drafts article（结合素材，标注引用来源片段）。
4. owner reviews（事实、语气、合规、风险语句）。
5. publish approval（人工最终批准）。

关键控制：

- 草稿中“经验性结论”必须可追溯到素材来源。
- 不允许生成“虚构案例”与“绝对化安全承诺”。

### E. Publishing Engine

目标：

- 输出到 `apps/web` 的 Astro 内容体系（建议 content collections）。
- 自动更新 sitemap。
- 自动生成 internal linking 建议（并可人工选择应用）。
- 支持 `draft` / `published` 状态与回滚记录。

发布策略：

- 首期使用“受控发布”：生成内容文件 + PR / checklist + 人工点击发布。
- 不直接改动核心 money page 主体结构（仅建议，不自动落地）。

### F. CRM Integration

目标能力：

- 将 SEO lead 与 content source 建立映射。
- 跟踪链路：`article -> lead -> inspection -> report -> revenue`。
- 在 CRM dashboard 可查看内容 ROI（按文章/专题/关键词聚合）。

数据衔接建议：

- lead intake 保留 `utm_*`、`landing_page_url`、`landing_page_version`、`content_id`（可选）等字段。
- 在机会/客户维度追加“首触内容”和“最近触达内容”。

### G. AI Assistant Layer

治理原则：

- AI 只提供建议和草稿，不直接推送生产内容。
- AI 不自动改核心 money page（首页、关键转化页）。
- 所有发布动作必须人工确认。
- 全流程保留审计日志（谁批准、何时发布、依据素材）。

---

## 4) 数据模型初稿（Postgres）

以下为草案，不涉及 migration 执行。

### `seo_keywords`

- purpose：存储关键词主数据与机会评分快照。
- key fields：
  - `id` (uuid, pk)
  - `keyword` (text, unique by locale)
  - `locale` (text)
  - `intent` (informational/commercial/navigational/local)
  - `topic_cluster` (text)
  - `priority_score` (numeric)
  - `source_confidence` (numeric)
- relationships：
  - 1:N -> `seo_ai_recommendations`
  - N:N with `seo_pages`（通过 recommendation/task 关联）
- status fields：`status` (`active`/`watchlist`/`ignored`)
- timestamps：`created_at`, `updated_at`, `last_seen_at`

### `seo_pages`

- purpose：站内页面 SEO 元信息与表现快照。
- key fields：
  - `id` (uuid, pk)
  - `url_path` (text, unique)
  - `page_type` (money_page/blog/landing/service/other)
  - `title`, `meta_description`, `h1`
  - `is_core_money_page` (boolean)
  - `last_audit_score` (numeric)
- relationships：
  - 1:N -> `seo_content_tasks`
  - 1:N -> `seo_content_performance`
- status fields：`status` (`active`/`draft`/`deprecated`)
- timestamps：`created_at`, `updated_at`, `last_crawled_at`

### `seo_content_tasks`

- purpose：每周内容任务池与执行状态。
- key fields：
  - `id` (uuid, pk)
  - `week_start_date` (date)
  - `keyword_id` (fk -> `seo_keywords.id`)
  - `target_page_id` (nullable fk -> `seo_pages.id`)
  - `task_type` (new_article/update_page/faq/case_study)
  - `suggested_title` (text)
  - `intent` (text)
  - `priority_score` (numeric)
  - `owner_id` (crm user id)
- relationships：
  - 1:N -> `seo_content_drafts`
- status fields：`status` (`suggested`/`approved`/`in_progress`/`review`/`ready_to_publish`/`published`/`archived`)
- timestamps：`created_at`, `approved_at`, `published_at`, `updated_at`

### `seo_content_drafts`

- purpose：内容大纲与草稿版本管理。
- key fields：
  - `id` (uuid, pk)
  - `task_id` (fk -> `seo_content_tasks.id`)
  - `version_no` (int)
  - `outline_md` (text)
  - `draft_md` (text)
  - `review_notes` (text)
  - `approved_by` (crm user id, nullable)
- relationships：
  - N:1 -> `seo_content_tasks`
  - 1:N -> `seo_content_assets`
- status fields：`status` (`outline_ready`/`draft_ready`/`needs_revision`/`approved`/`rejected`)
- timestamps：`created_at`, `updated_at`, `approved_at`

### `seo_content_assets`

- purpose：存储与草稿绑定的真实素材引用（照片/笔记/检验发现）。
- key fields：
  - `id` (uuid, pk)
  - `draft_id` (fk -> `seo_content_drafts.id`)
  - `asset_type` (photo/note/finding/report_excerpt)
  - `storage_url` (text)
  - `caption` (text)
  - `source_reference` (text)
  - `is_verified` (boolean)
- relationships：
  - N:1 -> `seo_content_drafts`
- status fields：`status` (`uploaded`/`verified`/`rejected`)
- timestamps：`created_at`, `verified_at`, `updated_at`

### `seo_content_performance`

- purpose：文章/页面发布后的 SEO 与线索表现快照。
- key fields：
  - `id` (uuid, pk)
  - `page_id` (fk -> `seo_pages.id`)
  - `content_task_id` (nullable fk -> `seo_content_tasks.id`)
  - `snapshot_date` (date)
  - `impressions`, `clicks`, `ctr`, `avg_position`
  - `seo_leads`, `qualified_leads`, `won_revenue`
- relationships：
  - N:1 -> `seo_pages`
  - N:1 -> `seo_content_tasks`
- status fields：`status` (`provisional`/`final`)
- timestamps：`created_at`, `updated_at`

### `seo_weekly_reports`

- purpose：每周汇总报告与行动清单归档。
- key fields：
  - `id` (uuid, pk)
  - `week_start_date` (date, unique)
  - `summary_md` (text)
  - `highlights_json` (jsonb)
  - `risks_json` (jsonb)
  - `next_actions_json` (jsonb)
- relationships：
  - 可关联当周 `seo_content_tasks`（按 week_start_date 逻辑关联）
- status fields：`status` (`generated`/`reviewed`/`locked`)
- timestamps：`created_at`, `reviewed_at`, `updated_at`

### `seo_ai_recommendations`

- purpose：AI 生成建议与解释依据，保留可审计记录。
- key fields：
  - `id` (uuid, pk)
  - `recommendation_type` (keyword/page_update/new_article/internal_link)
  - `keyword_id` (nullable fk)
  - `page_id` (nullable fk)
  - `task_id` (nullable fk)
  - `reasoning_md` (text)
  - `evidence_json` (jsonb)
  - `confidence_score` (numeric)
- relationships：
  - N:1 -> `seo_keywords`
  - N:1 -> `seo_pages`
  - N:1 -> `seo_content_tasks`
- status fields：`status` (`proposed`/`accepted`/`rejected`/`superseded`)
- timestamps：`created_at`, `reviewed_at`, `updated_at`

---

## 5) API 设计草案（`apps/crm`）

### `GET /api/seo/dashboard`

- 用途：返回 SEO 总览和关键 KPI（支持日期范围筛选）。
- input：
  - query: `from`, `to`, `service_line?`, `channel?`
- output：
  - `traffic_overview`
  - `top_pages`
  - `top_keywords`
  - `ctr_opportunities`
  - `lead_conversion_summary`

### `GET /api/seo/opportunities`

- 用途：返回关键词/页面机会列表与优先级。
- input：
  - query: `week?`, `intent?`, `min_score?`, `status?`
- output：
  - `opportunities[]`（keyword, page, reason, priority_score, suggested_action）

### `POST /api/seo/tasks/generate-weekly`

- 用途：按规则生成当周任务（可幂等）。
- input：
  - body: `week_start_date`, `limit?`, `dry_run?`
- output：
  - `generated_count`
  - `tasks[]`
  - `report_id`

### `POST /api/seo/tasks/:id/create-draft`

- 用途：基于任务创建 outline/draft 初版。
- input：
  - params: `id`
  - body: `mode` (`outline`/`full_draft`), `asset_ids?`, `notes?`
- output：
  - `draft_id`
  - `status`
  - `outline_md` 或 `draft_md`

### `POST /api/seo/drafts/:id/approve`

- 用途：人工审核通过草稿。
- input：
  - params: `id`
  - body: `approval_notes?`, `approved_by`
- output：
  - `ok`
  - `draft_status = approved`
  - `task_status = ready_to_publish`

### `POST /api/seo/drafts/:id/publish`

- 用途：将已批准草稿发布到网站内容层（受控流程）。
- input：
  - params: `id`
  - body: `publish_mode` (`manual_commit`/`pr`), `target_collection`, `slug`
- output：
  - `ok`
  - `published_url`
  - `content_ref`（file path / commit sha / pr url）

### `GET /api/seo/performance`

- 用途：按内容/关键词维度查看发布后表现与线索贡献。
- input：
  - query: `from`, `to`, `group_by` (`page`/`keyword`/`task`), `service_line?`
- output：
  - `series`
  - `table_rows`
  - `roi_summary`

---

## 6) CRM 前端页面设计

### `/admin/seo`

- 显示：
  - 总览 KPI（traffic, clicks, ctr, leads, revenue）
  - 本周重点机会（top 5）
  - 待审批任务/草稿提醒
  - 一键进入“本周执行流”

### `/admin/seo/tasks`

- 显示：
  - 每周任务列表（优先级、状态、负责人）
  - 任务筛选（intent、service line、status）
  - 审批/驳回/指派操作
  - 任务详情侧栏（关键词证据、推荐理由）

### `/admin/seo/drafts`

- 显示：
  - 草稿列表与版本历史
  - 大纲与正文编辑区（Markdown）
  - 素材面板（照片、notes、inspection findings）
  - 审核意见、批准按钮、发布前 checklist

### `/admin/seo/performance`

- 显示：
  - 内容表现趋势（impressions/clicks/CTR/rank）
  - lead 到 revenue 归因视图
  - 文章/关键词排行榜
  - 低表现内容告警与优化建议

### `/admin/seo/settings`

- 显示：
  - 数据源连接状态（GSC/Ads/CRM）
  - 评分规则权重配置
  - AI 生成边界策略（禁止自动发布、敏感词规则）
  - 周报调度时间与通知对象

---

## 7) 每周工作流（周一）

1. 拉取 GSC / Ads / CRM 上周数据快照。
2. Opportunity Engine 产出机会列表与优先级评分。
3. Task Generator 生成本周任务池（默认待审批）。
4. CEO/Owner 审核并锁定本周执行任务。
5. Marketing/Technician 上传真实照片与现场 notes。
6. AI 生成大纲与草稿，标注依据素材。
7. 人工审核修订，完成合规检查并批准。
8. Publishing Engine 受控发布到 `apps/web`。
9. 一周后自动生成 performance 回看，并更新 ROI。

---

## 8) 自动化边界（必须明确）

可自动化：

- keyword analysis
- task suggestion
- draft outline
- sitemap generation
- internal linking suggestions（建议，不强制落地）

禁止自动化：

- 自动改 H1（尤其核心 money page）
- 自动发布核心转化页改动
- 自动生成虚假案例/虚假照片说明
- 自动承诺法律/安全结论
- 自动覆盖人工审核意见

---

## 9) MVP 范围（分阶段）

### Phase 1（最小可用）

- SEO dashboard（基础 KPI + top opportunities）
- keyword opportunity list（手动导入/半自动）
- weekly content task list（审批流）
- manual draft creation（人工创建草稿）
- manual publish checklist（不自动发布）

### Phase 2

- GSC integration（标准化接入）
- AI draft workflow（outline + draft + review）
- Astro content publishing（受控发布链路）

### Phase 3

- content ROI tracking（内容级归因）
- CRM revenue attribution（到成交/营收）
- inspection data -> SEO insight（结构化反馈回路）

---

## 10) 技术实现建议（基于当前 monorepo）

### 放在 `apps/crm`

- SEO Control Center UI 页面与权限控制。
- SEO API（dashboard/opportunities/tasks/drafts/performance/settings）。
- 审批流、审计日志、任务状态机。

### 放在 `apps/web`

- 内容展示层（Astro pages/content collections）。
- 发布后可访问 URL、sitemap 输出、前端 schema 标记（后续可加）。

### 放在 `packages/integrations`（建议新增）

- `gsc` 客户端封装
- `google-ads` search term 拉取封装
- `analytics` 统一数据映射层
- `servicem8/crm attribution` 辅助工具

### 放在 `scripts`

- 每周数据拉取与快照脚本。
- 周报生成脚本。
- 发布前 lint/checklist 自动校验脚本。

### 数据库与调度

- 需要新增 migrations（后续实施阶段再做，不在本次执行）。
- 需要 cron/scheduled function（周一任务生成、日更 performance 快照）。
- Netlify 可先用 Scheduled Functions；若后续任务增长，可迁移到独立 worker。

---

## 11) 风险与原则

最高优先级原则：

- SEO 质量优先，不做 AI spam。
- 真实照片与真实案例优先，强化 E-E-A-T。
- 所有对外内容必须人工审核。
- 对医疗/法律/安全结论保持保守措辞，避免误导承诺。
- 任何新系统不得破坏现有 CRM / report engine / Netlify deploy 稳定性。

主要风险与缓解：

- 数据归因不完整：先建立统一 UTM/content_id 规范，再逐步补齐。
- AI 幻觉内容：强制素材引用与审核 gate。
- 任务过载：每周限额 + 优先级阈值。
- 发布错误：采用 PR/检查清单/回滚记录的受控发布。

---

## 推荐下一步实现计划（2-3 周启动版）

1. 需求冻结：确认 Phase 1 页面字段、状态机和审批权限。
2. 数据层设计评审：冻结 8 张 SEO 表 schema（仅评审，不迁移）。
3. API 合约草拟：先定义 `dashboard`、`opportunities`、`tasks` 三组接口。
4. CRM 前端低保真原型：先做 `/admin/seo` 与 `/admin/seo/tasks`。
5. 周一任务流程试运行：先用 mock 数据跑通 end-to-end。
6. 发布治理：确定“人工发布 checklist + 审计日志”最小闭环。
7. 通过一次真实周会验证后，再进入 Phase 1 开发排期。

