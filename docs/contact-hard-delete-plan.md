# Legacy ServiceM8 垃圾联系人硬删除方案（计划与 SQL 草案）

本方案用于**一次性清理**由 legacy `import-servicem8-customers.js` 产生的、极大概率为垃圾的联系人与对应账户，同时尽量避免误删真实联系人或破坏 Leads / 机会等流程。

> 本文只提供 **SQL 方案与执行顺序**，不在代码中自动执行任何删除。实际执行前，请务必根据你在线上数据的实际情况做抽样核查与备份。

---

## 一、判定范围与安全原则

### 1.1 判定为“明显垃圾联系人的”规则

仅针对满足以下**同时条件**的联系人（极度保守）：

1. `phone` 为空或空字符串；
2. `email` 为空或空字符串；
3. `name` 中包含以下任一模式（不区分大小写）：
   - `%Job%`
   - `%Card%`
   - `%PAYPAL%`
   - `%Transfer%`
   - `%Help%`

即 SQL 条件：

```sql
(c.phone IS NULL OR TRIM(c.phone) = '')
AND (c.email IS NULL OR TRIM(c.email) = '')
AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
```

这些记录几乎都来自 legacy 导入脚本，将 `company.name` 当成了联系人名，例如：

- `Help Guide Job`
- `Card xx1246`
- `Transfer to other ...`
- `PAYPAL *XXXX`

### 1.2 限制：不删除真实联系人 / 不动 Leads 流程

为避免影响已在使用的 CRM 流程，我们在删除前增加**引用检查**：

仅删除满足上述垃圾规则、且 **未被以下任何表引用的联系人**：

- `leads.contact_id`
- `opportunities.contact_id`
- `activities.contact_id`
- （按需再加：`tasks.assigned_to_contact_id` 等，如后续扩展）

同理，删除 accounts 时仅删除：

- 没有剩余 contacts（`contacts` 中已不存在该 account_id）；
- 没有 leads、opportunities、activities 等引用；
- 且自身也疑似垃圾（可选附加条件，如 address/suburb 为空，或 name 命中同样的模式）。

external_links 只删除 **指向已被删除账户的记录**。

---

## 二、执行顺序总览

推荐执行顺序：

1. **预检查联系人**：确认将要删除的候选联系人列表与数量；
2. **预检查账户**：确认与这些联系人关联的候选垃圾账户；
3. **删除联系人（安全子集）**；
4. **删除无引用的垃圾账户**；
5. **删除孤儿 external_links（entity_id 不再存在的 account）**；
6. **重新跑 ServiceM8 正式同步（非本方案 SQL 范围内，仅流程建议）**；
7. **删除后验证**：确认 counts 与引用关系正确。

每个步骤都包含：**预检查 SQL → 删除 SQL → 验证 SQL**。

---

## 三、预检查联系人（只读）

### 3.1 预检查：候选垃圾联系人总览

```sql
-- 仅预览：满足垃圾规则的联系人数量
SELECT COUNT(*) AS suspicious_contacts
FROM contacts c
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%']);
```

### 3.2 预检查：有引用的联系人（安全保护）

```sql
-- 找出同时满足“垃圾规则”且被 leads/opportunities/activities 引用的联系人
SELECT DISTINCT c.id,
       c.name,
       c.phone,
       c.email,
       c.status,
       c.created_at
FROM contacts c
LEFT JOIN leads l ON l.contact_id = c.id
LEFT JOIN opportunities o ON o.contact_id = c.id
LEFT JOIN activities act ON act.contact_id = c.id
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
  AND (l.id IS NOT NULL OR o.id IS NOT NULL OR act.id IS NOT NULL)
ORDER BY c.created_at DESC;
```

> 建议：如果这里返回的行数 **> 0**，逐条人工检查，确认是否确实可以删除。若不放心，可以先将这部分排除在自动删除之外。

### 3.3 预检查：将要删除的联系人样例

