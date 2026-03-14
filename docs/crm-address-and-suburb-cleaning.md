# CRM Address & Suburb Cleaning

本文档说明：

1. ServiceM8 地址字段来自哪里；
2. CRM 当前如何保存地址相关字段；
3. suburb 补全优先级；
4. 如何从完整地址提取 suburb（extractSuburbFromAddress）；
5. 如何用只读脚本检查缺失 suburb。

---

## 1. ServiceM8 地址字段来源

### 1.1 company.json → accounts

在 `servicem8-sync.js` 中，company → account 的映射函数为：

```js
function companyToAccountFields(c) {
  const uuid = c.uuid || c.UUID;
  if (!uuid) return null;
  const name = (c.name || c.company_name || c.companyName || '').trim() || null;
  const address = (c.address || c.address_1 || c.address_street || c.street || '').trim() || null;
  const suburb = (c.city || c.address_suburb || c.suburb || c.addressSuburb || '').trim() || null;
  const postcode = (c.postcode || c.address_post_code || c.addressPostCode || c.post_code || '').trim() || null;
  return { servicem8_company_uuid: uuid, account_name: name, address_line: address, suburb, postcode };
}
```

可能存在的地址字段（按优先级）：

- `address` / `address_1` / `address_street` / `street` → `accounts.address_line`
- `city` / `address_suburb` / `suburb` / `addressSuburb` → `accounts.suburb`
- `postcode` / `address_post_code` / `addressPostCode` / `post_code` → `accounts.postcode`

受限于具体账号配置，有些字段（例如 `address_suburb`）可能为空，因此现在很多 account 的 `suburb` 仍然是 NULL。

### 1.2 job.json → jobs

`syncJobsFromServiceM8` 中，job → jobs 的地址映射为：

```js
const address_line = (j.address || j.address_street || j.site_address || j.siteAddress || '').trim() || null;
const suburb = (j.city || j.suburb || j.address_suburb || j.addressSuburb || '').trim() || null;
```

字段：

- `address` / `address_street` / `site_address` / `siteAddress` → `jobs.address_line`
- `city` / `suburb` / `address_suburb` / `addressSuburb` → `jobs.suburb`

实际数据中，`jobs.suburb` 通常比 `accounts.suburb` 完整，因此在后续补全中优先使用。

---

## 2. CRM 中当前保存的地址字段

### 2.1 accounts

表结构（节选自 `002_domain_model.sql`）：

```sql
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  address_line TEXT,
  suburb VARCHAR(100),
  postcode VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);
```

当前：

- `address_line`：同步 ServiceM8 company 后，已有部分填充；
- `suburb`：由于 company.json 中 `city/suburb` 为空或未填，**同步后大部分仍为空**；
- `postcode`：同上，部分有值。

### 2.2 jobs

表结构（节选自 `003_servicem8_history.sql`）：

```sql
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  servicem8_job_uuid VARCHAR(36) UNIQUE,
  job_number VARCHAR(100),
  description TEXT,
  address_line TEXT,
  suburb VARCHAR(100),
  status VARCHAR(50),
  job_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(100)
);
```

当前：

- `jobs.address_line` 和 `jobs.suburb` 数据相对完整，可用于补全 accounts。

---

## 3. Suburb 补全优先级

为了尽量不覆盖已有可靠 suburb，同时充分利用现有数据，我们采用如下优先级：

1. **已有 accounts.suburb**：保留，不覆盖。
2. **jobs.suburb**：
   - 若某个 account 的 `suburb` 为空，但其相关 `jobs.suburb` 有值；
   - 则直接使用 `jobs.suburb` 填充 `accounts.suburb`。
3. **address_line 解析**：
   - 若 `accounts.suburb` 仍为空，但 `accounts.address_line` 有完整地址；
   - 则调用 `extractSuburbFromAddress(address_line)` 做轻量解析，成功时补全。
4. **仍无法可靠提取**：保持 `suburb` 为 NULL，留待人工处理或未来改进。

补全逻辑集中在脚本 `apps/crm/scripts/normalize-crm-data.js` 中，通过一系列 UPDATE + Node 侧解析实现。

---

## 4. 从地址提取 suburb：`extractSuburbFromAddress`

文件：`apps/crm/lib/crm/cleaning/extractSuburbFromAddress.js`

设计目标：

- 针对常见的澳洲地址格式，从完整 address_line 中提取 suburb 片段；
- 尽可能保守，提取不到就返回 `null`，不乱写。

