# Better Home Product OS - Phase 5 PDC Gap Report

生成时间：2026-07-08
数据来源：
- `packages/product-os/prisma/generated/definition-completion-report.json`
- `packages/product-os/definitions/*.json`

---

## 1) 当前 Completion 总览

| Product | Completion % | Release Ready |
|---|---:|---|
| Foundation | 89.5% | No |
| Living | 91% | No |
| Entry | 91% | No |
| Kitchen | 91% | No |
| Bedroom | 91% | No |
| Bathroom | 91% | No |
| Away | 91% | No |

结论：7/7 产品均未达到 100%，当前按规则 **阻断 Product OS v1.0 发布**。

---

## 2) 优先级分层（Gap Priority）

### Critical（影响发布）

1. 全部 7 个产品 Completion < 100%（发布门禁失败）。
2. 所有扣分均来自 TODO 标记未关闭（结构完整但内容决策未完成）。

### Important（影响 Website / Proposal / Print）

1. Collection 产品（Living/Entry/Kitchen/Bedroom/Bathroom/Away）均存在：
   - `content[7].body` 的 Footer 文案 TODO
   - `bom[*].notes` 的供应商/SKU 成本确认 TODO
2. Foundation 存在：
   - `content[5].body` Footer 文案 TODO
   - `automation[0].notes` / `automation[1].notes` 策略阈值/重试策略 TODO
   - `bom[*].notes` 的供应商/SKU 成本确认 TODO

### Nice to have（后续可优化）

1. `notes` 字段中仍保留“PDC completed ... TODO ...”说明，可在最终发布前改为最终审定说明。
2. TODO 文案风格可统一（例如统一模板：`TODO(Owner/Date): ...`）。

---

## 3) 每个 Product 的具体扣分项、TODO 位置、缺失字段 JSON Path

说明：
- 本次未发现结构性缺失字段（所有 section 在 completion report 中均为 `complete: true`）。
- 扣分来源为 TODO 标记惩罚项（todoMarkers）。

---

### Foundation (`FOUNDATION`)

- 当前 Completion：**89.5%**
- 扣分项：
  - TODO 标记共 **7** 处（主要是 BOM 采购信息、Automation 策略参数、Footer 文案）
- TODO 位置（JSON Path）：
  - `bom[0].notes`
  - `bom[1].notes`
  - `bom[2].notes`
  - `content[5].body`
  - `automation[0].notes`
  - `automation[1].notes`
  - `notes`
- 缺失字段 JSON path：
  - 无（结构字段完整）

### Living (`LIVING`)

- 当前 Completion：**91%**
- 扣分项：
  - TODO 标记共 **6** 处（BOM 供应商/成本 + Footer 文案 + Notes）
- TODO 位置（JSON Path）：
  - `bom[0].notes`
  - `bom[1].notes`
  - `bom[2].notes`
  - `bom[3].notes`
  - `content[7].body`
  - `notes`
- 缺失字段 JSON path：
  - 无（结构字段完整）

### Entry (`ENTRY`)

- 当前 Completion：**91%**
- 扣分项：
  - TODO 标记共 **6** 处（BOM 供应商/成本 + Footer 文案 + Notes）
- TODO 位置（JSON Path）：
  - `bom[0].notes`
  - `bom[1].notes`
  - `bom[2].notes`
  - `bom[3].notes`
  - `content[7].body`
  - `notes`
- 缺失字段 JSON path：
  - 无（结构字段完整）

### Kitchen (`KITCHEN`)

- 当前 Completion：**91%**
- 扣分项：
  - TODO 标记共 **6** 处（BOM 供应商/成本 + Footer 文案 + Notes）
- TODO 位置（JSON Path）：
  - `bom[0].notes`
  - `bom[1].notes`
  - `bom[2].notes`
  - `bom[3].notes`
  - `content[7].body`
  - `notes`
- 缺失字段 JSON path：
  - 无（结构字段完整）

### Bedroom (`BEDROOM`)

- 当前 Completion：**91%**
- 扣分项：
  - TODO 标记共 **6** 处（BOM 供应商/成本 + Footer 文案 + Notes）
- TODO 位置（JSON Path）：
  - `bom[0].notes`
  - `bom[1].notes`
  - `bom[2].notes`
  - `bom[3].notes`
  - `content[7].body`
  - `notes`
- 缺失字段 JSON path：
  - 无（结构字段完整）

### Bathroom (`BATHROOM`)

- 当前 Completion：**91%**
- 扣分项：
  - TODO 标记共 **6** 处（BOM 供应商/成本 + Footer 文案 + Notes）
- TODO 位置（JSON Path）：
  - `bom[0].notes`
  - `bom[1].notes`
  - `bom[2].notes`
  - `bom[3].notes`
  - `content[7].body`
  - `notes`
- 缺失字段 JSON path：
  - 无（结构字段完整）

### Away (`AWAY`)

- 当前 Completion：**91%**
- 扣分项：
  - TODO 标记共 **6** 处（BOM 供应商/成本 + Footer 文案 + Notes）
- TODO 位置（JSON Path）：
  - `bom[0].notes`
  - `bom[1].notes`
  - `bom[2].notes`
  - `bom[3].notes`
  - `content[7].body`
  - `notes`
- 缺失字段 JSON path：
  - 无（结构字段完整）

---

## 4) 结论：下一步责任划分

### 需要 Product Owner 决策

1. BOM 的最终供应商/SKU/成本确认（影响 `bom[*].notes` 中 TODO 关闭）。
2. Foundation 自动化策略参数（heartbeat threshold、cloud retry policy）最终策略确认。
3. 各产品 Footer 最终对外文案（用于 Website/Proposal/Print 一致输出）。

### 仅需文字补齐（不改变产品定位/价格/架构）

1. 将 `content[*].body` 中 Footer TODO 改成最终文案。
2. 将 `notes` 中“TODO pending”改成最终审定说明。
3. 将 BOM/Automation notes 中 TODO 转为已确认说明文本。

### 可安全自动格式化（系统可做，不涉及业务决策）

1. JSON 字段顺序统一（如按固定 key 排序）。
2. 空格/缩进/换行格式统一。
3. TODO 文案格式统一（例如 `TODO(Owner/Date): ...`）。
4. 报告结构模板统一（不改业务内容）。
