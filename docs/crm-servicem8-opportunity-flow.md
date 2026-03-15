# CRM 与 ServiceM8 职责边界与 Opportunity 流程

本文档定义 CRM 与 ServiceM8 的职责边界、真实业务流程下的 Opportunity stage，以及最小可用的同步方案。**不替代 ServiceM8**，CRM 专注机会追踪和客户关系管理。

---

## 1. 真实业务流程概览

```
1. 客户打电话咨询
2. 在 ServiceM8 创建新 job
3. 在 ServiceM8 预约时间上门看项目 / 报价
4. 通过 ServiceM8 向客户发送报价
5. 客户同意后：
   - CRM 中更新机会状态
   - ServiceM8 中安排正式施工时间
6. 工作结束后：
   - ServiceM8 发 invoice
7. CRM 后续做定期跟进和客户激活
```

---

## 2. 职责边界

### 2.1 ServiceM8 负责（不替代）

| 模块 | 职责 |
|------|------|
| Job | 创建、调度、状态、完成 |
| Scheduling | 预约上门、现场时间安排 |
| Quote | 生成、发送报价 |
| Invoice | 开票、收款 |
| Completion | 工单完成、施工收尾 |

**ServiceM8 是现场作业和财务操作的单点真相（Source of Truth）。**

### 2.2 CRM 负责

| 模块 | 职责 |
|------|------|
| Opportunity tracking | 机会阶段、预期金额、赢/输标记 |
| Customer follow-up | 跟进任务、短信提醒、回复处理 |
| Reactivation | 老客户激活、SMS campaign |
| Relationship management | 客户画像、优先级评分、历史沟通 |

**CRM 是销售/客户关系的单点真相，不执行具体施工或开票。**

---

## 3. Opportunity Stage 定义

建议使用以下 stage，贴合真实业务节点：

| Stage | 含义 | 业务节点 |
|-------|------|----------|
| `new_inquiry` | 新询盘 | 客户来电/询价，尚未创建 job |
| `site_visit_booked` | 已预约上门 | 在 ServiceM8 创建了 job |
| `inspection_done` | 已完成检查 | 上门检查/现场勘测已完成 |
| `quote_sent` | 已发报价 | 通过 ServiceM8 向客户发送报价 |
| `decision_pending` | 待客户决定 | 报价已发，等待客户同意/拒绝 |
| `won` | 成交 | 客户同意报价 |
| `lost` | 未成交 | 客户拒绝或失联 |

### 3.1 每个 Stage 在什么业务节点变化

| 业务节点 | Stage 变化 |
|----------|------------|
| 客户来电 / 在 CRM 创建 lead | 若转为 opportunity，stage = `new_inquiry` |
| ServiceM8 job created | stage → `site_visit_booked` |
| ServiceM8 job scheduled | 更新 `inspection_date` |
| 现场检查完成 | stage → `inspection_done` |
| ServiceM8 quote sent | stage → `quote_sent`，`quote_sent_at` = now |
| 报价已发，等待回复 | stage → `decision_pending`（或保持 `quote_sent`） |
| 客户同意报价 | stage → `won`，`won_at` = now |
| 客户拒绝 / 失联 | stage → `lost` |

---

## 4. CRM ← ServiceM8 同步触发器

同步方向：**ServiceM8 → CRM**，CRM 只读 ServiceM8 数据用于机会更新和客户画像。

| ServiceM8 事件 | CRM 同步动作 |
|----------------|--------------|
| **Job created** | stage = `site_visit_booked`，关联 `service_m8_job_id` |
| **Job scheduled** | 更新 `inspection_date` |
| **Quote sent** | stage = `quote_sent`，`quote_sent_at` = now |
| **Customer quote accepted** | stage = `won`，`won_at` = now |
| **Job completed** | 更新 account summary：`jobs_count`、`last_job_date`、`total_job_value` |

### 4.1 最小可用同步方案