### 4.1 解析策略

1. 将 address 转为小写，尝试匹配州缩写：
   - `NSW, VIC, QLD, SA, WA, TAS, NT, ACT`
2. 找到州缩写在字符串中的位置，取其之前的部分作为候选 `beforeState`。
3. 在 `beforeState` 中：
   - 若存在逗号：取最后一个逗号后的片段作为 suburb 候选；
   - 否则：
     - 将 `beforeState` 按空格切分成 tokens；
     - 尝试在 tokens 中找到最后一个街道类型（如 `St/Rd/Street/Road/Ave/...`）的位置；
     - 若找到，则街道类型之后到州之前的 tokens 作为 suburb；
     - 否则，取最后 2–3 个 token 作为 suburb 候选。
4. 过滤掉纯数字（门牌号等），用 `normalizeSuburb` 标准化大小写。
5. 若最终 suburb 为空或只有数字，则返回 `null`。

示例：

- `"12 Smith Street, Mawson Lakes SA 5095"`：
  - 州匹配 `SA`；
  - `beforeState = "12 smith street, mawson lakes"`；
  - 最后逗号后为 `" mawson lakes"` → `normalizeSuburb` → `"Mawson Lakes"`.
- `"5 John Rd Salisbury North SA 5108"`：
  - `beforeState = "5 john rd salisbury north"`；
  - 最后 street type 为 `rd`，之后 tokens 为 `["salisbury","north"]` → `"Salisbury North"`.

### 4.2 故障安全

- 若无法识别州缩写，或 `beforeState` 为空，直接返回 `null`；
- 保证不会对 suburb 做“瞎猜”，宁缺勿错。

---

## 5. 脚本：标准化与补全 suburb

文件：`apps/crm/scripts/normalize-crm-data.js`

职责：

1. 标准化 `contacts.phone` / `contacts.email`；
2. 标准化 `accounts.suburb`（InitCap）；
3. **从 jobs.suburb 填补缺失的 accounts.suburb**；
4. **从 accounts.address_line 中解析 suburb 填补剩余缺失**；
5. 打印数据质量报告。

关键补全 SQL（jobs → accounts）：

```sql
UPDATE accounts a
SET suburb = j.suburb
FROM jobs j
WHERE a.suburb IS NULL
  AND j.account_id = a.id
  AND j.suburb IS NOT NULL;
```

关键 Node 逻辑（address_line → suburb）：

```js
const res = await client.query(
  `SELECT id, address_line
   FROM accounts
   WHERE (suburb IS NULL OR TRIM(suburb) = '')
     AND address_line IS NOT NULL
     AND TRIM(address_line) <> ''`
);
let filled = 0;
for (const row of res.rows) {
  const suburb = extractSuburbFromAddress(row.address_line);
  if (!suburb) continue;
  await client.query(
    `UPDATE accounts SET suburb = $1 WHERE id = $2 AND (suburb IS NULL OR TRIM(suburb) = '')`,
    [suburb, row.id]
  );
  filled++;
}
console.log('Suburbs backfilled from address_line:', filled);
```

---

## 6. 只读检查脚本：report-missing-suburb

文件：`apps/crm/scripts/report-missing-suburb.js`

用途：

- 只读检查当前 `accounts.suburb` 的完整度；
- 输出有 `address_line` 但 `suburb` 仍为空的样本，方便人工判断解析质量。

输出内容包括：

1. accounts 总数、suburb 已填/缺失数量、`address_line` 有值但 `suburb` 为空的数量；
2. 随机（按创建时间排序）选取最多 50 条样例：
   - `id`
   - `name`
   - `address_line`
   - `suburb`
   - `postcode`

执行方式（从 repo 根目录）：

```bash
pnpm report:missing-suburb
```

---

## 7. 适用范围与人工补充

目前的 suburb 提取与补全策略**只依赖于 ServiceM8 已有地址信息**，不调用外部地理编码服务，也不改动 schema：

- 对 “有 jobs.suburb / address_line 的客户” 能显著提高 suburb 完整度；
- 对 “地址不全 / 无州信息 / 格式异常”的记录，仍可能无法解析，需要人工补录。

建议在运行 `normalize-crm-data` 和 `report-missing-suburb` 后：

1. 导出仍然缺失 suburb 且 address_line 非空的记录；
2. 由运营/客服在 CRM 或 source-of-truth（ServiceM8、Neon 后台）中逐步补完；
3. 定期复跑这两个脚本，使新进数据也保持较好的地址完整度。

