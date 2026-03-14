# CRM Data Audit & Cleaning Design

本文对当前 CRM 的主要数据表、数据来源、数据质量问题以及清洗策略做一次系统盘点，重点围绕：老客户激活、大客户/upgrade/energy 潜客识别、Lead 跟进和未来客户价值评分。

---

## 1. Current Data Inventory

本节基于数据库 schema（`002_domain_model.sql` + `003_servicem8_history.sql`）和现有代码推断用途。**计数与样例通过 SQL 获取，本文给出查询建议。**

### 1.1 accounts

- **用途**：客户主实体（公司/家庭），ServiceM8 company 与 landing-page/CRM 新建客户的统一归宿。
- **字段与含义**
  - `id (uuid)`：Account 主键
  - `name`：客户名称（公司名或家庭名称）
  - `address_line`：地址（来自 ServiceM8 address 或手填）
  - `suburb`：区域/城区
  - `postcode`：邮编
  - `status`：`active`/其它，将来可用于停用/归档
  - `created_at/updated_at`：创建/最近更新时间
  - `created_by`：来源标记，如 `servicem8-sync`、`landing-page`、`manual`（目前使用较松散）
- **数据主要来源**
  - ServiceM8 `company.json`（正式 sync）
  - legacy `import-servicem8-customers.js`（已停用）
  - CRM 内部创建（Leads 转换 / 手动）
- **只读 SQL 示例**
  ```sql
  -- 总量
  SELECT COUNT(*) FROM accounts;

  -- 按来源粗分（假设 created_by 使用了一些约定值）
  SELECT created_by, COUNT(*) FROM accounts GROUP BY created_by ORDER BY COUNT(*) DESC;
  ```

### 1.2 contacts

- **用途**：联系人（通常是一位具体的人），用于激活 SMS、跟进和与 leads/opportunities 关联。
- **字段与含义**
  - `id (uuid)`
  - `account_id`：关联 account
  - `name`：联系人姓名（当前混有不少“公司名型”值）
  - `email`：邮箱
  - `phone`：电话（格式多样）
  - `role`：角色（目前使用较少）
  - `status`：`active` / `archived`（我们用 `archived` 做软删）
  - `created_at/updated_at/created_by`
- **数据主要来源**
  - ServiceM8 `companycontact.json`（当前 sync 主路径）
  - 早期 ServiceM8 `company.json`（legacy import，把 company.name 当联系人名）
  - CRM 内部：从 leads 创建 / 手动录入
- **只读 SQL 示例**
  ```sql
  -- 总量
  SELECT COUNT(*) FROM contacts;

  -- 有 phone 或 email 的“可联系”联系人
  SELECT COUNT(*) FROM contacts
  WHERE (phone IS NOT NULL AND TRIM(phone) <> '')
     OR (email IS NOT NULL AND TRIM(email) <> '');

  -- 按 status 分布（评估 archived 规模）
  SELECT COALESCE(status, 'active') AS status, COUNT(*) FROM contacts GROUP BY COALESCE(status, 'active');
  ```

### 1.3 leads

- **用途**：从 landing-page / web forms / 其他渠道进入 CRM 的线索，尚未完全转换为机会/opportunity。
- **字段**
  - `id`, `contact_id`, `account_id`
  - `source`：来源（landing-page / referral / campaign 等）
  - `status`：`new`/其它阶段（如 `qualified` / `lost` 等）
  - `converted_opportunity_id`：关联的机会（若已转化）
  - `created_at/updated_at/created_by`
- **数据来源**
  - 主要来自 landing-page 提交、内部联系录入，以及未来可能的 API 导入。
- **SQL 示例**
  ```sql
  SELECT COUNT(*) FROM leads;
  SELECT source, COUNT(*) FROM leads GROUP BY source ORDER BY COUNT(*) DESC;
  ```

### 1.4 opportunities