1. **已有**：`syncAllFromServiceM8` 同步 companies、contacts、jobs、invoices、job_materials
2. **Job sync → Opportunity（已实现）**：按 `service_m8_job_id` 匹配；不存在则创建（stage = `site_visit_booked`），存在则仅更新 `inspection_date`
3. **Quote sent**：待实现
4. **Quote accepted**：待实现
5. **Job completed**：crm_account_summary 视图自动聚合

---

## 5. Opportunities 表建议字段

在现有 `opportunities` 表基础上，建议保留/新增：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| contact_id | UUID | 联系人 |
| account_id | UUID | 客户账户 |
| lead_id | UUID | 来源 lead（可选） |
| stage | VARCHAR | 统一枚举：new_inquiry / site_visit_booked / inspection_done / quote_sent / decision_pending / won / lost |
| status | VARCHAR | open / closed |
| value_estimate | DECIMAL | 预估金额 |
| service_type | VARCHAR | 服务类型（如 electrical / plumbing） |
| service_m8_job_id | TEXT | ServiceM8 job uuid，用于与 jobs.servicem8_job_uuid 匹配 |
| inspection_date | DATE | 上门检查/勘测日期（由 job scheduled 同步） |
| quote_sent_at | TIMESTAMPTZ | 报价发送时间 |
| won_at | TIMESTAMPTZ | 成交时间 |
| lost_at | TIMESTAMPTZ | 未成交时间 |
| closed_at | TIMESTAMPTZ | 关闭时间（won 或 lost 时更新） |
| created_at / updated_at / created_by | - | 审计字段 |

`service_m8_job_id` 关联 CRM 的 jobs 表（jobs 表已有 servicem8_job_uuid），便于从 opportunity 反查 ServiceM8 job。

---

## 6. 自动化规则

| 触发条件 | 动作 |
|----------|------|
| **quote_sent** | 若 7 天内无回复，自动创建 follow-up task（如 "Follow up quote with {contact_name}"） |
| **job_completed** | 安排 12 个月后进入 reactivation 流程（即 `months_since_last_job >= 12` 时可被激活 campaign 覆盖） |

说明：
- `quote_sent` 的 7 天 follow-up：在 `quote_sent_at` 后 7 天检查 opportunity 是否仍为 quote_sent/decision_pending，若是则创建 task
- `job_completed` 的 12 个月：crm_account_summary / crm_priority_contacts 等视图已用 `months_since_last_job`，12 个月后客户自然进入激活候选池

---

## 7. 动作归属：只在 ServiceM8 / 只在 CRM

### 7.1 只在 ServiceM8 做

- 创建 job
- 预约上门时间
- 发送报价
- 安排施工
- 开 invoice
- 标记 job 完成 / 取消

### 7.2 只在 CRM 做

- 创建 lead / opportunity（新询盘）
- 更新 opportunity stage（quote_sent、decision_pending、won、lost）
- 创建跟进任务（Tasks）
- 发送激活短信（SMS Campaign）
- 客户回复处理（Reply Inbox）
- 客户画像、优先级评分
- 标记 do_not_contact

### 7.3 协同动作

| 业务动作 | ServiceM8 | CRM |
|----------|-----------|-----|
| 客户同意报价 | 安排施工 job | 标记 opportunity stage = won |
| 客户拒绝 | 可取消/关闭 job | 标记 opportunity stage = lost |
| 老客户再询价 | 创建新 job | 从 reactivation 或历史 contact 关联，可建新 opportunity 或沿用画像 |

---

## 8. 总结

| 维度 | 说明 |
|------|------|
| **CRM 不替代 ServiceM8** | 施工、报价、开票均在 ServiceM8 完成 |
| **ServiceM8 → CRM 单向同步** | jobs、invoices 等拉回 CRM，用于机会阶段推断和客户画像 |
| **Opportunity 以 CRM 为主** | stage、won/lost 在 CRM 维护，可被同步触发或人工更新 |
| **后续实现** | 先完成本文档的设计和字段定义，再按需实现同步扩展与 UI 变更 |
