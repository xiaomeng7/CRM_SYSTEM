## CRM Customer Segmentation（客户分层）

本方案在 **不修改现有表结构、不改 UI、不改业务逻辑** 的前提下，通过 SQL 视图和报告脚本，实现基础的客户分层与老客户激活名单。

核心组成：

- 视图：`crm_customer_summary`、`crm_reactivation_candidates`（contact-level）
- 视图：`crm_account_summary`、`crm_account_reactivation_candidates`（account-level 对照版）
- 视图：`crm_account_reactivation_contacts`（account-level 激活名单 + 最佳联系人，可直接用于发短信）
- 视图：`crm_reactivation_candidates_v2`（带排除条件的 contact-level 名单）
- 报告脚本：`report-customer-segmentation.js`、`report-segmentation-comparison.js`
- 回填脚本：`backfill-contact-phone-from-servicem8.js`

---

### 1. crm_customer_summary 视图

**作用**：对每个 `contact` 聚合 jobs / invoices / accounts 信息，形成一行“客户画像”。

主要字段（部分）：

- **基础信息**
  - `contact_id`
  - `contact_name`
  - `phone`
  - `email`
  - `account_id`
  - `account_name`
  - `suburb`
  - `postcode`

- **行为数据**
  - `jobs_count`：该联系人的工单数量（`COUNT(DISTINCT jobs.id)`）
  - `total_revenue`：关联工单的发票总金额（`SUM(invoices.amount)`，无记录时为 0）
  - `last_job_date`：最近一次工单完成时间
    - 计算方式：`MAX(COALESCE(jobs.completed_at, jobs.created_at))`

- **时间维度**
  - `months_since_last_job`：
    - 计算方式：
      - `DATE_PART('month', AGE(NOW(), last_job_date))`
    - 若 `last_job_date` 为 `NULL`，则该字段也为 `NULL`。

- **地址质量**
  - `address_quality`：
    - 规则：
      - `address_line IS NOT NULL AND suburb IS NOT NULL` → `'full'`
      - `suburb IS NOT NULL` → `'suburb_only'`
      - 其他 → `'none'`
    - 用于区分“有完整地址 / 只有区域 / 没有地址”三种情况。

- **客户类型（customer_type）**
  - 规则：
    - `jobs_count > 0` → `'real_customer'`
    - `jobs_count = 0 AND phone IS NOT NULL` → `'lead_only'`
    - 其他 → `'unknown'`
  - 含义：
    - `real_customer`：真正做过项目、有实际工单记录的客户。
    - `lead_only`：目前只在 CRM 中留资、有电话，但没有任何 job。
    - `unknown`：既没有 job，又没有电话，多半是历史导入或不完整记录。

- **客户价值（customer_value）**
  - 规则（基于累计收入 `total_revenue`）：
    - `total_revenue >= 5000` → `'high'`
    - `total_revenue >= 1000` → `'medium'`
    - `total_revenue > 0` → `'low'`
    - 否则 → `'none'`
  - 用于快速判断客户的历史贡献度。

- **优先级评分（priority_score）**

  简单打分模型：

  \[
  \text{priority\_score} =
  0
  + [\text{jobs\_count} > 0 ? 50 : 0]
  + [\text{jobs\_count} \ge 2 ? 20 : 0]
  + [\text{total\_revenue} \ge 2000 ? 20 : 0]
  + [\text{address\_quality} = 'full' ? 10 : 0]
  + [\text{months\_since\_last\_job} \ge 12 ? 30 : 0]
  + [\text{months\_since\_last\_job} \ge 6 ? 10 : 0]
  - [\text{address\_quality} = 'none' ? 30 : 0]
  \]

  含义：

  - 有真实项目（job）加大分；
  - 项目数量多、收入高再加分；
  - 地址信息完整加少量分；
  - 超过 6 / 12 个月未再合作的老客户加分（更适合作为激活对象）；
  - 完全没有地址信息的记录减分。

---

### 2. customer_type、customer_value、priority_score 的解释

#### 2.1 customer_type

- **real_customer**
  - 有至少一条 job 记录；
  - 说明是真正合作过的老客户，比纯线索价值更高。
- **lead_only**
  - 暂无任何 job，但有电话；
  - 适合作为线索跟进，而不是“老客户激活”。
- **unknown**
  - 无 job 且无电话，多为历史残留或不完整记录；
  - 对经营价值有限，可以后续清洗或补全。