- **用途**：销售机会/报价级别的实体，用于跟进 pipeline 和价值估计。
- **字段**
  - `id`, `account_id`, `contact_id`, `lead_id`
  - `stage`：`discovery`/`proposal`/`won`/`lost` 等
  - `value_estimate`：机会预估金额
  - `closed_at`, `status`
  - `created_at/updated_at/created_by`
- **数据来源**
  - 来自 leads 转换和 CRM 内部创建（目前多为手工/脚本）。
- **SQL 示例**
  ```sql
  SELECT COUNT(*) FROM opportunities;
  SELECT stage, COUNT(*) FROM opportunities GROUP BY stage;
  ```

### 1.5 jobs（003_servicem8_history.sql）

- **用途**：ServiceM8 工单/历史服务记录，按 `servicem8_job_uuid` 唯一。
- **字段**
  - `id (uuid)`
  - `account_id`, `contact_id`
  - `servicem8_job_uuid`, `job_number`
  - `description`：工单描述
  - `address_line`, `suburb`
  - `status`：ServiceM8 job 状态
  - `job_date`, `completed_at`
  - `created_at/updated_at/created_by`
- **数据来源**
  - ServiceM8 `job.json`（正式 sync）
- **SQL 示例**
  ```sql
  SELECT COUNT(*) FROM jobs;
  SELECT status, COUNT(*) FROM jobs GROUP BY status ORDER BY COUNT(*) DESC;
  ```

### 1.6 invoices（003）

- **用途**：ServiceM8 发票记录（你当前账号暂未授权 invoice API，目前为空或极少）。
- **字段**
  - `id`, `account_id`, `job_id`
  - `servicem8_invoice_uuid`, `invoice_number`
  - `amount`, `invoice_date`, `status`
  - `created_at/updated_at/created_by`
- **数据来源**
  - 预期：ServiceM8 `invoice.json`；当前 400 未授权。
- **SQL 示例**
  ```sql
  SELECT COUNT(*) FROM invoices;
  ```

### 1.7 job_materials（003）

- **用途**：工单明细材料/服务行项目，用于分析材料用量、upgrade 类型、消费结构。
- **字段**
  - `id`, `job_id`
  - `servicem8_job_material_uuid`
  - `material_name`
  - `quantity`, `unit_price`, `total_price`
  - `created_at/updated_at/created_by`
- **来源**
  - ServiceM8 `jobmaterial.json`（正式 sync）
- **SQL 示例**
  ```sql
  SELECT COUNT(*) FROM job_materials;
  SELECT material_name, COUNT(*) FROM job_materials GROUP BY material_name ORDER BY COUNT(*) DESC LIMIT 20;
  ```

### 1.8 external_links

- **用途**：外部系统与 CRM 实体的映射表，当前主要用于 ServiceM8 company → account 的 mapping。
- **字段**
  - `system`：如 `servicem8`
  - `external_entity_type`：如 `company`
  - `external_id`：外部系统的 id（ServiceM8 company uuid）
  - `entity_type`：如 `account`
  - `entity_id`：CRM 实体 id（accounts.id）
  - `created_at/updated_at`
- **来源**
  - ServiceM8 sync（companies → accounts）和 legacy import。
- **SQL 示例**
  ```sql
  SELECT COUNT(*) FROM external_links;
  SELECT system, external_entity_type, entity_type, COUNT(*) 
  FROM external_links GROUP BY system, external_entity_type, entity_type;
  ```

### 1.9 activities

- **用途**：与联系人/Lead/机会相关的行为记录（如发送 SMS、电话记录等）。
- **字段**
  - `id`, `contact_id`, `lead_id`, `opportunity_id`
  - `activity_type`：如 `sms`、`call`
  - `summary`：行为摘要
  - `occurred_at`, `created_at/updated_at/created_by`
- **来源**
  - CRM API 中记录的操作（例如 reactivation 短信会写入一条 `sms` 记录）。

### 1.10 domain_events

