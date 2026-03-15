# Priority Score Engine

## 目的

自动识别最有价值的客户，用于每日联系优先级排序。Score 由 `crm_priority_contacts` 视图计算。

自动识别最有价值的客户，用于每日联系优先级排序。

## Score 公式

```
score = interaction_score + customer_history_score + recency_score
      + value_score + engagement_score + location_score
```

## Score 因子

| 因子 | 条件 | 分数 |
|------|------|------|
| Recent interaction | 7 天内有 inbound SMS | +50 |
| Previous jobs | account 有已完成 jobs | +30 |
| Last job recency | last_job_date 在 6–24 个月前 | +20 |
| Customer value | total job value > $2000 | +20 |
| Engagement | 有 report viewed 或 inspection | +15 |
| Location proximity | suburb 在 preferred_work_area | +10 |

## 排除规则

以下 contact **不会**出现在 `crm_priority_contacts` 中：

- `do_not_contact = true`
- 30 天内有联系（activities outbound_sms 或 reactivation_sms_queue sent）
- 存在 active job（status 非 completed/cancelled/done）
- 存在 open opportunity

## 视图

### crm_priority_contacts

字段：contact_id, account_id, name, phone, suburb, last_job_date, priority_score

按 priority_score DESC 排序。

### crm_preferred_work_areas

可选配置表，用于「Location proximity」加分：

```sql
INSERT INTO crm_preferred_work_areas (suburb) VALUES ('North Adelaide'), ('Unley');
```

## 部署

运行 migration 013：

```bash
psql $DATABASE_URL -f apps/crm/database/013_priority_score_engine.sql
```

依赖：`reactivation_sms_queue` 表（migration 010），`jobs`, `invoices`, `contacts`, `accounts`, `activities`, `opportunities`, `inspections`。

## API

- **GET /api/priority/contacts?limit=20**：返回 top N 优先 contact
- **GET /api/reactivation/dashboard**：响应中包含 `priorityContacts`（top 20）

## Dashboard

客户激活仪表盘左侧显示 **Priority Score Top 20**，按评分从高到低。