> 在老客户激活场景下，**优先关注 `real_customer`**，因为他们对品牌有实际体验，转化成本更低。

#### 2.2 customer_value

- **high**
  - 累计收入 `total_revenue >= 5000`；
  - 这部分是大客户或高价值客户。
- **medium**
  - `1000 <= total_revenue < 5000`；
  - 有一定历史合作和付费意愿。
- **low**
  - `0 < total_revenue < 1000`；
  - 只做过小单或零星合作。
- **none**
  - 从未产生过收入；
  - 可能是尚未成交的线索或数据噪音。

#### 2.3 priority_score

- 评分逻辑是一个 **简单可解释的“启发式打分”**，不是黑箱算法：
  - 有项目 → 基础高分；
  - 多项目 / 高收入 → 额外加分；
  - 太久未服务（>6 / >12 个月） → 视为“激活窗口期”；
  - 没有地址信息 → 说明数据质量差，减分。
- 这使得运营同学可以理解：
  - 为什么某个客户排名靠前；
  - 调整阈值或权重时也比较直观。

---

### 3. crm_reactivation_candidates 视图（老客户激活名单）

**视图名**：`crm_reactivation_candidates`

**筛选规则**：

- `customer_type = 'real_customer'`  
  → 必须是真正做过项目的客户；
- `phone IS NOT NULL`  
  → 可以通过短信/电话触达；
- `months_since_last_job >= 6`  
  → 最近 6 个月没有合作，进入“激活窗口”；
- 按 `priority_score DESC` 排序；
- `LIMIT 200`，避免名单过大不易操作。

**输出字段**：

- `contact_id`
- `contact_name`
- `phone`
- `account_name`
- `suburb`
- `jobs_count`
- `total_revenue`
- `last_job_date`
- `months_since_last_job`
- `priority_score`

> 这张表就是“老客户激活名单”的直接数据源，可以用于 SMS campaign、电话回访、邮件唤醒等。

---

### 4. 为什么 real_customer 优先、last_job > 6 个月是激活窗口

#### 4.1 real_customer 优先

- 对于老客户：
  - 已经体验过你的服务，信任基础更好；
  - 再次成交的转化成本更低；
  - 更适合作为 upsell / cross‑sell 的对象。
- 对比 lead_only：
  - 只留过电话、从未成交；
  - 更适合放在一般线索跟进流程（Leads pipeline），而不是“老客户激活”。

因此，在 `crm_reactivation_candidates` 中只选 `customer_type = 'real_customer'`。

#### 4.2 last_job > 6 个月是激活窗口

- 如果最近 1-3 个月刚做完项目：
  - 客户刚花过钱，短期内再卖东西，体验会偏“骚扰”；
- 当 `months_since_last_job >= 6`：
  - 时间刚好过去一段，客户生活中更有可能出现新的需求；
  - 例如：扩展充电桩、增加照明、增设电源点等；
  - 从客户体验角度也更容易被理解为“正常回访”，而非高频推销。

所以：

- `>= 6` 个月作为进入激活名单的门槛；
- `>= 12` 个月额外加分：说明很久没接触，更值得重点唤醒。

---

### 5. 报告脚本：report-customer-segmentation.js

文件：`apps/crm/scripts/report-customer-segmentation.js`

用途：在命令行快速查看当前客户分布与激活名单概况。

输出内容：

1. **按 customer_type 统计**：

   - Total contacts
   - Real customers
   - Lead only
   - Unknown

2. **按 customer_value 统计**：

   - High value
   - Medium value
   - Low value
   - None

3. **Top 20 reactivation candidates**：

   - `contact_name`
   - `phone`
   - `account_name`
   - `suburb`
   - `jobs_count`
   - `total_revenue`
   - `last_job_date`
   - `months_since_last_job`
   - `priority_score`

> 运行方式示例（需先确保数据库已执行 005 视图迁移）：
>
> ```bash
> node apps/crm/scripts/report-customer-segmentation.js
> ```

---

### 6. 如何使用这些视图做 SMS campaign（推荐流程）

**步骤建议**：

1. 在数据库中查询 `crm_reactivation_candidates`：

   ```sql
   SELECT *
   FROM crm_reactivation_candidates;
   ```

2. 根据需要导出为 CSV 或用 BI 工具连接（含 `phone` 字段）。