- **用途**：领域事件日志（事件类型、payload），用于审计或后续事件驱动。
- **字段**
  - `event_type`, `aggregate_type`, `aggregate_id`
  - `payload (jsonb)`
  - `occurred_at`, `processed_at`, `created_at/updated_at`

### 1.11 reports / inspections / tasks

- **用途（简要）**
  - `inspections`：验收/检查记录，连接 opportunities + accounts + contacts + assets。
  - `reports`：检查生成的报告（PDF/Docx）的元数据。
  - `tasks`：跟进任务（待办），关联 contact / lead / opportunity / inspection。

---

## 2. Data Sources & Flow

### 2.1 Landing page / Web Forms

- 主要写入：
  - `leads`（source=landing-page 等）
  - `contacts` + `accounts`（在某些流程中会一起创建）
  - 后续可能生成 `opportunities` / `tasks`

### 2.2 ServiceM8 Sync

- company.json → `accounts` + `external_links`
- contact.json / companycontact.json → `contacts`
- job.json → `jobs`
- invoice.json → `invoices`（当前账号未授权）
- jobmaterial.json → `job_materials`

### 2.3 Legacy Import

- `import-servicem8-customers.js`（已标记 LEGACY）：
  - 从 company.json 直接创建：
    - `accounts`（合理）
    - `contacts`：**错误地把 company.name/contact_name 当联系人名 → 产生大量 `Help Guide Job` / `Card ...` / `PAYPAL ...` 等脏联系人。
  - 写入 `external_links`。

### 2.4 Manual / Internal

- 运营手动在 CRM 内创建/更新：
  - leads / contacts / accounts / activities / tasks / opportunities。

---

## 3. Data Quality Issues

基于前面分析和你已观察到的现象，列出主要问题类型和涉及的表/字段。

### 3.1 空值比例高的字段（潜在问题）

- `contacts.phone` / `contacts.email`
  - legacy 导入和部分 ServiceM8 记录中 phone/email 缺失，导致大量不可联系联系人。
- `accounts.suburb` / `accounts.address_line`
  - 部分来源缺乏地址信息，影响区域细分和 geo-based targeting。
- `jobs.description`
  - 某些 job 只作为技术/内部说明，可能较短或为空；对行为分析价值有限。
- `invoices.amount`
  - 目前 invoice API 未授权，大概率为空或极少。

**SQL 示例（空值比例）**

```sql
-- contacts.phone/email 空值情况
SELECT 
  SUM(CASE WHEN phone IS NULL OR TRIM(phone) = '' THEN 1 ELSE 0 END)::float / COUNT(*) AS phone_null_rate,
  SUM(CASE WHEN email IS NULL OR TRIM(email) = '' THEN 1 ELSE 0 END)::float / COUNT(*) AS email_null_rate
FROM contacts;
```

### 3.2 格式不统一的字段

- `contacts.phone`
  - 有空格、括号、破折号、本地/国际格式混杂；目前通过 SQL 正则归一匹配，但显示/导出不统一。
- `contacts.email`
  - 大小写、尾部空格等未全部归一化（sync 中已做部分 trim/lower，但 legacy 记录未清理）。
- `accounts.suburb`
  - 大小写混合（`Sydney` vs `sydney`）、缩写不统一。

**SQL 示例（phone 格式分布抽样）**

```sql
SELECT phone, COUNT(*) 
FROM contacts
WHERE phone IS NOT NULL AND TRIM(phone) <> ''
GROUP BY phone
ORDER BY COUNT(*) DESC
LIMIT 50;
```

### 3.3 疑似脏数据（特别是 legacy import）

- `contacts.name` 含有：
  - `Job` / `Card` / `PAYPAL` / `Transfer` / `Help` 等关键字；
  - 且 `phone`/`email` 同时为空。
- `accounts.name` 同样可能包含非客户实体（支付通道、系统测试）。
- `contacts.status='archived'` 中大部分是通过归档脚本标记的 legacy 垃圾联系人。

