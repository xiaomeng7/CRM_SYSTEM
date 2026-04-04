# 广告运营规范（SOP）

本文档与当前 CRM / 落地页代码中的**已实现能力**对齐，供投放、增长与运营统一：**命名、发布、链接参数、归因查询与例行复盘**。  
更细的线索入站说明见 [lead-intake-flow.md](./lead-intake-flow.md)；离线转化队列见 [google-offline-conversions.md](./google-offline-conversions.md)。

---

## 1. 版本命名规范

### 1.1 创意版本（creative version）

- **库内字段**：`ad_creatives.version`（创意库 API）。
- **URL / 表单透传**：查询参数 **`cv`** → CRM `leads.creative_version`（与库内 `version` **字符串完全一致**，区分大小写；建议全程小写）。
- **系统自动递增**（`publish-new-version` 未手动指定 `version` 时）：对 `v1`、`v2` 这类标签会解析数字并 +1；其它字符串会生成 `原串_v2` 等形式（见 `services/adAssetVersioning.js` 的 `bumpVersionLabel`）。
- **推荐团队格式**（便于读写与和广告结构对齐）：
  - **主版本**：`v1`、`v2`、`v3` …（与 fork 默认规则一致）。
  - **或**带活动前缀：`adv_v1`、`adv_v2`（fork 后为 `adv_v1_v2` 类形式，需在文档里记下含义）。
- **约束**：同一创意 fork 时若存在 `campaign_id` + `creative_code`，系统会为 `creative_code` 加后缀避免唯一键冲突；运营侧应保证 **投放链接里的 `cv=` 与最终入库的 `version` 一致**。

### 1.2 落地页版本（landing page version）

- **库内字段**：`landing_page_versions.version`（`UNIQUE(route_path, version)`）。
- **URL / 表单透传**：查询参数 **`lpv`** → CRM `leads.landing_page_version`。创建库记录时说明里已写明：**`version` 与 URL 中 `lpv=` 使用同一值**（见 `landingPageVersionLibrary.js` 校验提示）。
- **推荐团队格式**：与创意类似，优先 `v1` / `v2`，或 `lp_energy_main_v1` 等有含义前缀；**同一 `route_path` 下不可重复**。

### 1.3 `utm_campaign` 命名格式

- **入库位置**：`leads.utm_campaign`；分析 API 按 **`utm_campaign` 字符串** 分桶（无额外规范化）。
- **CRM 侧补充逻辑**（`public-leads`）：若未传 `utm_campaign`，存在用 **`campaigns.code` 或 `campaigns.name` 与入参精确匹配** 的归因回填（依赖种子/数据质量）。
- **推荐格式**（约定优于配置，代码不强制校验）：
  - `产品线_渠道_活动_时期`，例如：`energy_google_search_advisory_q2`、`rental_pmax_lite_2026-04`。
  - 使用 **小写 + 下划线**，避免空格与频繁变更的临时字符串，便于 `GET /api/analytics/ad-performance` 对比。

---

## 2. 发布流程

### 2.1 什么时候必须「publish new version」

在以下情况，**不要**对线上在用的记录做「改文案式」PATCH，应使用 **复制新版本**：

| 对象 | 触发条件 | API |
|------|----------|-----|
| 创意 | 当前行 **`status === 'active'`**，且要改 headline / description / cta / landing_url / version 等任意非状态字段 | `POST /api/ads/creatives/:id/publish-new-version` |
| 落地页版本 | 当前行 **`status === 'active'`**，且要改 headline / route_path / version 等 | `POST /api/ads/landing-pages/:id/publish-new-version` |

对上述 **active** 资源，直接 PATCH 会返回 **409**，错误码 **`ACTIVE_IMMUTABLE`**（创意与落地页文案一致）。

**新建创意 / 新建落地页版本记录**：仍用 `POST /api/ads/creatives`、`POST /api/ads/landing-pages`（初稿多为 `draft`）。

### 2.2 什么时候允许 PATCH

- **创意**（`ad_creatives`）：
  - **`draft` / `paused` / `archived`**：可按允许字段正常 PATCH。
  - **`active`**：仅允许 PATCH **`status`** 为 **`paused`** 或 **`archived`**（用于下线、归档）；其它字段必须先 fork。
- **落地页版本**（`landing_page_versions`）：
  - **`draft` / `archived`**：可 PATCH 文案与元数据（`archived` 一般不再改，除非纠错）。
  - **`active`**：仅允许把 **`status`** 改为 **`archived`**；其它变更必须先 fork。

### 2.3 状态使用规则（与代码一致）

**创意**：`draft` → `active`（上线）→ `paused`（暂停投放/对照）→ `archived`（废弃）。

- 新 fork 默认 **`initial_status` = `draft`**（可在请求体中改为 `active`）。
- **`deactivate_previous: true`**：若旧行为 `active`，fork 后旧行变为 **`paused`**（仅状态变更，不删行、不改历史文案）。