3. 在 CRM 中：
   - 先使用 `report-customer-segmentation.js` 看整体分布；
   - 再在运营层面决定：
     - 是否分批（按 `priority_score`、`customer_value` 分段）；
     - 是否限制每天触达数量。

4. 通过现有的 reactivation SMS 功能（或其他短信通道）对这批名单做 campaign：
   - 可以优先选择：
     - `customer_value = 'high'` 或 `'medium'`；
     - `months_since_last_job` 较大的老客户。

5. 收集回复：
   - 已有 Twilio 短信闭环（见 `docs/twilio-reply-loop.md`）；
   - 所有有效回复会自动创建 follow‑up tasks，方便销售跟进。

---

### 7. Account-level Segmentation（账户级对照版）

#### 7.1 为什么要做 account-level segmentation

- **Contact-level 局限**：`crm_customer_summary` 按 `jobs.contact_id` 聚合。若 job 只挂 `account_id`、未挂 `contact_id`，则对应 contact 会显示 `jobs_count=0`，可能被误判为 `lead_only` 或 `unknown`。
- **Account-level 优势**：按 `jobs.account_id` 聚合，能覆盖所有挂在该 account 下的 jobs，适合作为“老客户激活总名单”的对照版。
- **用途**：用 account 名单做总量参考；用 contact 名单做实际发短信（因为短信需要具体 contact 的 phone）。

#### 7.2 crm_account_summary 视图

按 `account` 聚合，字段包括：

- `account_id`, `account_name`, `suburb`, `postcode`, `address_line`
- `contacts_count`、`contact_with_phone_count`、`contact_with_email_count`
- `jobs_count`、`total_revenue`、`last_job_date`、`months_since_last_job`
- `address_quality`、`customer_type`、`customer_value`、`priority_score`

`customer_type` 规则：`jobs_count > 0` → `real_customer`；`jobs_count = 0` 且 `contact_with_phone_count > 0` → `lead_only`；否则 `unknown`。

#### 7.3 crm_account_reactivation_candidates 视图

筛选：`customer_type = 'real_customer'`、`contact_with_phone_count > 0`、`months_since_last_job >= 6`，按 `priority_score DESC` 排序，`LIMIT 200`。

#### 7.4 crm_account_reactivation_contacts 视图

在 account-level 基础上，为每个 account 选出 **一个最佳联系人**（有 phone 的 contact），输出可直接用于 SMS campaign 的名单：

- 筛选条件与 `crm_account_reactivation_candidates` 一致；
- 每个 account 只输出一行，contact 选择规则：`ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY phone IS NOT NULL DESC, created_at DESC)`，取 `rn = 1`；
- 输出字段：`account_id`, `account_name`, `suburb`, `contact_id`, `contact_name`, `phone`, `jobs_count`, `last_job_date`, `months_since_last_job`, `priority_score`。

---

### 8. ServiceM8 电话字段与 contacts.phone

**为何 CRM 统一使用 `contacts.phone`**：  
CRM 只保留一个联系电话字段，便于匹配、去重和发短信；ServiceM8 的 mobile / phone 都会写入此字段。

**ServiceM8 同步优先级**：`mobile` → `phone`  
- 若 `mobile` 存在，优先使用；否则使用 `phone`；两者皆无则为 `null`。
- 同步时会调用 `normalizePhone()` 清洗，再写入 `contacts.phone`。

**老客户激活名单依赖**：  
- account-level segmentation 识别有工单的老客户；  
- 同时需要 `contact.phone` 非空才能发短信。  
- 使用 `crm_account_reactivation_contacts` 时，已保证每个 account 输出一个带 phone 的联系人。

---

### 9. crm_reactivation_candidates_v2（带排除的名单）

在 v1 基础上增加排除条件，使名单更适合实际发短信：

| 排除条件 | 逻辑 | 说明 |
|----------|------|------|
| 最近 30 天已联系 | `activities` 中 `activity_type IN ('sms','inbound_sms','inbound_sms_unmatched','outbound_sms','call')` 且 `occurred_at >= NOW() - 30 days` | 避免对刚联系过的客户重复发短信 |
| 最近 90 天刚做过 job | 已隐含：v1 要求 `months_since_last_job >= 6` | 不额外排除，原逻辑已覆盖 |
| 空 phone | `phone IS NULL OR TRIM(phone) = ''` | 排除无效号码 |
| do_not_contact | `contacts.status = 'do_not_contact'` | 若 schema 中有此 status 则排除；当前多为 0 |