**SQL 检查示例**

```sql
SELECT c.id, c.name, c.phone, c.email
FROM contacts c
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
LIMIT 100;
```

### 3.4 重复数据风险

- `contacts`：
  - 同一个 phone / email 出现多个联系人。
  - legacy import 可能基于 company-level phone/email 重复创建。
- `accounts`：
  - 相同 `name + suburb` 的多条记录（ServiceM8 company 与 landing-page 不一致命名时风险更高）。

**SQL 示例（重复 phone/email 候选）**

```sql
-- 按 phone（去除非数字）聚合
SELECT 
  regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') AS phone_digits,
  COUNT(*) AS cnt
FROM contacts
WHERE phone IS NOT NULL AND TRIM(phone) <> ''
GROUP BY phone_digits
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 按 email（小写，trim）聚合
SELECT 
  LOWER(TRIM(email)) AS norm_email,
  COUNT(*) AS cnt
FROM contacts
WHERE email IS NOT NULL AND TRIM(email) <> ''
GROUP BY norm_email
HAVING COUNT(*) > 1
ORDER BY cnt DESC;
```

### 3.5 来源混杂问题

- ServiceM8 company vs contact：
  - 早期 import 将 company-level 信息塞进 contacts，导致“联系人名字其实是公司名”。
- landing-page vs ServiceM8：
  - leads ∕ contacts/account 的字段完整度、source 标记不统一。
- created_by/source：
  - 部分记录未明确标注来源，难以追溯。

---

## 4. High-Value Business Fields

结合你的业务目标（老客户激活、大客户识别、upgrade/energy 潜客、lead 跟进、未来价值评分），优先关注以下字段。

### 4.1 A. 客户主数据（who）

- `accounts.name`：客户名称（家庭/公司）
- `accounts.suburb` / `accounts.postcode`：地理分布，利于区域营销
- `contacts.name`：联系人姓名
- `contacts.phone`：短信/电话主键
- `contacts.email`：邮件触达/验证渠道
- `external_links (servicem8 company uuid -> account_id)`：ServiceM8 ↔ CRM 去重基础

### 4.2 B. 客户行为数据（what & when）

- `jobs.job_date` / `completed_at`：
  - 最近一次服务时间（last job date）
  - 服务频率（job count per account）
- `jobs.status`：
  - 已完成 / 取消 / 未排程
- `job_materials.material_name` / `quantity` / `total_price`：
  - upgrade 类型（如 EV charger / switchboard upgrade 等）
  - 材料/服务偏好
- `invoices.amount` / `invoice_date`（未来开放后）：
  - 客户总收入 / 年度收入 / 客单价

### 4.3 C. 销售与线索数据（why & how）

- `leads.source`：
  - 渠道表现（landing-page / referral / campaign）
- `leads.status`：
  - 跟进阶段，未转化的潜在线索
- `opportunities.stage` / `status` / `value_estimate`：
  - pipeline 健康度，大单识别
- `activities.activity_type` / `occurred_at`：
  - 最近一次触达（SMS/Call），配合激活策略

---

## 5. Cleaning Strategy

清洗策略分为两类：**同步时清洗** 和 **定期批量清洗**。

### 5.1 A. 同步时顺手清洗（ingestion-time）

建议在以下入口处内嵌清洗逻辑：

- **ServiceM8 sync（`servicem8-sync.js`）**
  - phone：
    - 存库前统一用正则保留数字（显示时可格式化）。
  - email：
    - `trim + lowercase`，过滤明显无效（不含 `@`）。
  - suburb / name：
    - `trim`，统一首字母大写（可在 UI 层或批量 job 做）。
  - 跳过明显垃圾联系人：
    - 在 sync 时对 `contact.name` 命中 `Job/Card/PAYPAL/Transfer/Help` 且 phone/email 均为空的记录直接 `skip`。
  - created_by / source：
    - 明确写入 `created_by='servicem8-sync'`，便于溯源。

