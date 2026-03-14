# ServiceM8 自动同步（客户 → CRM）

本文说明 ServiceM8 客户数据单向同步到 CRM 的机制：同步内容、映射规则、去重、如何运行与 DRY_RUN，以及后续扩展方向。

---

## 1. 同步做什么

- **方向**：ServiceM8 → CRM（单向）
- **数据源**：仅 ServiceM8 客户相关 API，**不使用** payment/invoice/expense 等接口。
  - **company.json**：公司 → accounts（name, address_line, suburb）
  - **contact.json**：联系人 → contacts（name, phone, email），通过 contact.company_uuid 关联 account
- **目标**：CRM 的 **accounts**、**contacts**、**external_links**
- **性质**：幂等、可重复执行；已存在则更新，不存在则创建

同步服务由 **apps/crm/services/servicem8-sync.js** 实现，可由 CLI 脚本或未来的定时任务/API 触发。

---

## 2. 当前同步的实体

| 实体 | 说明 |
|------|------|
| **Accounts** | 来自 GET /api_1.0/company.json（company.name, address, city） |
| **Contacts** | 来自 GET /api_1.0/contact.json（contact.name, mobile/phone, email, company_uuid） |
| **External links** | system=servicem8, external_entity_type=company, external_id=company.uuid → entity_type=account, entity_id=account.id |

当前**不**同步：jobs、opportunities、双向回写。

---

## 3. 字段映射规则

### Company → Account

| ServiceM8 (company.json) | CRM |
|--------------------------|-----|
| `company.name` | **accounts.name** |
| `company.address` | **accounts.address_line** |
| `company.city` | **accounts.suburb** |

### Contact → Contact

| ServiceM8 (contact.json) | CRM |
|---------------------------|-----|
| `contact.name` | **contacts.name** |
| `contact.mobile` 或 `contact.phone` | **contacts.phone** |
| `contact.email` | **contacts.email** |
| `contact.company_uuid` | 用于查找 CRM account_id（经 external_links 映射） |

缺失字段时写入 `null`。若 contact 的 company_uuid 在 CRM 中无对应 account，则跳过该 contact。

---

## 4. 去重规则

### Accounts

1. **external_links 优先**：`system='servicem8'`, `external_entity_type='company'`, `external_id=<ServiceM8 company UUID>`。若存在则用对应 `entity_id`（account id）并做更新。
2. **name + suburb**：若无 external link，则按 `accounts.name` + `accounts.suburb`（忽略大小写、trim）查找；找到则更新该 account 并写入 external_links。
3. **新建**：以上都未找到则新建 account 并写入 external_links。

### Contacts

1. **phone**：按“仅数字”归一化后匹配 `contacts.phone`；找到则更新该 contact 并关联当前 account。
2. **email**：若无 phone 匹配，再按 `contacts.email`（小写、trim）匹配；找到则更新并关联。
3. **新建**：phone、email 都未匹配则新建 contact（允许无 phone/email 的“低信任”记录，仅做创建并关联 account）。

---

## 5. external_links 如何使用

每条成功同步的 ServiceM8 company 对应一条 **external_links** 记录：

| 列 | 值 |
|----|-----|
| `system` | `servicem8` |
| `external_entity_type` | `company` |
| `external_id` | ServiceM8 company UUID |
| `entity_type` | `account` |
| `entity_id` | CRM account UUID |

用于：

- 下次同步时通过 `external_id` 找到已有 account，避免重复创建；
- 为将来按 ServiceM8 维度查询、扩展 jobs 等同步预留。

---

## 6. 如何手动运行

从**仓库根目录**：

```bash
pnpm sync:servicem8:contacts
```

或进入 CRM 应用目录：

```bash
cd apps/crm
node scripts/sync-servicem8-contacts.js
```

需配置环境变量：`SERVICEM8_API_KEY`、`DATABASE_URL`（及按需 `DATABASE_SSL`）。  
执行一次即拉取 ServiceM8 companies，按上述规则 upsert accounts/contacts 并维护 external_links。

---

## 7. 如何 DRY_RUN

不写库，只拉取并打印将要执行的操作统计：

```bash
DRY_RUN=true pnpm sync:servicem8:contacts
```

或：

```bash
DRY_RUN=1 node apps/crm/scripts/sync-servicem8-contacts.js
```

输出包含：从 ServiceM8 拉取条数、将新建/更新的 accounts 与 contacts 数量、跳过与错误数。适合先确认再正式跑。

---

## 8. 以后如何扩展到 jobs

当前仅同步客户（companies → accounts + contacts）。若将来同步 jobs：

- 在 **packages/integrations** 的 ServiceM8 客户端中已有 `getJobs()`，可复用；
- 在 **servicem8-sync** 中新增例如 `syncJobsFromServiceM8()`（或扩展现有 sync），只读 ServiceM8 jobs，写入 CRM 的 jobs/domain 表（若已存在）；
- 通过 **external_links** 或 job 表上的 `servicem8_uuid` 做幂等 upsert，避免重复；
- 定时任务（Railway cron / Netlify scheduled / 后台按钮）仅需调用同一套 sync 服务，无需把逻辑写在脚本里。

当前文档与实现不包含 jobs 同步逻辑，仅预留上述扩展思路。

---

## 9. 错误处理与日志

- 单条记录失败不会中断整次同步，该条计入 `errors`，其余继续。
- CLI 通过 `onError` 回调输出失败记录的 ServiceM8 id 与错误信息。
- 结束时输出汇总：fetched、total processed、accounts_created/updated、contacts_created/updated、skipped、errors。

---

## 10. 相关文件

| 文件 | 说明 |
|------|------|
| **packages/integrations/servicem8/index.js** | ServiceM8 API 客户端（如 `getCompanies()`） |
| **apps/crm/services/servicem8-sync.js** | 同步逻辑：拉取、映射、去重、upsert、external_links |
| **apps/crm/scripts/sync-servicem8-contacts.js** | CLI 入口，支持 DRY_RUN，调用 sync 并打印统计 |

> ⚠️ **Legacy 导入脚本（停用）**  
> 旧的一次性导入脚本 **apps/crm/scripts/import-servicem8-customers.js** 已被标记为 *LEGACY*，并确认会把 `company.name` 当作 `contacts.name`，产生诸如 “Help Guide Job”、“Card xx1246”、“PAYPAL ...” 等脏联系人。  
> 该脚本仅保留作历史参考，**不要再用于客户/联系人同步或导入**。正式、可重复的同步入口为：
> - `apps/crm/services/servicem8-sync.js`
> - `apps/crm/scripts/sync-servicem8-contacts.js`
> - `apps/crm/scripts/sync-servicem8-all-history.js`