**落地页版本**：`draft` → `active` → `archived`（**无 `paused`**）。

- 新 fork 默认 **`draft`**；**`deactivate_previous: true`** 时旧 `active` → **`archived`**。

### 2.4 版本审计（可选查账）

- `GET /api/ads/version-events?object_type=creative|landing_page&old_id=&new_id=&limit=`（与其它需密钥的 ads 写操作相同鉴权方式）。
- 表 `ad_asset_version_events`：记录 `old_id`、`new_id`、`old_version`、`new_version`、`changed_at`、`meta`（迁移 `055`）。

---

## 3. 投放链接规范

### 3.1 Google Ads 侧建议携带的参数

落地页已实现从 **当前页 URL 查询串** 读取并随表单提交 CRM（`index.html`、`rental-lite.html` 等）：

| 参数 | 含义 | 写入 CRM（经 Netlify → public-leads） |
|------|------|--------------------------------------|
| `gclid` | Google 点击 ID | `leads.gclid`；离线转化上传依赖可信 gclid |
| `utm_source` / `utm_medium` | 来源 / 媒介 | 进入 `raw_payload` 等 |
| `utm_campaign` | 活动名 | `leads.utm_campaign` |
| `utm_content` | 创意/素材粒度 | `leads.utm_content`；并写入机会 `intake_attribution` |
| **`cv`** | 创意版本标签 | `leads.creative_version` |
| **`lpv`** | 落地页版本标签 | `leads.landing_page_version` |

最终请求体里字段名为 `creative_version` / `landing_page_version`（由前端从 `cv` / `lpv` 映射）。

### 3.2 标准写法约定

- **`cv` / `lpv`**：与创意库、落地页版本库中的 **`version` 字段逐字一致**（推荐小写、无空格）。
- **`utm_campaign`**：与团队命名表一致，一活动一主值； A/B 可用 `utm_content` 或不同 `cv` 区分。
- **不要在已投放 URL 上改 `cv`/`lpv` 含义**：应发新版本并换新链接，以免分析 cohort 串味。

### 3.3 示例链接

```text
https://<your-landing-host>/index.html
  ?gclid={gclid}
  &utm_source=google
  &utm_medium=cpc
  &utm_campaign=energy_google_search_advisory_q2
  &utm_content=pmax_asset_group_a
  &lpv=v2
  &cv=adv_v2
```

```text
https://<your-landing-host>/rental-lite.html
  ?gclid={gclid}
  &utm_source=google
  &utm_medium=cpc
  &utm_campaign=rental_pmax_lite_2026-04
  &lpv=rl_main_v1
  &cv=rl_creative_v1
```

（`{gclid}` 由 Google 自动替换；静态预览链接可去掉 `gclid` 仅测表单。）

---

## 4. 数据归因说明

### 4.1 Lead（线索）

- 表单 / `POST /api/public/leads` 写入 **`gclid`、`utm_campaign`、`utm_content`、`landing_page_version`、`creative_version`** 等到 `leads` 行（及 `raw_payload` 等，见 `public-leads`）。
- 这些是后续机会的**第一手快照来源**。

### 4.2 Opportunity（机会）

- 创建机会时，`syncIntakeAttributionFromLead` 从关联 **lead** 拷贝以下键到 **`opportunities.intake_attribution`（JSONB）**：  
  `gclid`、`utm_campaign`、`utm_content`、`landing_page_version`、`creative_version`。  
- 若 lead 上字段后序被误改，**已写入机会的 JSON 不会自动回写**；分析在部分模式下会优先用 lead 列，缺失时用「**该 lead 下最早一条机会**」的 `intake_attribution`（见 `adPerformanceAnalytics` 的 `LATERAL` 子查询）。

### 4.3 Invoice（发票 / 付费）

- 付费状态与金额来自 `invoices` + `opportunities` 关联；**广告维度不单独存 invoice 表**，由分析 API 按 **lead cohort** 汇总「该 lead 生命周期内」的 won / paid。

### 4.4 Offline conversion（Google 离线转化）

- 队列入库时，会在内部 payload 中带 **`intake_inherited`**：`opportunities.intake_attribution` 优先，否则回落到 **lead** 上对应字段（`mergeIntakeSnapshotForPayload`）。
- **上传到 Google 的核心仍是 gclid + 转化动作 + 金额/价值**；`cv`/`lpv` 用于 CRM 侧排查与报表，不等同于 Google 账户内自定义参数（除非你在 Ads 侧另行配置）。

### 4.5 可查询结果的 API（已实现）

