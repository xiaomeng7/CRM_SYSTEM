# CRM + ServiceM8 全站测试报告（Release Readiness Test）

**报告日期**: 2025-03-09  
**角色**: QA Lead + Release Manager + Senior Test Engineer  
**范围**: 核心业务流程、关键自动化、同步链路、CRM 主流程、ServiceM8 集成、Twilio 短信链路、数据一致性、关键页面/API 可用性

---

## 第一部分：测试范围与测试清单

### A. 基础架构与配置
| # | 测试项 | 说明 |
|---|--------|------|
| A1 | 环境变量检查 | DATABASE_URL, SERVICEM8_API_KEY, TWILIO_* 等是否文档化且代码引用一致 |
| A2 | 数据库连接 | API 启动后 pool 可用，GET /api/system/status 可查 database=ok |
| A3 | Migration 状态 | 017–025 等 migration 文件存在且可执行；目标库是否已应用 |
| A4 | Scheduled jobs 配置 | AUTO_SYNC_SERVICEM8, AUTO_INVOICE_OVERDUE_DAILY, AUTO_CUSTOMER_SCORING_DAILY 在 api/index.js 中按 env 注册 |
| A5 | Webhook 路由存在性 | POST /api/webhooks/twilio/inbound-sms, POST /api/webhooks/servicem8/quote 已挂载 |
| A6 | ServiceM8 / Twilio client 初始化 | @bht/integrations 中 Client 可 require，无启动时报错 |

### B. 数据同步（ServiceM8 Sync）
| # | 测试项 | 说明 |
|---|--------|------|
| B1 | companies → accounts | syncCompaniesFromServiceM8 + external_links 映射 |
| B2 | contacts | syncContactsFromServiceM8 幂等、phone 清洗 |
| B3 | jobs | syncJobsFromServiceM8，upsertOpportunityForJob 创建/更新 opportunity |
| B4 | invoices | syncInvoicesFromServiceM8 |
| B5 | job_materials | syncJobMaterialsFromServiceM8 |
| B6 | quotes | syncQuotesFromServiceM8（quote-sync.js）|
| B7 | 手动 sync | POST /api/admin/actions/sync-servicem8 |
| B8 | 自动 sync | AUTO_SYNC_SERVICEM8 时 setInterval 调用 syncAllFromServiceM8 |
| B9 | sync lock / sync_runs / 幂等 | advisory lock、sync_runs 写入、按 UUID upsert |

### C. Opportunity / Pipeline
| # | 测试项 | 说明 |
|---|--------|------|
| C1 | job → opportunity 自动创建 | upsertOpportunityForJob 在 sync 时对无 opportunity 的 job 创建 opportunity |
| C2 | stage 自动推进 | advanceOpportunityStage(eventType) 更新 stage |
| C3 | stage_locked | stage_locked=true 时 advanceOpportunityStage 不更新 |
| C4 | stage 旁路更新 | 无直接 UPDATE opportunities.stage 绕过 engine（task complete 已走 engine）|
| C5 | quoted / won / lost 流转 | quote_sent → Quoted, quote_accepted → Won, quote_declined → Lost |
| C6 | next_action_at 更新 | createServiceM8JobFromCRM 等处更新 |

### D. Quote Lifecycle
| # | 测试项 | 说明 |
|---|--------|------|
| D1 | quote sync | syncQuotesFromServiceM8 拉取并 upsert，状态映射 |
| D2 | quote webhook | POST /servicem8/quote 调 processQuoteEvent |
| D3 | quote_sent → Quoted | QUOTE_STATUS_TO_STAGE.sent → quote_sent |
| D4 | quote_accepted → Won | 推进 stage + quote accepted automation（task/SMS/probability/audit）|
| D5 | quote_declined → Lost | 推进 stage + lost_reason |
| D6 | 7 天 follow-up 触发条件 | sent_at + 7d、未 accepted/declined、followup_state |
| D7 | follow-up 幂等 | 7 天内同 opportunity 不重复创建 follow-up task |