```sql
-- 预览：满足垃圾规则，且未被 leads/opportunities/activities 引用的联系人（即计划删除的子集）
SELECT c.id,
       c.name,
       c.phone,
       c.email,
       c.status,
       c.created_at
FROM contacts c
LEFT JOIN leads l ON l.contact_id = c.id
LEFT JOIN opportunities o ON o.contact_id = c.id
LEFT JOIN activities act ON act.contact_id = c.id
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
  AND (l.id IS NULL AND o.id IS NULL AND act.id IS NULL)
ORDER BY c.created_at DESC
LIMIT 100;
```

---

## 四、删除联系人（contacts）

### 4.1 删除 SQL（contacts）

> **务必先做备份**，并先跑上面的预检查确认数量与样本。

```sql
-- 1) 把要删除的联系人 ID 放入临时表（可选，便于后续验证）
CREATE TEMP TABLE tmp_deleted_contacts AS
SELECT c.id
FROM contacts c
LEFT JOIN leads l ON l.contact_id = c.id
LEFT JOIN opportunities o ON o.contact_id = c.id
LEFT JOIN activities act ON act.contact_id = c.id
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
  AND (l.id IS NULL AND o.id IS NULL AND act.id IS NULL);

-- 2) 实际删除联系人
DELETE FROM contacts
WHERE id IN (SELECT id FROM tmp_deleted_contacts);
```

> 注意：  
> - 这里显式排除了被 leads / opportunities / activities 引用的联系人；  
> - 如你认为还需要排除其它引用（例如 `tasks.assigned_to_contact_id`），可在临时表查询中增加更多 LEFT JOIN 条件。

### 4.2 删除后验证（contacts）

```sql
-- 验证：tmp_deleted_contacts 中的联系人是否都已不存在
SELECT COUNT(*) AS still_exists
FROM contacts
WHERE id IN (SELECT id FROM tmp_deleted_contacts);

-- 再次检查垃圾规则下是否仍有联系人存在（理论上应减少很多）
SELECT COUNT(*) AS suspicious_contacts_after
FROM contacts c
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%']);
```

---

## 五、删除无关联的垃圾 accounts

删除账户时，必须确保：

1. 该 account **不再有任何 contacts**（contacts.account_id 中不存在）；
2. 不被 leads / opportunities / activities / assets / jobs / invoices 等引用；
3. 最好再叠加“垃圾特征”（例如 suburb/address 为空、name 命中模式），以降低误删风险。

### 5.1 预检查：候选垃圾账户

```sql
-- 预览：没有联系人、没有 leads/opportunities/activities，并且看起来像垃圾的 accounts
SELECT a.id,
       a.name,
       a.suburb,
       a.address_line,
       a.status,
       a.created_at
FROM accounts a
LEFT JOIN contacts c ON c.account_id = a.id
LEFT JOIN leads l ON l.account_id = a.id
LEFT JOIN opportunities o ON o.account_id = a.id
LEFT JOIN activities act ON act.account_id = a.id
LEFT JOIN jobs j ON j.account_id = a.id
LEFT JOIN invoices inv ON inv.account_id = a.id
WHERE c.id IS NULL
  AND l.id IS NULL
  AND o.id IS NULL
  AND act.id IS NULL
  AND j.id IS NULL
  AND inv.id IS NULL
  AND (COALESCE(TRIM(a.suburb), '') = '' AND COALESCE(TRIM(a.address_line), '') = '')
  AND a.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%'])
ORDER BY a.created_at DESC
LIMIT 100;
```

### 5.2 删除 SQL（accounts）

```sql
-- 1) 临时表记录将删除的 accounts，便于审计和验证
CREATE TEMP TABLE tmp_deleted_accounts AS
SELECT a.id
FROM accounts a
LEFT JOIN contacts c ON c.account_id = a.id
LEFT JOIN leads l ON l.account_id = a.id
LEFT JOIN opportunities o ON o.account_id = a.id
LEFT JOIN activities act ON act.account_id = a.id
LEFT JOIN jobs j ON j.account_id = a.id
LEFT JOIN invoices inv ON inv.account_id = a.id
WHERE c.id IS NULL
  AND l.id IS NULL
  AND o.id IS NULL
  AND act.id IS NULL
  AND j.id IS NULL
  AND inv.id IS NULL
  AND (COALESCE(TRIM(a.suburb), '') = '' AND COALESCE(TRIM(a.address_line), '') = '')
  AND a.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%']);

-- 2) 删除 accounts
DELETE FROM accounts
WHERE id IN (SELECT id FROM tmp_deleted_accounts);
```

