# Legacy Data Cleanup Script

本文档说明脚本 `apps/crm/scripts/cleanup-legacy-noise.js` 的行为、删除规则与使用方式。该脚本用于一次性清理历史上由 **legacy ServiceM8 导入逻辑** 产生的明显垃圾数据。

> 重要：脚本默认是 **DRY_RUN**，只有显式设置 `CONFIRM_DELETE=true` 时才会真正执行 DELETE。

---

## 1. 清理对象与范围

仅针对以下三类数据：

1. **明显垃圾 contacts**
2. **不再有任何联系人/工单、且名称看起来像垃圾的 accounts**
3. **orphan external_links**：
   - `system = 'servicem8'`
   - `entity_type = 'account'` 且 `entity_id` 不存在于 `accounts`
   - `entity_type = 'contact'` 且 `entity_id` 不存在于 `contacts`

不会删除：

- `leads`
- `opportunities`
- `jobs`
- `invoices`
- `job_materials`

---

## 2. 垃圾 contacts 判定规则

在脚本中，垃圾联系人 (delete candidates) 满足：

1. 电话为空：
   ```sql
   c.phone IS NULL OR TRIM(c.phone) = ''
   ```
2. 邮箱为空：
   ```sql
   c.email IS NULL OR TRIM(c.email) = ''
   ```
3. 名字命中以下任一关键字（大小写不敏感）：
   ```sql
   c.name ILIKE ANY (ARRAY[
     '%Job%',
     '%Card%',
     '%PAYPAL%',
     '%Transfer%',
     '%Help%',
     '%Test%',
     '%Payment%'
   ])
   ```
4. 可选增强：排除明显不是 legacy 的来源：
   ```sql
   c.created_by IS NULL OR c.created_by NOT IN ('landing-page','crm-ui')
   ```

综合起来的 SQL 条件（用于 candidate 查询）：

```sql
SELECT c.id, c.name, c.phone, c.email, c.created_by
FROM contacts c
LEFT JOIN accounts a ON c.account_id = a.id
WHERE (c.phone IS NULL OR TRIM(c.phone) = '')
  AND (c.email IS NULL OR TRIM(c.email) = '')
  AND c.name ILIKE ANY($1::text[])
  AND (c.created_by IS NULL OR c.created_by NOT IN ('landing-page','crm-ui'));
```

这些联系人大多是：

- `Help Guide Job`
- `Card Payment`
- `PAYPAL ...`
- `Transfer to ...`
- `Test Job`

且没有任何联系方式，不具备业务价值。

---

## 3. 垃圾 accounts 判定规则

在删除垃圾 contacts 之后，脚本会查找满足以下条件的 accounts：

1. **没有任何联系人**：
   ```sql
   LEFT JOIN contacts c ON c.account_id = a.id
   WHERE c.id IS NULL
   ```
2. **没有任何工单 (jobs)**：
   ```sql
   LEFT JOIN jobs j ON j.account_id = a.id
   AND j.id IS NULL
   ```
3. 名称命中垃圾关键字：
   ```sql
   a.name ILIKE ANY (ARRAY[
     '%Job%',
     '%Card%',
     '%PAYPAL%',
     '%Transfer%',
     '%Help%',
     '%Test%',
     '%Payment%'
   ])
   ```
4. 可选增强：排除 landing-page / crm-ui 创建的账户：
   ```sql
   a.created_by IS NULL OR a.created_by NOT IN ('landing-page','crm-ui')
   ```

综合 SQL：

```sql
SELECT a.id, a.name, a.suburb, a.address_line, a.created_by
FROM accounts a
LEFT JOIN contacts c ON c.account_id = a.id
LEFT JOIN jobs j ON j.account_id = a.id
WHERE c.id IS NULL
  AND j.id IS NULL
  AND a.name ILIKE ANY($1::text[])
  AND (a.created_by IS NULL OR a.created_by NOT IN ('landing-page','crm-ui'));
```

这些 account 没有联系人、没有工单，且名字本身看起来就是测试/系统数据，删除风险较低。

---

## 4. orphan external_links 判定规则

脚本只处理 `system='servicem8'` 的 external_links，并找出：