**activity_type 近似判断**：当前 `activities` 中实际使用的值主要为 `sms`、`inbound_sms`、`inbound_sms_unmatched`。v2 同时匹配 `outbound_sms`、`call` 以兼容未来扩展。

**输出字段**：在 v1 基础上增加 `last_contacted_at`、`contacted_recently_flag`（v2 排除近期联系，故输出中该标记多为 false）。

**暂未实现**：`contacts` 暂无正式 `do_not_contact` 字段；若需严格排除，需后续增加或使用 tags/notes 扩展。

---

### 10. 当前 segmentation 潜在问题及验证

运行 `report-segmentation-comparison.js` 可获取量化验证结果。问题与解读如下：

| 问题 | 验证方式 | 如何解读 |
|------|----------|----------|
| **A. contact-level jobs 低估** | `jobs.contact_id` 为空且 `account_id` 不为空的数量；contact 为 lead_only/unknown 但其 account 有 jobs 的数量 | 若比例高，说明 contact-level 显著漏判真实客户，account-level 更贴近真实 |
| **B. total_revenue 偏低** | invoices 总数；contacts/accounts 中 `total_revenue > 0` 的数量；high/medium/low/none 分布 | 若 invoices 很少或 none 占比极高，则 revenue 用于客户价值判断时参考性有限 |
| **C. 近期已联系污染** | v1 中在最近 30 天有 activity 的 contact 数量及占比 | 若比例高，说明 v2 排除近期联系非常必要 |
| **D. phone 可用性** | v1 中 phone 非空、trim 后非空的比例 | 若大量为空，需优先补全或清洗 phone 数据 |

---

### 11. total_revenue 当前是否可用

- **数据来源**：`invoices.amount`，通过 `jobs` 关联到 contact/account。
- **参考性**：若 `report-segmentation-comparison` 显示 `invoices_total` 较少，或 `contacts_with_revenue > 0` 占比很低，则 `customer_value` 和 `priority_score` 中与 revenue 相关的部分参考性有限。
- **建议**：可继续使用 `jobs_count`、`months_since_last_job`、`address_quality` 做优先级排序；revenue 可作为辅助指标，待发票数据更完整后再加强权重。

---

### 12. 现阶段推荐用哪张 view 做第一波 SMS campaign

| 场景 | 推荐 view | 理由 |
|------|-----------|------|
| **尽量降低“骚扰感”** | `crm_reactivation_candidates_v2` | 排除 30 天内已联系、空 phone、do_not_contact |
| **想覆盖更多老客户、接受一定重复** | `crm_reactivation_candidates`（v1） | 名单更全，适合做总量摸底 |
| **只做总量分析、不做实际发信** | `crm_account_reactivation_candidates` | 按 account 统计，可对比 contact-level 是否漏判 |
| **有 jobs 但 contact-level 为空时** | `crm_account_reactivation_contacts` | account-level + 最佳联系人，可直接发短信 |

**综合建议**：在 contact-level real_customer 为 0 的情况下，优先使用 `crm_account_reactivation_contacts` 作为老客户激活名单。先执行 `backfill-contact-phone-from-servicem8.js` 补全 phone，再跑 `report-segmentation-comparison` 查看可联系客户数量。

---

### 13. 对照报告脚本与回填脚本

**report-segmentation-comparison.js**：

文件：`apps/crm/scripts/report-segmentation-comparison.js`

运行前需执行：`node scripts/run-segmentation-migration.js`（应用 005、006 视图）。

输出内容：

1. Contact-level / Account-level 概览（total、real_customer、lead_only、unknown；high/medium/low/none）
2. jobs 数据：`contact_id` 为空、`account_id` 非空的数量；可能被 contact-level 漏判的客户数
3. Invoices / total_revenue 统计
4. v1 vs v2 数量；因“最近联系”、“空 phone”、“do_not_contact”被排除的数量
5. Phone 数据质量（contacts/accounts with phone）
6. crm_account_reactivation_contacts 数量与 Top 20 样本
7. Top 10 contact-level 与 account-level 激活候选样本

**backfill-contact-phone-from-servicem8.js**：  
从 ServiceM8 回填 `contacts.phone`（仅当 CRM 为空且 ServiceM8 有 mobile/phone 时）。先 `DRY_RUN=true` 预览，确认无误后正式执行。