### 5.3 删除后验证（accounts）

```sql
-- 验证：tmp_deleted_accounts 是否已全部不存在
SELECT COUNT(*) AS still_exists
FROM accounts
WHERE id IN (SELECT id FROM tmp_deleted_accounts);
```

---

## 六、删除 orphan external_links

当 contacts / accounts 被删除后，可能会留下指向不存在 entity_id 的 external_links。  
我们只删除 **entity_type='account' 且 entity_id 不在 accounts 中** 的记录。

### 6.1 预检查 orphan external_links

```sql
SELECT el.id,
       el.system,
       el.external_entity_type,
       el.external_id,
       el.entity_type,
       el.entity_id
FROM external_links el
LEFT JOIN accounts a ON (el.entity_type = 'account' AND el.entity_id = a.id)
WHERE el.system = 'servicem8'
  AND el.external_entity_type = 'company'
  AND el.entity_type = 'account'
  AND a.id IS NULL
LIMIT 100;
```

### 6.2 删除 SQL（external_links orphan）

```sql
DELETE FROM external_links el
USING external_links el2
LEFT JOIN accounts a ON (el2.entity_type = 'account' AND el2.entity_id = a.id)
WHERE el.id = el2.id
  AND el2.system = 'servicem8'
  AND el2.external_entity_type = 'company'
  AND el2.entity_type = 'account'
  AND a.id IS NULL;
```

> 若你不喜欢 `USING` 写法，也可以先 `CREATE TEMP TABLE tmp_deleted_links AS ...` 再 `DELETE FROM external_links WHERE id IN (...)`，思路相同。

### 6.3 删除后验证（external_links）

```sql
SELECT COUNT(*) AS orphan_links_after
FROM external_links el
LEFT JOIN accounts a ON (el.entity_type = 'account' AND el.entity_id = a.id)
WHERE el.system = 'servicem8'
  AND el.external_entity_type = 'company'
  AND el.entity_type = 'account'
  AND a.id IS NULL;
```

---

## 七、删除后重新同步 & 验证

### 7.1 重新跑正式 ServiceM8 同步（建议）

完成上述清理后，可以考虑重新跑一次正式的 ServiceM8 同步（非 SQL，而是已有脚本）：

```bash
# 全量或增量，根据你当前策略
pnpm sync:servicem8:all
# 或仅联系人
pnpm sync:servicem8:contacts
```

由于正式同步是幂等的（按 external_links 与 servicem8 uuid 去重），且不会再使用 legacy company→contact 导入逻辑，所以不会重新产生同样的垃圾联系人。

### 7.2 删除后验证（联系人/账户数量与示例）

可再跑一次类似的检查：

```sql
-- 垃圾规则下仍然存在的联系人数量（理论上应为 0 或非常少）
SELECT COUNT(*) AS suspicious_contacts_after
FROM contacts c
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY (ARRAY['%Job%', '%Card%', '%PAYPAL%', '%Transfer%', '%Help%']);
```

以及抽查若干正常联系人（有 phone/email、name 看起来是人名）是否仍然存在，以确认没有误删。

---

## 八、重要提醒

- **务必先备份数据库**（或在只读副本上演练）再在生产库执行 DELETE。
- 如果对任何规则不确定，宁可先只跑 SELECT / 创建临时表，不要贸然执行 DELETE。
- 如果发现某些 name 虽然命中 `%Job%` 等模式，但确实是有用记录，可以在删除前明确排除这些特定 ID。
- 执行顺序上，建议严格遵循：
  1. 备份；
  2. 预检查（contacts、accounts、external_links）；
  3. 删除 contacts（安全子集）；
  4. 删除无引用 accounts；
  5. 删除 orphan external_links；
  6. 再跑一次正式同步与验证。

这样可以最大限度地清掉 legacy 导入的明显垃圾数据，同时不破坏现有 Leads / Contacts / Jobs 流程。 

