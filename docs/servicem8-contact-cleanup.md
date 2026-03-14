# ServiceM8 联系人脏数据清理说明

本文说明：为什么会产生脏联系人、现在的正式同步路径、如何识别与清理脏联系人，以及如何避免再次发生。

---

## 1. 问题来源

早期我们通过 **apps/crm/scripts/import-servicem8-customers.js** 这个一次性导入脚本，把 ServiceM8 的 company.json 数据直接导入到 CRM：

- 每个 ServiceM8 company → 一个 `accounts` 记录
- 同时从 company 级别信息创建一个 `contacts` 记录

该脚本的字段映射中：

- `contacts.name` 来自 `company.contact_name`，如没有则 **回退到 `company.name` / `company.company_name`**
- `contacts.phone` / `contacts.email` 来自 company 上的 phone/email 字段

结果是：

- 对于非“真人联系人”的公司（帮助账号、支付通道、测试卡片等），也会被创建为 CRM 联系人；
- 这些记录往往：
  - name 类似 `Help Guide Job`、`Card xx1246`、`Transfer to ...`、`PAYPAL ...` 等；
  - phone/email 为空；
  - suburb 也为空或来自“假 account”。

这就是当前在 `contacts` 表中看到的大量“非真人”记录的来源。

---

## 2. 旧脚本为何会产生脏联系人

在 `import-servicem8-customers.js` 中：

- `extractCompanyFields(c)` 定义：
  - `contact_name: c.contact_name || c.name || c.company_name || c.companyName || ''`
- 随后用 `fields.contact_name` 直接写入：
  - `INSERT INTO contacts (account_id, name, email, phone) VALUES (...)`

当 ServiceM8 中的 company 不是“具体某个人”，而是：

- 帮助 / 教程公司（如 `Help Guide Job`）
- 支付记录（如 `PAYPAL *XXXX`）
- 银行卡 / 卡号（如 `YANJES GROUP PTY L Card xx1246`）
- 迁移 / 转账类 placeholder（如 `Transfer to other ...`）

就会被当作联系人插入 `contacts`，并且 phone/email 多数为空，形成脏数据。

---

## 3. 现在正式的同步路径

当前正式的 ServiceM8 → CRM 同步服务位于：

- `apps/crm/services/servicem8-sync.js`
- 入口脚本：
  - `apps/crm/scripts/sync-servicem8-contacts.js`
  - `apps/crm/scripts/sync-servicem8-all-history.js`

原则：

1. **company 只同步到 accounts**
   - 来源：`/api_1.0/company.json` → `accounts` + `external_links`
2. **contact / companycontact 只同步到 contacts**
   - 来源：`/api_1.0/contact.json` 或 `/api_1.0/companycontact.json` → `contacts`
   - 字段：`contact.name` / `contact.mobile|phone` / `contact.email` / `contact.company_uuid`
3. **job 不参与联系人创建**
   - `/job.json` 只写入 `jobs` 表，不创建或更新 contacts
4. **所有定时同步只走新的 sync 服务**
   - 全量：`syncAllFromServiceM8({ mode: 'full' })`
   - 增量：`syncAllFromServiceM8({ mode: 'incremental', ... })`
5. **旧 import 脚本不再写入 contacts**
   - 文件保留但标记为 LEGACY，package.json 脚本改为 `import:servicem8:legacy`，文档也标明“仅历史参考，不推荐使用”。

---

## 4. 如何识别脏联系人

我们新增了一个**只读报告脚本**：

- `apps/crm/scripts/report-suspicious-contacts.js`

用途：根据一组启发式规则，在数据库中识别“疑似由 legacy 导入脚本产生”的联系人，**不做任何写入**，只输出统计和样例。

### 4.1 启发式规则

当前规则包括（可按需调整）：

1. **Rule 1：phone 为空且 email 为空**
   - `phone IS NULL OR TRIM(phone) = ''`
   - `email IS NULL OR TRIM(email) = ''`
2. **Rule 2：name 含有关键字**
   - `name ILIKE ANY (['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])`
3. **Rule 3：Rule1 + Rule2**
   - 即“无 phone/email 且 name 命中关键词”，高度怀疑是脏联系人
4. **Rule 4：Rule3 + 账户也很弱**
   - `accounts.suburb` 与 `accounts.address_line` 也为空或很弱（说明连 account 本身也是残缺导入）

脚本会输出：

- 各 Rule 命中的总数量
- 使用的 name 模式列表
- 符合 Rule3 的前 50 条样例（含 contact_id、name、account 名称、suburb、created_at、created_by 等），方便人工 review。

