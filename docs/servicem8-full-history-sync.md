# ServiceM8 全量历史同步

本文档说明将 ServiceM8 中与客户分析相关的历史数据**单向、全量、幂等**同步到 CRM 的设计与用法。

## 一、同步的实体

| ServiceM8 数据源 | CRM 目标 | 说明 |
|------------------|----------|------|
| company.json     | accounts + external_links | 客户主体，通过 external_links 与 ServiceM8 company uuid 一一对应 |
| contact.json / companycontact.json | contacts | 联系人，归属 account，按 phone/email 去重 |
| job.json         | jobs     | 工单，按 servicem8_job_uuid 唯一 |
| invoice.json     | invoices | 发票，按 servicem8_invoice_uuid 唯一 |
| jobmaterial.json | job_materials | 工单材料，按 servicem8_job_material_uuid 唯一 |

CRM 中参与同步的实体：**accounts**、**contacts**、**jobs**、**invoices**、**job_materials**、**external_links**（沿用现有设计，不推翻）。

---

## 二、为什么客户不会因为多个项目而重复

- **Account（客户）** 只允许创建一次，与“做了多少个项目”无关。
  - 同步时先用 **external_links** 查找：`system = servicem8`、`external_entity_type = company`、`external_id = ServiceM8 company uuid` → 得到已有 `account_id`。
  - 若没有 external link，再用**保守匹配**：`name + suburb` 或 `name + address_line` 匹配已有 account，匹配到则写入 external_links 并更新该 account。
  - 仍找不到才**新建** account，并写入 external_links。
- 因此：同一 ServiceM8 公司（同一 uuid）在 CRM 中始终对应**同一个** account，不会因为多个 job/invoice 而重复创建客户。

---

## 三、为什么 jobs / invoices / job_materials 必须是一对多

- **Job**：每个 ServiceM8 工单对应 CRM 中**一条** jobs 记录，按 `servicem8_job_uuid` 唯一。同一客户多个工单 = 多个 job 行，共用同一个 account_id。
- **Invoice**：按 `servicem8_invoice_uuid` 唯一；通过 `job_id` 关联 jobs，通过 `account_id` 关联 accounts。
- **Job material**：按 `servicem8_job_material_uuid` 唯一；通过 `job_id` 关联 jobs。

这样设计才能支持后续按客户维度做**行为分析**（工单数、发票金额、材料用量等），同时保证数据不重复、可追溯。

---

## 四、去重规则小结

| 实体 | 唯一键 / 去重逻辑 |
|------|-------------------|
| account | 1) external_links(servicem8, company, company_uuid) → entity_id；2) name + suburb 或 name + address_line；3) 否则新建 |
| contact | 1) phone（数字归一化）；2) email（trim + lowercase）；3) 否则新建。同一 contact 可更新 account_id（归属） |
| job | servicem8_job_uuid 唯一，存在则 UPDATE，否则 INSERT |
| invoice | servicem8_invoice_uuid 唯一，存在则 UPDATE，否则 INSERT |
| job_material | servicem8_job_material_uuid 唯一，存在则 UPDATE，否则 INSERT |

---

## 五、external_links 的使用方式

- **表**：`external_links`（现有，不改结构）。
- **用途**：记录 ServiceM8 company uuid → CRM account id 的映射。
- **写入时机**：在 `syncCompaniesFromServiceM8` 中，每确定一个 account（新建或通过 name+suburb 匹配到）后，写入或更新：
  - `system = 'servicem8'`
  - `external_entity_type = 'company'`
  - `external_id = company.uuid`
  - `entity_type = 'account'`
  - `entity_id = account.id`
- **读取**：sync contacts / jobs / invoices 时，通过 `external_id`（company uuid）查 `entity_id` 得到 `account_id`，用于关联 CRM account。

---

## 六、如何运行全量同步

1. **环境**：在项目根目录 `.env` 中配置 `DATABASE_URL`、`SERVICEM8_API_KEY`（以及可选 `DATABASE_SSL`）。
2. **数据库**：先执行 ServiceM8 历史表 migration（jobs、invoices、job_materials）：
   ```bash
   node apps/crm/scripts/run-servicem8-history-migration.js
   ```
   或从 `apps/crm` 目录：`node scripts/run-servicem8-history-migration.js`。依赖 002 的 accounts/contacts 等表，请先跑 002 再跑 003。
3. **命令**（在仓库根目录）：
   ```bash
   pnpm sync:servicem8:all
   ```
   或在 CRM 包下：
   ```bash
   pnpm --filter @bht/crm run sync:servicem8:all
   ```

执行顺序：companies → contacts → jobs → invoices → job_materials，保证外键（account_id、job_id）在写入时已存在。

---

## 七、如何 DRY_RUN

不写库、只统计将要创建/更新/跳过的数量：

```bash
DRY_RUN=true pnpm sync:servicem8:all
```

脚本会输出 fetched / created / updated / skipped / errors 的 summary，且不会插入或更新任何记录。

---

## 八、后续：增量同步（方向，当前未实现）

- 可在现有 `syncCompaniesFromServiceM8`、`syncContactsFromServiceM8`、`syncJobsFromServiceM8`、`syncInvoicesFromServiceM8`、`syncJobMaterialsFromServiceM8` 上增加**过滤参数**（例如 `$filter=last_modified_date gt 'YYYY-MM-DD'`），只拉取近期变更。
- 全量同步与增量同步共用同一套去重与 external_links 逻辑，保证幂等；增量仅减少 API 与 DB 写入量。
- 建议：先跑通全量，再在 client 层为各 API 增加可选 `modifiedSince` 参数，并在 sync 脚本中支持“仅同步某日期之后”的选项。

---

## 九、后续：客户价值评分（方向，当前未实现）

- 数据就绪后，可在 CRM 侧基于 **accounts** + **jobs** + **invoices** + **job_materials** 做聚合（例如：工单数、发票总额、最近一次工单时间、材料消费等），计算客户价值或 RFM 类指标。
- 建议单独建表或视图存放“客户评分/分层”结果，不改变本次同步逻辑；评分逻辑与同步解耦，便于迭代。

---

## 十、字段映射与 API 差异说明

- **Company → accounts**：name, address/street → address_line, city/suburb → suburb；若 API 返回字段名不同（如 camelCase），代码中已做兼容（如 `c.companyName`、`c.addressSuburb`）。
- **Contact → contacts**：name, mobile/phone, email, company_uuid → account_id（经 external_links 解析）。
- **Job → jobs**：uuid → servicem8_job_uuid，company_uuid → account_id，description/notes、address、suburb/city、status、date、completed_date 等映射到对应列；contact_id 当前可为空，后续可按业务补充。
- **Invoice → invoices**：uuid → servicem8_invoice_uuid，company_uuid → account_id，job_uuid → job_id（经 jobs 表解析），total/amount → amount，date → invoice_date，status → status。
- **Job material → job_materials**：uuid → servicem8_job_material_uuid，job_uuid → job_id，name/description → material_name，qty/quantity → quantity，unit_price，total/line_total → total_price。

若实际 ServiceM8 API 返回字段与上述不一致，在 `apps/crm/services/servicem8-sync.js` 中对应映射处做适配即可，建议在本文档此处补充说明实际字段名。