```sql
SELECT el.id, el.system, el.external_entity_type, el.external_id, el.entity_type, el.entity_id
FROM external_links el
LEFT JOIN accounts a ON (el.entity_type = 'account' AND el.entity_id = a.id)
LEFT JOIN contacts c ON (el.entity_type = 'contact' AND el.entity_id = c.id)
WHERE el.system = 'servicem8'
  AND ((el.entity_type = 'account' AND a.id IS NULL)
    OR (el.entity_type = 'contact' AND c.id IS NULL));
```

即：链接指向的 account/contact 已不存在时，这些映射被视为孤儿，可以安全删除。

---

## 5. 执行模式

脚本支持两种执行模式，由环境变量控制：

### 5.1 预览模式（默认）— DRY_RUN

- 当 **CONFIRM_DELETE 不为 true** 时，无论 DRY_RUN 是否设置，都会视为“只预览”模式：
  - 不执行任何 DELETE；
  - 输出：
    - `contacts_delete_candidates`
    - `accounts_delete_candidates`
    - `external_links_delete_candidates`
  - 并打印每类前 20 条样例（id/name 等），供人工确认。

推荐命令：

```bash
DRY_RUN=true pnpm cleanup:legacy-noise
```

### 5.2 真正删除模式 — CONFIRM_DELETE=true

- 只有当：

```bash
CONFIRM_DELETE=true
```

时，脚本才会执行 DELETE 语句。

执行顺序：

1. 删除垃圾 `contacts`：
   ```sql
   DELETE FROM contacts WHERE id = ANY($1::uuid[]);
   ```
2. 删除垃圾 `accounts`：
   ```sql
   DELETE FROM accounts WHERE id = ANY($1::uuid[]);
   ```
3. 删除 orphan `external_links`：
   ```sql
   DELETE FROM external_links WHERE id = ANY($1::uuid[]);
   ```

> 注意：删除 contacts/accounts 时，我们已经确保不删除任何 leads/opportunities/jobs/invoices/job_materials。

推荐命令：

```bash
CONFIRM_DELETE=true pnpm cleanup:legacy-noise
```

---

## 6. Summary 输出

脚本结束时会打印：

- `contacts_delete_candidates`
- `accounts_delete_candidates`
- `external_links_delete_candidates`
- `contacts_deleted`
- `accounts_deleted`
- `external_links_deleted`

在 DRY_RUN 模式下，`*_deleted` 均为 0。

---

## 7. 使用方式与建议

### 7.1 推荐使用步骤

1. **先预览**：
   ```bash
   DRY_RUN=true pnpm cleanup:legacy-noise
   ```
   - 检查输出的候选数量与样例（前 20 行）；
   - 确认这些确实是你希望删除的垃圾数据。

2. **备份数据库或导出候选列表**：
   - 可将 candidates 查询 SQL 单独在 `psql` 里跑一遍，用 `\copy` 导出到 CSV 备份。

3. **确认后再执行真正删除**：
   ```bash
   CONFIRM_DELETE=true pnpm cleanup:legacy-noise
   ```

### 7.2 风险提示

- 虽然规则已经尽量收紧（phone/email 为空 + 垃圾关键字 + 排除 landing-page/crm-ui），仍建议：
  - 在生产库执行前做一次完整备份；
  - 或先在只读副本/开发环境验证。
- 脚本不会删除 leads/opportunities/jobs/invoices/job_materials，但如果你之后手动运行其它清理操作，请注意外键与引用关系。

---

## 8. 相关脚本与文档

- 脚本：
  - `apps/crm/scripts/cleanup-legacy-noise.js`
- package.json 脚本：
  - 在 `apps/crm/package.json` 中：
    ```json
    "cleanup:legacy-noise": "node scripts/cleanup-legacy-noise.js"
    ```
  - 在根 `package.json` 中：
    ```json
    "cleanup:legacy-noise": "pnpm --filter @bht/crm run cleanup:legacy-noise"
    ```
- 相关文档：
  - `docs/contact-hard-delete-plan.md`（手动 SQL 清理方案）
  - `docs/servicem8-contact-cleanup.md`（软归档与脏联系人背景）

本脚本是对上述手动方案的自动化实现，聚焦在 legacy 导入产生的明显垃圾数据，帮助你更加安全、可控地清理历史噪音。 