- **Landing-page Ingestion**
  - phone / email 的格式归一同上；
  - 若手机号/邮箱为空则不创建 contact（只留 lead），或标记为低信任级。
  - source 必填，如 `landing-page:energy`、`landing-page:upgrade`。

### 5.2 B. 定期批量清洗（scheduled）

可以设计一个每日/每周运行的“数据健康检查” job，仅做 SELECT 或 UPDATE（不 DELETE），包括：

- 重复联系人候选列表：
  - 按 phone/email 归一后聚合，输出 `cnt > 1` 列表，人工 merge。
- 软归档可疑联系人：
  - 利用现有 `status='archived'` 逻辑，把明显垃圾联系人统一归档（已实现脚本可定期跑）。
- 缺失 suburb/account 报告：
  - `accounts.suburb` 为空但有多个 jobs 的客户 → 优先补全地址；
  - `contacts.account_id` 为空的记录 → 检查并关联。
- orphan external_links：
  - entity_id 不在 accounts 中的 external_links → 报告或清理。
- 质量仪表盘：
  - 按月输出关键质量指标（phone/email 完整率、重复比、archived 数量、无 suburb 比例等）。

---

## 6. Recommended Next Steps

结合当前状态，建议的优先级如下：

### 6.1 当前已同步的数据概览

从最近一次 sync Summary 看，Neon 中已包含：

- 约 1800+ 个 `accounts`（来自 ServiceM8 company + 可能的 legacy/landing-page）
- 500+ `contacts`（来自 companycontact + 部分 legacy/CRM）
- 800+ `jobs`，2000+ `job_materials`
- leads/opportunities/activities 等由 CRM 自身业务产生

### 6.2 数据质量相对较好的部分

- `accounts`（新 sync 更新的部分，字段较干净）
- `jobs` / `job_materials`（纯来自 ServiceM8，结构清晰）
- `leads` / `opportunities` / `activities`（数量不算极大，业务生成，便于手动纠偏）

### 6.3 问题最严重的部分

- `contacts`：
  - legacy 导入 + ServiceM8 公司级信息混入，导致：
    - 名字不是人（Help Guide Job / Card / PAYPAL...）
    - phone/email 大量为空
    - 重复 phone/email 风险大
- `external_links`：
  - 可能存在少量 orphan（指向已删 account），需定期检查。
- `accounts.suburb/address_line`：
  - 不完整会影响区域筛选和 energy advisory 分层。

### 6.4 最值得优先清洗的 5 个点

1. **contacts 中 legacy 垃圾联系人归档/清理**（已执行软归档与部分硬删计划，可继续优化规则）。
2. **contacts.phone/email 归一化与补全**：
   - phone 按数字统一，email trim+lowercase。
3. **accounts.suburb / address_line 填充**：
   - 对有 job history 但没 suburb/address 的 accounts 进行补录。
4. **重复 contact 候选列表**：
   - 按 phone/email 分组，人工合并。
5. **orphan external_links 检查**：
   - 每周/每月跑一次 orphan 报告，保持 mapping 干净。

### 6.5 下一步推荐动作

1. 在 Neon 上按本文 SQL 做一次“数据健康检查”并导出结果（CSV/Sheets），人工浏览几批样本。
2. 确认 ingestion-time 清洗规则（尤其是 ServiceM8 sync 的 skip 条件和 phone/email 归一化）并逐步内嵌。
3. 设计一个简单的“数据健康 Cron”（可先放在 docs 中，再实现）：
   - 每周运行一次，只产生报告表或 log（不自动 DELETE）。
4. 在准备做客户价值评分前，优先确保：
   - job history 完整；
   - 每个高价值 account 至少有一个可联系的 contact（phone/email）。

这样可以在不大改现有业务逻辑的前提下，把当前数据盘干净、打上“可信度”标签，为后续的客户价值模型、老客户激活、energy advisory 推广打好基础。