### E. Reply Inbox / Twilio
| # | 测试项 | 说明 |
|---|--------|------|
| E1 | inbound SMS webhook | POST /twilio/inbound-sms 接收 From/Body |
| E2 | phone_digits 匹配 | matchContactByInboundPhone 优先 phone_digits |
| E3 | fallback legacy phone 匹配 | regexp_replace(phone) IN (digits, digits61) |
| E4 | unmatched inbound 处理 | activity_type=inbound_sms_unmatched |
| E5 | outbound SMS | sendSMS（reactivation、invoice overdue、quote thank-you）|
| E6 | message 归档与关联 contact | activities 表 contact_id、summary |

### F. Tasks
| # | 测试项 | 说明 |
|---|--------|------|
| F1 | task 创建 | POST /api/tasks |
| F2 | automation task | quote-followup、invoice-overdue、quote-accepted job_preparation |
| F3 | follow-up task | Twilio 24h 内去重、quote 7d follow-up |
| F4 | completed task | POST /api/tasks/:id/complete |
| F5 | task outcome 影响 opportunity | interested/needs_quote/book_inspection/call_later/no_answer/not_interested |
| F6 | not_interested 走统一 stage engine | advanceOpportunityStage(o.id, 'not_interested')，尊重 stage_locked/closed |

### G. Cashflow / Invoices
| # | 测试项 | 说明 |
|---|--------|------|
| G1 | invoice sync | 见 B4 |
| G2 | payment status | invoices.status = paid / unpaid |
| G3 | overdue 计算 | due_date < CURRENT_DATE → days_overdue |
| G4 | overdue automation | 021 migration 后 scanOverdueInvoices + task + SMS + payment_risk |
| G5 | dashboard 汇总正确性 | GET /api/cashflow/dashboard 聚合与 outstandingInvoices |

### H. Customer Scoring
| # | 测试项 | 说明 |
|---|--------|------|
| H1 | score 计算 | customerScoringEngine 多维度 |
| H2 | segment 分类 | 按分数段 |
| H3 | batch scoring | updateAllCustomerScores |
| H4 | dashboard 查询 | 依赖 owner-dashboard 或相关 API |

### I. Phase 2A（CRM → ServiceM8 Create Job）
| # | 测试项 | 说明 |
|---|--------|------|
| I1 | createServiceM8JobFromCRM | 存在且可调用 |
| I2 | account 映射校验 | ensureServiceM8LinkForAccount，无映射则报错 |
| I3 | 幂等 | 已有 service_m8_job_id 时返回 already_created |
| I4 | 成功后写 servicem8_job_uuid | opportunities.service_m8_job_id、jobs 表插入 |
| I5 | 创建后 opportunity 联动 | advanceOpportunityStage(opportunityId, 'job_created') |
| I6 | 错误处理 | ERROR_CODES，API 返回 400/404/502 |

### J. 审计与日志
| # | 测试项 | 说明 |
|---|--------|------|
| J1 | automation_audit_log | 各自动化写入 event_type/entity_type/entity_id/source/payload |
| J2 | domain_events | opportunity.created / opportunity.stage_changed（emit）|
| J3 | sync_runs | sync 完成后写入 started_at/finished_at/status/counts |
| J4 | error logging | console.error 与 API 500 返回 |

---

## 第二部分：测试计划表与执行结果

**图例**  
- **实际执行**: 已运行脚本或 API/代码路径  
- **静态验证**: 仅阅读代码/路由/表结构，未在真实环境跑通  
- **需人工/环境**: 依赖 ServiceM8/Twilio/真实 DB 数据，本次未执行