```bash
DRY_RUN=true pnpm backfill:contact-phone
pnpm backfill:contact-phone
```

---

### 14. 限制与扩展方向

当前实现 **刻意保持简单**：

- 不新增表结构；
- 不改 API / UI；
- 不做复杂机器学习，只用可解释的规则。

未来可以扩展的方向包括：

- 更精细的分层，例如：
  - 结合 job 类型 / service 类型（upgrade / maintenance / EV / solar 等）；
  - 引入最近 12 个月的消费频次、客单价等。
- 将 `crm_reactivation_candidates` 直接接到内部 UI（例如一个“老客户激活”列表页）。
- 在短信模板中按 `customer_value` 或 `months_since_last_job` 细分文案。

当前版本的目标是：**在不扰动现有系统的前提下，提供一个可用、可解释、可迭代的客户分层与激活名单基础设施。**

---

### 15. 验证结果与最终结论（基于 report-segmentation-comparison 实际输出）

运行 `pnpm report:segmentation-comparison` 后，可根据输出得到以下结论：

#### 15.1 contact-level 是否明显低估真实客户？

**验证发现**（示例数据）：

- jobs 表中 `contact_id` 为空、`account_id` 非空的比例若接近 100%，说明几乎所有 job 都只挂在 account 上。
- contact-level 的 `real_customer` 数量会接近 0，而 account-level 的 `real_customer` 可能为数百。
- “可能被漏判”的 contact 数：即 contact 为 lead_only/unknown 但其 account 有 jobs 的数量，可能达到数百。

**结论**：若上述比例很高，**contact-level 会严重低估真实客户**。原因在于 job 与 account 关联多、与 contact 关联少，导致 contact-level 的 `jobs_count` 几乎全为 0。

#### 15.2 account-level 是否更适合作为“老客户激活总名单”？

**结论**：**是**。account-level 按 `jobs.account_id` 聚合，能正确识别有真实工单的客户。若 contact-level 的 real_customer 极少而 account-level 的 real_customer 明显更多，则应把 **account-level 作为老客户激活的总名单依据**。

实际发短信时，需在 account 下找到有 `phone` 的 contact。若 `crm_account_reactivation_candidates` 返回 0（即 real_customer 的 account 下都没有可联系电话），则需要先补全 contacts 的 phone，或从其他渠道获取联系方式。

#### 15.3 total_revenue 当前是否足以用于客户价值判断？

**验证发现**：若 `invoices_total = 0` 或 `contacts_with_revenue > 0` 极少，则 total_revenue 基本不可用。

**结论**：在发票数据缺失或极少的情况下，**total_revenue 暂不足以支撑客户价值判断**。`customer_value` 会几乎全部为 `none`，`priority_score` 中与 revenue 相关的部分无效。可优先依赖 `jobs_count`、`months_since_last_job`、`address_quality` 做排序。

#### 15.4 crm_reactivation_candidates_v2 是否比原版更适合实际发短信？

**结论**：**是**。v2 排除 30 天内已联系、空 phone、`do_not_contact`，能减少重复触达和无效号码。在 contact-level 有足够 real_customer 的前提下，实际发短信时推荐优先用 v2。

若 contact-level 本身 real_customer 为 0（如当前示例），则 v1 和 v2 名单都为空，需先解决 jobs/contacts 数据关联问题。

#### 15.5 现阶段最推荐用哪张 view 做第一波 SMS campaign？

| 情况 | 推荐 |
|------|------|
| **contact-level 有 real_customer 且 v2 有名单** | 使用 `crm_reactivation_candidates_v2` |
| **contact-level real_customer 为 0、account-level 有 real_customer** | 使用 `crm_account_reactivation_candidates` 做总名单，再在 account 下找到有 phone 的 contact 进行触达；若 account 下无 phone，需先补全数据 |
| **invoices 极少** | 忽略 `customer_value`，按 `jobs_count`、`months_since_last_job`、`priority_score` 排序 |

**当前数据下的实际操作建议**：若 report 显示 contact-level real_customer = 0、account-level real_customer > 0，说明 jobs 未关联到 contact。可先按 account 名单盘点“哪些 account 是老客户”，再通过补齐 `jobs.contact_id` 或为 account 下 contact 补充 phone，使 contact-level 或 account-level 名单具备可发短信的联系人。

