# ServiceM8 同步：保留已有数据

## 问题

ServiceM8 全量同步时会用 API 返回的数据**覆盖** CRM 中的 accounts、contacts、jobs。当 ServiceM8 某字段返回空时，会覆盖掉 CRM 中已有的有效值（例如 suburb），导致联系人页面等出现“好多都没了”。

## 修复

已修改 `apps/crm/services/servicem8-sync.js`：

- **accounts**：`name`、`address_line`、`suburb`、`postcode` 使用 `COALESCE(NULLIF(TRIM(new), ''), existing)` 逻辑，**新值为空时保留旧值**
- **contacts**：`name`、`email`、`phone` 同样逻辑
- **jobs**：`job_number`、`description`、`address_line`、`suburb`、`status` 以及 `job_date`、`completed_at` 同样逻辑

后续 ServiceM8 同步时，不会再拿空值覆盖已有记录。

## 修复已丢失数据

若 suburb 等已被覆盖，可执行：

```bash
# 仅修复 suburb（从 jobs、address_line 回填）
pnpm --filter @bht/crm run repair:suburb

# 完整数据标准化（含 suburb 回填 + 其他清洗）
pnpm --filter @bht/crm run normalize:crm-data
```

`repair:suburb` 只会为**当前 suburb 为空的 account** 从 jobs.suburb 或 address_line 提取并回填 suburb。
