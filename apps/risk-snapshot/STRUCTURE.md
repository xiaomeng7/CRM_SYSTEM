# 网站结构

## 项目目录结构

```
risk-snapshot-netlify/
│
├── risk-snapshot.html          # 主 HTML 文件（单页面应用）
├── README.md                   # 项目说明文档
└── STRUCTURE.md                # 本文件 - 网站结构说明
```

## 文件说明

### risk-snapshot.html
单页面应用程序，包含：
- **HTML 结构**：页面布局和内容
- **CSS 样式**：内联样式，包括：
  - 深色/浅色主题支持（自动跟随系统设置）
  - 响应式设计（移动端适配）
  - 模态框样式
  - 表单样式
- **JavaScript 功能**：
  - 多步骤表单流程管理
  - 状态管理
  - 进度条计算
  - 表单验证
  - 邮件提交功能（mailto）

## 功能模块

### 1. 资格检查（Eligibility Check）
- **步骤 1**：介绍页面
- **步骤 2-5**：4 个资格问题
- **步骤 6**：结果页面（适合/不适合）

### 2. 电气风险快照（Electrical Risk Snapshot）
- **步骤 1**：介绍页面
- **步骤 2-7**：6 个快照问题
- **步骤 8**：结果页面（不确定性评估）

### 3. 联系表单（Contact Form）
- 姓名、电话、邮箱
- 可选备注
- 表单验证

### 4. 成功页面（Success）
- 确认信息
- 邮件发送链接

### 5. 快速通话模态框（Quick Call Modal）
- 预约通话表单
- 日期和时间选择
- 预填充功能

## 配置项

在 `risk-snapshot.html` 的 JavaScript 部分可以配置：

```javascript
const LEARN_MORE_URL = "#";  // "了解更多"链接
const CONTACT_EMAIL = "info@bhtechnology.com.au";  // 联系邮箱
```

## 数据流程

1. **用户输入** → 存储在 `state.answers` 对象中
2. **进度计算** → 实时更新进度条
3. **结果评估** → `isEligible()` 和 `snapshotUncertaintyFlag()` 函数
4. **表单提交** → 生成 mailto 链接，打开用户邮件客户端

## 样式主题

- **深色主题**（默认）：深色背景，浅色文字
- **浅色主题**：通过 `@media (prefers-color-scheme: light)` 自动切换

## 响应式断点

- 移动端：`max-width: 520px`
- 桌面端：最大宽度 920px