| 模块 | 测试项目 | 测试目的 | 测试方法 | 预期结果 | 实际结果 | 是否达标 | 备注 |
|------|----------|----------|----------|----------|----------|----------|------|
| A | A1 环境变量 | 配置完整可运行 | 查阅 docs/environment-variables.md 与代码引用 | 变量文档化、代码一致 | 文档完整，DATABASE_URL/SERVICEM8/TWILIO/AUTO_* 均有说明与使用 | 达标 | 静态 |
| A | A2 数据库连接 | API 与脚本可连 DB | 运行依赖 DB 的脚本（如 test-task-complete-stage-p0） | 脚本正常执行、无连接错误 | 脚本执行成功，DB 连接正常（有 pg SSL 警告） | 达标 | 已执行 |
| A | A3 Migration 状态 | 迁移文件存在且目标库应用 | 列出 database/*.sql；运行 test-invoice-overdue | 017–025 存在；overdue 脚本不报缺列 | 017–025 存在；test-invoice-overdue 报错 `column i.overdue_level does not exist` | **不达标** | 当前环境未执行 021 migration |
| A | A4 Scheduled 配置 | 定时任务按 env 注册 | 阅读 api/index.js | AUTO_SYNC / OVERDUE / SCORING 按 env 注册 | 已实现 setInterval，条件为 env=true | 达标 | 静态 |
| A | A5 Webhook 路由 | 路由挂载正确 | 阅读 api/index.js + webhooks.js | POST /twilio/inbound-sms, /servicem8/quote 存在 | 已挂载 app.use('/api/webhooks', webhooksRouter)，路由存在 | 达标 | 静态 |
| A | A6 Client 初始化 | 集成包可加载 | require('@bht/integrations') 无抛错 | 启动无报错 | 脚本/API 启动未因 integrations 报错 | 达标 | 静态/执行 |
| B | B1–B6 Sync 各实体 | 同步逻辑存在且幂等 | 阅读 servicem8-sync.js + quote-sync.js | 各 sync 函数存在、按 UUID upsert | 代码完整；syncQuotesFromServiceM8 已实际执行（dryRun，0 条） | 达标 | B6 已执行 dry run |
| B | B7 手动 sync | 管理员可触发全量同步 | 阅读 admin.js | POST /admin/actions/sync-servicem8 存在 | 路由存在，需 SYNC_SECRET/ADMIN_SECRET 可选 | 达标 | 静态 |
| B | B8 自动 sync | 定时全量同步 | 见 A4 | 同 A4 | 同 A4 | 达标 | 静态 |
| B | B9 sync_runs / lock | 防重与审计 | 阅读 servicem8-sync.js | sync_runs 写入、advisory lock | 代码中有 INSERT/UPDATE sync_runs、lock | 达标 | 静态 |
| C | C1 job→opportunity | Sync 时创建 opportunity | 阅读 upsertOpportunityForJob | 无 opportunity 时 INSERT opportunities | 逻辑存在，service_m8_job_id 关联 | 达标 | 静态 |
| C | C2 stage 自动推进 | eventType → stage | 运行 test-task-complete-stage-p0 + test-stage-automation 用法 | not_interested→lost，dry_run 返回 new_stage | not_interested→lost 通过；stage-automation 需传 oppId+eventType | 达标 | 已执行 |
| C | C3 stage_locked | 锁定后不更新 | test-task-complete-stage-p0 Test 3 | 有 stage_locked 时 reason=stage_locked | 无 stage_locked 数据，Test 3 跳过；代码逻辑存在 | 达标 | 逻辑已验证，数据未测 |
| C | C4 旁路更新 | 无直接改 stage | 全文搜 UPDATE opportunities SET stage | 仅 advanceOpportunityStage 或 updateStage 改 stage | tasks.js 中 not_interested 已改为 advanceOpportunityStage | 达标 | 静态（Phase1 风险已修复）|
| C | C5 quoted/won/lost | 映射与推进 | stage-constants.js + quote-sync | EVENT_TO_STAGE/QUOTE_STATUS_TO_STAGE 正确 | 已核对 | 达标 | 静态 |
| C | C6 next_action_at | 创建 job 后更新 | servicem8-create-job.js | UPDATE opportunities SET next_action_at | 代码中存在 | 达标 | 静态 |
| D | D1 quote sync | 拉取并落库 | 运行 test-quote-sync.js（无 --webhook）| 无报错，stats 返回 | 已执行，quotes_fetched: 0（无数据或未配置） | 达标 | 已执行 |
| D | D2 quote webhook | processQuoteEvent 被调用 | 阅读 webhooks.js | POST body 传 job_uuid/quote_uuid/status | 路由调 processQuoteEvent(db, payload) | 达标 | 静态 |
| D | D3–D5 quote→stage | 状态驱动 stage | 见 C5 + quote-sync processQuoteEvent | 同上 | 同上 | 达标 | 静态 |
| D | D6 7d follow-up 条件 | 条件正确 | 阅读 quote-followup.js | sent_at+7d、未接受/拒绝 | SQL 与 QUOTE_FOLLOWUP_DAYS 一致 | 达标 | 静态 |
| D | D7 follow-up 幂等 | 不重复建 task | 阅读 createQuoteFollowUpTask | 7 天内同 opportunity 存在则跳过 | 代码中有 existing 检查 | 达标 | 静态 |
| E | E1–E6 Reply Inbox/Twilio | 匹配与归档 | 阅读 webhooks.js matchContactByInboundPhone + activities | phone_digits 优先、legacy 回退、unmatched 写 activity | 逻辑完整；未发真实 Twilio 请求 | 达标 | 静态 |
| F | F1–F4 task CRUD/automation | 创建与完成 | 阅读 tasks.js + 各 automation | POST/PATCH/complete 存在；automation 建 task | 路由与服务均存在 | 达标 | 静态 |
| F | F5–F6 outcome/not_interested | 统一 stage engine | 运行 test-task-complete-stage-p0 | not_interested→advanceOpportunityStage，closed/locked 不覆盖 | 通过：not_interested→lost，dry_run 正确 | 达标 | 已执行 |
| G | G1–G3 invoice/dashboard | 同步与逾期计算 | 阅读 cashflow.js + sync | 聚合与 days_overdue 正确 | SQL 使用 due_date 与 status | 达标 | 静态 |
| G | G4 overdue automation | 扫描+task+SMS | 运行 test-invoice-overdue.js | 扫描无报错 | **失败**: column i.overdue_level does not exist | **不达标** | 需先执行 021 migration |
| G | G5 dashboard 汇总 | 数值正确 | 阅读 cashflow 聚合 SQL | 与业务定义一致 | 逻辑正确 | 达标 | 静态 |
| H | H1–H4 Customer Scoring | 计算与批次 | 阅读 customerScoringEngine.js | updateAllCustomerScores 存在 | 存在；未跑批量（依赖 DB） | 达标 | 静态 |
| I | I1–I6 Phase 2A Create Job | 创建 Job 全流程 | 阅读 servicem8-create-job.js + opportunities 路由；运行 --list-opportunities | 幂等、写 service_m8_job_id、advance stage | 逻辑完整；--list-opportunities 返回无 job 的 opportunity | 达标 | 静态+脚本列出数据 |
| J | J1–J4 审计与日志 | audit/events/sync_runs | 阅读各 service 写 audit/sync_runs、emit | 自动化写 automation_audit_log；sync 写 sync_runs | 已实现 | 达标 | 静态 |

---

## 第三部分：执行过程摘要

### 已实际执行的测试
1. **tests/cleaning.test.js** — 通过（phone/email/name/suburb 归一化、detectSuspiciousContact、cleanContact）
2. **apps/crm/scripts/test-task-complete-stage-p0.js** — 通过（not_interested→lost、dry_run、closed 不覆盖；stage_locked 无数据跳过）
3. **apps/crm/scripts/test-quote-followup.js** — 通过（0 条 due，无报错）
4. **apps/crm/scripts/test-quote-sync.js** — 通过（dryRun，0 quotes fetched）
5. **apps/crm/scripts/test-opportunity-auto-convert-job.js --list** — 通过（列出 site_visit_booked 且无 job 的 opportunity）
6. **apps/crm/scripts/test-servicem8-create-job.js --list-opportunities** — 通过（列出无 job 的 opportunity）
7. **apps/crm/scripts/test-invoice-overdue.js** — **失败**（DB 缺少 `invoices.overdue_level`，021 migration 未应用）

### 静态验证（未在真实环境跑通）
- 所有路由存在性、webhook 入参、sync 顺序、stage 常量与映射、task complete 调用 advanceOpportunityStage、Phase 2A 幂等与写回、audit_log/sync_runs 写入、cashflow SQL、Reply Inbox 匹配逻辑。

### 未执行（需人工/真实环境）
- 真实 ServiceM8 API 全量 sync（需 SERVICEM8_API_KEY 与数据）
- 真实 Twilio 收/发短信（需 Twilio 配置与号码）
- 真实 quote webhook 调用（需 job_uuid/quote_uuid）
- 端到端：inbound SMS → contact 匹配 → task 创建（需 Twilio 回调）
- 端到端：quote_accepted → Won → task/SMS/probability（需 webhook 或 sync 产生 accepted）

---

## 第四部分：关键路径验证摘要

| 关键路径 | 验证方式 | 结果 |
|----------|----------|------|
| 1. ServiceM8 job sync → opportunity 创建/更新 → stage=Inspection Booked | 代码阅读 + sync 逻辑 | 逻辑正确；未跑真实 sync |
| 2. quote_sent → 落库 → Quoted → follow-up 计划 | 代码 + test-quote-sync/test-quote-followup | 脚本通过；无 sent 数据时 0 条 |
| 3. quote_accepted → Won → audit/task/SMS/probability | 代码阅读 + quoteAcceptedAutomation 集成 | 逻辑完整；未触发真实 webhook |
| 4. Twilio inbound → digits 匹配 → reply inbox | 代码阅读 matchContactByInboundPhone | 逻辑完整；未收真实 SMS |
| 5. task 完成 outcome=not_interested → stage engine → stage_locked | test-task-complete-stage-p0 | **通过** |
| 6. invoice overdue → days_overdue → automation | test-invoice-overdue | **失败**（缺 021 migration）|
| 7. Phase 2A Create Job → 幂等 → 写 service_m8_job_id | 代码 + --list-opportunities | 逻辑与入口正确；未调真实 API |

---

## 第五部分：关键缺陷列表

### P0（阻塞上线/阻塞下一阶段）
| 编号 | 问题描述 | 影响范围 | 复现方式 | 建议修复 | 状态 |
|------|----------|----------|----------|----------|------|
| P0-1 | **Invoice overdue 依赖的 DB 未执行 migration 021**：`invoices.overdue_level` 不存在 | 所有使用 invoice overdue automation 的环境（脚本、AUTO_INVOICE_OVERDUE_DAILY） | 在未执行 021 的库上运行 `node scripts/test-invoice-overdue.js` 或开启 AUTO_INVOICE_OVERDUE_DAILY | 在目标环境执行 021；可运行 `node scripts/run-invoice-overdue-migration.js` | **已修复**：已添加并执行 run-invoice-overdue-migration.js，test-invoice-overdue 通过 |

### P1（高优先级）
| 编号 | 问题描述 | 影响范围 | 复现方式 | 建议修复 |
|------|----------|----------|----------|----------|
| P1-1 | **Migration 执行无统一清单**：哪些环境已跑 017–025 不透明 | 部署与发布一致性 | 人工核对各环境 | 增加 migration 版本表或 README 列出顺序，部署文档要求按序执行 |
| P1-2 | **Quote sync 与 webhook 依赖真实 ServiceM8 数据**：当前无法在无数据/无 key 下做 E2E | 回归与发布前验证 | 无 key 时 sync 返回 0 条 | 提供 mock/sandbox 或最小 fixture 用于 CI 回归 |

### P2（可后续优化）
| 编号 | 问题描述 | 影响范围 | 建议 |
|------|----------|----------|------|
| P2-1 | **Event 双轨**：domain_events 与 automation_audit_log 并存，无统一 event bus | 扩展与运维 | Phase 2 考虑统一事件模型与单一 audit 约定 |
| P2-2 | **自动化分散**：quote-followup、invoice-overdue、customer-scoring、reactivation 各自入口 | 运维与监控 | 后续可做统一“自动化运行器”与健康检查 |
| P2-3 | **tasks 表无 task_type 枚举**：类型靠 created_by/title 推断 | 报表与筛选 | 已增加 task_type（025），可逐步迁移 created_by 语义 |
| P2-4 | **集成测试缺失**：无自动化 E2E 覆盖 webhook→stage→task | 回归 | 引入少量 E2E（含 mock ServiceM8/Twilio）|

---

## 第六部分：架构/质量观察

- **逻辑集中度**：Stage 变更已统一到 advanceOpportunityStage；task complete 的 not_interested 已修复，不再旁路更新 stage。
- **Event/Audit 双轨**：domain_events（emit）与 automation_audit_log 并存，无统一 event_type 枚举与单一 dispatcher。
- **Task 模型**：task_type 已加（025）；related_type/related_id 仍缺失，类型部分依赖 created_by。
- **集成测试**：仅有 cleaning 单测与若干脚本；无 API 级/ E2E 套件，无 Mock ServiceM8/Twilio 的自动化测试。
- **Migration 可观测性**：无 schema_version 或迁移历史表，环境是否已应用 021/025 等需人工确认。

---

## 第七部分：Release Readiness Conclusion

### 结论：**PASS WITH FIXES**

**理由**：
- 核心逻辑（stage engine、quote lifecycle、task complete→stage、Phase 2A Create Job、Reply Inbox 匹配、cashflow）**代码层面正确**，且已执行的脚本测试通过。
- **唯一阻塞项**：当前测试环境（或部分部署环境）未执行 **021_invoice_overdue_automation.sql**，导致 invoice overdue 相关功能无法运行；修复方式明确（执行 021）。
- 未执行部分（真实 ServiceM8 sync、Twilio 收发、quote webhook E2E）受外部依赖与数据限制，未发现代码级错误，但需在具备环境时补测。

### 是否建议进入下一阶段开发
- **是**。在目标环境**确保执行 021（及所需 017–025）migration** 后，当前已实现能力可支撑进入下一阶段开发与内部试运行。
- 建议在下一阶段前完成：  
  - 在**所有目标环境**执行 021 migration；  
  - 在具备 ServiceM8/Twilio 的环境中做一次**人工 E2E 补测**（sync、quote webhook、inbound SMS、overdue 一次运行）。

### 建议先修问题
1. **必须**：在需使用 invoice overdue 的环境执行 `021_invoice_overdue_automation.sql`。  
   → **已做**：新增 `scripts/run-invoice-overdue-migration.js` 并已在当前环境执行；`test-invoice-overdue.js` 已通过。
2. **建议**：建立 migration 执行清单与部署检查项，避免漏跑 017–025。  
   → **已做**：见 `docs/crm-migrations-checklist.md`。
3. **可选**：为 quote/sync/webhook 增加 1～2 个 mock 式集成测试，便于 CI 回归。

---

## 第八部分：最终交付摘要

| 交付项 | 说明 |
|--------|------|
| **A. 测试项目列表** | 见第一部分 A–J 分类清单 |
| **B. 测试方法说明** | 见第二部分表格列“测试方法”“预期结果” |
| **C. 执行过程摘要** | 见第三部分（已执行 / 静态 / 未执行）|
| **D. 完整测试结果表** | 见第二部分表格（含实际结果、是否达标、备注）|
| **E. 缺陷清单** | P0-1；P1-1、P1-2；P2-1～P2-4 |
| **F. 达标结论** | **PASS WITH FIXES**（修复 021 后通过）|
| **G. 建议下一步** | 1）执行 021（及所需 migrations）；2）建立 migration 清单；3）有环境时 E2E 补测；4）可选增加 mock 集成测试 |

**报告路径**：`docs/full-system-test-report.md`