---

## 5. 当前清理策略（软归档，仍不 DELETE）

目前我们通过“**软归档**”方式处理 legacy 脏联系人：

- 利用 `contacts.status` 字段（已有，默认 `active`）
- 对疑似脏联系人执行：`UPDATE contacts SET status = 'archived' ...`
- 前端 Contacts 列表和详情默认**不再展示** `status='archived'` 的记录

### 5.1 步骤一：跑报告脚本（只读）

### 5.1 步骤一：跑报告脚本（只读）

```bash
node apps/crm/scripts/report-suspicious-contacts.js
```

查看输出：

- 各规则命中的数量（大致规模）
- 样例 50 条，核对是否真的是“非真人联系人”

### 5.2 步骤二：导出候选列表供人工审核

可以在数据库层面做一条只读 SQL，把 Rule3 或 Rule4 命中的全量结果导出到 CSV，人工在 Excel / Sheets 中标记“保留 / 可归档 / 可删除”：

> 下述 SQL 仅为参考，**不要直接加 DELETE**：

```sql
SELECT c.id,
       c.name,
       c.phone,
       c.email,
       c.created_at,
       c.created_by,
       a.id   AS account_id,
       a.name AS account_name,
       a.suburb,
       a.address_line
FROM contacts c
LEFT JOIN accounts a ON c.account_id = a.id
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
ORDER BY c.created_at DESC;
```

### 5.3 步骤三：执行软归档脚本（status='archived'）

我们新增了一个**带 DRY_RUN 的归档脚本**：

- `apps/crm/scripts/archive-suspicious-contacts.js`

用法：

```bash
# 只看会归档多少条（不写库）
DRY_RUN=true node apps/crm/scripts/archive-suspicious-contacts.js

# 真正执行软归档（status -> archived）
node apps/crm/scripts/archive-suspicious-contacts.js
```

脚本行为：

- 使用与报告脚本相同的规则（phone/email 为空 + name 匹配关键词）
- 仅选择当前 `status IS NULL` 或 `status <> 'archived'` 的候选
- 在非 DRY_RUN 模式下执行：
  - `UPDATE contacts SET status='archived', updated_at=NOW() WHERE id IN (...)`
- 输出 summary：
  - 总候选数
  - 实际 archived 数量
  - skipped 数量（包括 DRY_RUN 的情况）
  - 前 50 条样例（便于回看）

**注意：**脚本从不执行 DELETE，只更新 status。

---

## 6. 后续如何避免再次发生

为避免未来再出现类似问题，我们已经做了以下约束：

1. **停用旧导入脚本**
   - `import-servicem8-customers.js` 头部增加了醒目的 LEGACY 注释。
   - package.json 中的脚本改名为 `import:servicem8:legacy`，并在 docs 中标明“不推荐使用、可能产生脏联系人”。
2. **统一正式同步入口**
   - 所有 ServiceM8 → CRM 的定时 / 手动同步，统一走：
     - `apps/crm/services/servicem8-sync.js`
     - `syncCompaniesFromServiceM8` / `syncContactsFromServiceM8` / `syncJobsFromServiceM8` ...
     - 总入口：`syncAllFromServiceM8`（对应 `sync-servicem8-all-history.js`）
3. **严格实体边界**
   - company → 只写 `accounts`；
   - contact/companycontact → 只写 `contacts`；
   - job → 只写 `jobs`，不参与联系人创建；
   - external_links 统一做 company.uuid ↔ account.id 映射，去重优先级明确。
4. **文档更新**
   - `docs/servicem8-auto-sync.md`、`docs/servicem8-full-history-sync.md`、`docs/servicem8-sync-architecture.md` 中都已明确新的正式同步路径和 external_links 用法。
   - 本文 `servicem8-contact-cleanup.md` 记录了问题来源与清理策略，作为未来参考。

---

## 7. 你需要手动确认的部分

1. **确认报告输出是否符合预期**
   - 跑一遍 `report-suspicious-contacts.js`，看样例是否确实是“非真人联系人”。
2. **确认清理策略**
   - 是否接受引入 `status` / `source` 字段做软归档；
   - 或者选择只在 DB 工具里人工删除，代码不增加新字段。
3. **确认旧脚本是否完全不用**
   - 如果以后不会再跑 legacy 导入，可以考虑在未来某个版本中彻底移除该脚本和对应文档。

在你确认以上决策后，可以再单独开一个“清理实现”任务，把 UPDATE / 归档逻辑用脚本固化下来。当前状态下，所有改动都停留在“识别 + 报告 + 防止继续变脏”这一步。

