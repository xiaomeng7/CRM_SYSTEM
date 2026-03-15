# Customer Scoring Engine 2.0

多维客户评分：Value、Conversion、Urgency、Relationship → total_score 与 segment（Hot / Warm / Cold / Dormant / HighValueDormant），用于识别高价值、高成交概率、沉睡与高风险客户并驱动自动化。

## 评分维度（各 0–100）

| 维度 | 计算因素 |
|------|----------|
| **Value Score** | lifetime_spend（历史消费）、number_of_jobs（工单数）、average_job_value（平均客单价） |
| **Conversion Score** | replied_sms_count（回复短信数）、quote_accept_rate（报价接受率）、last_interaction_days（最近互动天数） |
| **Urgency Score** | open_quotes（未结报价数）、recent_jobs（近 90 天工单）、last_contact_days（上次外联天数） |
| **Relationship Score** | years_as_customer（客户年限）、complaint_count（投诉数，当前默认 0）、review_score（评价分，当前默认 50） |

`total_score` = 四维加权平均（权重各 0.25），再按 segment 规则划分。

## Segment 规则

| 条件 | Segment |
|------|---------|
| total_score ≥ 80 | **Hot** |
| total_score ≥ 60 | **Warm** |
| total_score < 30 且 last_contact > 180 天 | **Dormant** |
| 同上且 value_score ≥ 50 | **HighValueDormant** |
| 其他 | **Cold** |

## 数据表（Migration 022）

**customer_scores**

| 字段 | 类型 | 说明 |
|------|------|------|
| contact_id | UUID | 唯一，关联 contacts.id |
| value_score | NUMERIC(5,2) | 0–100 |
| conversion_score | NUMERIC(5,2) | 0–100 |
| urgency_score | NUMERIC(5,2) | 0–100 |
| relationship_score | NUMERIC(5,2) | 0–100 |
| total_score | NUMERIC(5,2) | 0–100 |
| segment | VARCHAR(30) | Hot / Warm / Cold / Dormant / HighValueDormant |
| last_contact_days | INT | 用于 segment 判断 |
| calculated_at | TIMESTAMPTZ | 最近一次计算时间 |

## 批量任务与定时

- **单 contact 重算**：`recalculateCustomerScore(contactId)`（见 `services/customerScoringEngine.js`）
- **全量重算**：`updateAllCustomerScores()`，可由每日 job 调用
- **运行方式**：
  - 手动：`npm run customer-scoring`（在 `apps/crm` 下）
  - 定时：环境变量 `AUTO_CUSTOMER_SCORING_DAILY=true` 时，API 进程每 24 小时跑一次
  - Railway Cron：Command `node scripts/run-customer-scoring.js`，Schedule 如 `0 5 * * *`

## CRM 集成（Segment 变化）

当 `updateAllCustomerScores` 检测到某 contact 的 segment 发生变化时，会调用可选回调 `onSegmentChange`。默认脚本 `run-customer-scoring.js` 会将该事件写入 **automation_audit_log**（event_type = `customer_segment_change`），便于后续：

- **Reactivation campaign**：segment → Dormant / HighValueDormant 时加入复联队列
- **VIP follow-up list**：segment → Hot / Warm 时加入 VIP 跟进列表
- **Upsell opportunity**：根据 value_score + segment 触发 upsell 任务

具体动作可在业务层消费 `automation_audit_log` 或扩展 `onSegmentChange` 实现。

## Dashboard 集成

**Owner Dashboard**（`GET /api/owner-dashboard`）已增加：

- **top20HotLeads**：Top 20 Hot 客户（按 total_score 降序），含 contact 与 account 名称、各维度分数
- **highValueDormantCustomers**：HighValueDormant 客户（最多 50），含 value_score、last_contact_days

## Dashboard 查询示例（SQL）

```sql
-- Top 20 Hot Leads
SELECT s.contact_id, c.name, c.phone, a.name AS account_name,
       s.total_score, s.value_score, s.conversion_score, s.urgency_score, s.relationship_score
FROM customer_scores s
JOIN contacts c ON c.id = s.contact_id
LEFT JOIN accounts a ON a.id = c.account_id
WHERE s.segment = 'Hot'
ORDER BY s.total_score DESC, s.calculated_at DESC
LIMIT 20;

-- High Value Dormant Customers（可做复联/挽回）
SELECT s.contact_id, c.name, c.phone, a.name AS account_name,
       s.total_score, s.value_score, s.last_contact_days
FROM customer_scores s
JOIN contacts c ON c.id = s.contact_id
LEFT JOIN accounts a ON a.id = c.account_id
WHERE s.segment = 'HighValueDormant'
ORDER BY s.value_score DESC
LIMIT 50;

-- Segment 分布
SELECT segment, COUNT(*) AS cnt
FROM customer_scores
GROUP BY segment
ORDER BY cnt DESC;
```

## 文件修改列表

| 类型 | 路径 |
|------|------|
| Migration | `apps/crm/database/022_customer_scores.sql` |
| 常量 | `apps/crm/lib/customer-scoring-constants.js` |
| 服务 | `apps/crm/services/customerScoringEngine.js` |
| 批量脚本 | `apps/crm/scripts/run-customer-scoring.js` |
| Dashboard | `apps/crm/api/routes/owner-dashboard.js`（新增 top20HotLeads、highValueDormantCustomers） |
| API 定时 | `apps/crm/api/index.js`（可选 AUTO_CUSTOMER_SCORING_DAILY） |
| npm | `apps/crm/package.json`（script: `customer-scoring`） |
| 文档 | `docs/customer-scoring-engine.md`（本文件） |

## 执行 Migration

在目标环境执行：

```bash
psql $DATABASE_URL -f apps/crm/database/022_customer_scores.sql
```

或通过项目现有 db:migration 流程运行 022。