| 用途 | 方法 | 路径 | 说明 |
|------|------|------|------|
| 按版本/活动看线索与赢单/付费 | GET | `/api/analytics/ad-performance` | 查询参数：`date_from`、`date_to`（按 **`leads.created_at`**  cohort）、可选 `product_line`=`energy` \| `rental` \| `pre_purchase`；返回 `by_version[]`（`creative_version`、`landing_page_version`、`utm_campaign` 及 leads、won、paid、金额等） |
| 转化漏斗汇总 | GET | `/api/analytics/conversion-performance` | 日期范围；与广告维度无直接拆分 |
| 离线队列健康度 | GET | `/api/admin/google-offline-conversions/summary` | 可选 `event_type` |
| 单机会全链路 | GET | `/api/admin/google-offline-conversions/:opportunityId/timeline` | 调试用 |
| 创意列表 | GET | `/api/ads/creatives` | 可选 `status`、`product_line` 等 |
| 落地页版本列表 | GET | `/api/ads/landing-pages` | 可选 `status`、`product_line`、`version`、`route_path` |
| 版本 fork 记录 | GET | `/api/ads/version-events` | 需与写操作一致的密钥（若环境配置了 `SYNC_SECRET` / `ADMIN_SECRET`） |

**鉴权**：分析与管理类接口在配置了 `SYNC_SECRET` 或 `ADMIN_SECRET` 时，需 **`x-sync-secret` 请求头** 或 **`sync_secret` 查询参数**（与现有 admin 约定一致）。`GET /api/ads/creatives` 与 `GET /api/ads/landing-pages` 在部分部署下可能无密钥即开放，以实际环境为准。

**分析语义注意**（API 返回的 `cohort_note`）：在日期窗口内按 **线索创建时间** 计数；**赢单数、付费数、金额为该批线索的终身结果**，非窗口内才发生的事件。

---

## 5. 每周运营检查清单

### 5.1 建议调用的 API

1. **`GET /api/analytics/ad-performance`**  
   - `date_from` / `date_to`：本周（或滚动 7 天）；按产品线加 `product_line`。  
   - 保存或截图 `by_version` 表格，关注 `(not set)` 占比。

2. **`GET /api/analytics/conversion-performance`**  
   - 同一日期范围，看整体漏斗是否与广告拆分结论一致。

3. **`GET /api/admin/google-offline-conversions/summary`**  
   - 分别看 `opportunity_won` / `invoice_paid`（如文档）的 pending、sent、skipped 比例；skipped 若升高，检查 gclid 与转化动作环境变量。

4. **`GET /api/ads/creatives?status=active`** 与 **`GET /api/ads/landing-pages?status=active`**  
   - 确认「线上在用」库记录与投放链接中的 `cv` / `lpv` 是否仍一致；有无应归档却仍为 active 的条目。

5. **（有改版时）`GET /api/ads/version-events`**  
   - 按 `object_type`、`old_id` 核对本周 fork 是否都有记录。

### 5.2 建议对比的指标

- **规模**：`leads`、`opportunities_won`、`invoices_paid`。  
- **效率**：`lead_to_won_pct`、`won_to_paid_pct`。  
- **价值**：`total_paid_value`、`avg_paid_value`（在 won 为 0 时部分比率会为 null，属 SQL 设计结果）。  
- **维度**：同一 `utm_campaign` 下对比不同 **`cv`**；或同一 **`lpv`** 下对比不同 **`cv`**。

### 5.3 决策参考（与当前能力匹配）

| 现象 | 建议动作 |
|------|----------|
| 某 `cv`/`lpv` 组合 lead 多但 `lead_to_won_pct` 明显低于其它 | 暂停对应素材或落地页组合；创意改文案请 **publish-new-version** 后换新链接再测 |
| 某组合 won 高但 paid 低 | 结合 `won_to_paid_pct` 与业务跟进；非广告系统问题需销售侧排查 |
| `creative_version` / `landing_page_version` 大量 `(not set)` | 检查 Final URL 是否带齐 `cv`/`lpv`；检查落地页是否仍为已接入参数的版本 |
| 离线转化 skipped 多、gclid 缺失 | 核对 Ads 自动标记、落地页是否丢 `gclid`；参见 [google-offline-conversions.md](./google-offline-conversions.md) |
| 需在保留历史的前提下迭代 active 素材 | **禁止**直接 PATCH active；使用 **publish-new-version**，必要时 `deactivate_previous: true` |

---

## 6. 数据库与迁移依赖（运维备忘）

以下能力依赖对应迁移已执行（详见 `apps/crm/package.json` 中 `db:*` 脚本与 `database/` 下 SQL）：

- 线索上的 **`creative_version` / `landing_page_version`**（如 `051` 等 lead intake 相关迁移）。  
- 机会 **`intake_attribution`**（`052`）。  
- 创意库扩展、落地页版本表、版本事件表（`053`–`055` 等，以仓库当前迁移号为准）。

新环境上线广告分析前，应确认 **`GET /api/analytics/ad-performance`** 能返回数据而非持续降级为空维度。

---

*文档版本：与仓库实现同步撰写；仅描述已有功能，不包含未实现的审批流或 UI。*
