# Railway 部署指南

CRM 应用位于 **apps/crm**（BHT Revenue OS 单仓）。**重要：Root Directory 必须为仓库根目录**（留空或 `.`），不能设为 `apps/crm`，否则 pnpm 无法安装 workspace 依赖，构建会失败。仓库根目录的 `railway.toml` 已配置 build 与 start 命令。

按以下步骤在 Railway 上新建项目并部署 CRM Backend。

---

## 一、注册与新建项目

1. 打开 [railway.app](https://railway.app)，用 **GitHub 登录**。
2. 点击 **「New Project」**。
3. 选择 **「Deploy from GitHub repo」**。
4. 若未连过 GitHub，先按提示授权；然后选择仓库 **`xiaomeng7/CRM_SYSTEM`**。
5. 选中后 Railway 会创建项目并开始第一次部署（可能先失败没关系，配好下面步骤后会成功）。

---

## 二、添加 Railway 数据库（PostgreSQL）

既然不用 Neon，直接在 Railway 里加一个 PostgreSQL，和 Backend 同在一个项目里。

1. 在 **同一 Project** 页面，点击 **「+ New」**。
2. 选择 **「Database」** → **「PostgreSQL」**。
3. Railway 会创建一个新的 PostgreSQL 服务，并自动生成 `DATABASE_URL` 等变量。
4. 点进这个 **PostgreSQL 服务** → **「Variables」** 或 **「Connect」**：
   - 可以看到 **`DATABASE_URL`**（或 `DATABASE_PRIVATE_URL`），格式类似：  
     `postgresql://postgres:xxx@xxx.railway.internal:5432/railway`  
   - 公网连接用 **「Connect」** 里提供的 **Public URL**（带 `railway.app` 的），方便本地或外部连。
5. **把数据库变量挂到 Backend 上**：  
   - 点回你的 **Backend Service**（从 GitHub 部署的那个）→ **「Variables」**。  
   - 点 **「Add Variable」** → 选 **「Add a reference」** 或 **「Reference」**。  
   - 选择 **PostgreSQL 服务** 下的 **`DATABASE_URL`**（或 `DATABASE_PRIVATE_URL`），这样 Backend 会自动用 Railway 的数据库，无需手抄连接串。
6. 再在 Backend 的 Variables 里加一条：**`DATABASE_SSL`** = **`true`**（Railway Postgres 用 SSL）。
7. **初始化表结构（只做一次）**：  
   - 在 PostgreSQL 服务里点 **「Connect」**，复制 **「Postgres connection URL」**（公网那个）。  
   - 本地在项目根目录执行（把 `你的连接串` 换成刚复制的）：  
     ```bash
     node -e "
     require('dotenv').config();
     const { Pool } = require('pg');
     const fs = require('fs');
     const pool = new Pool({ connectionString: process.env.DATABASE_URL || '你的连接串', ssl: { rejectUnauthorized: false } });
     const sql = fs.readFileSync('database/schema.sql', 'utf8');
     pool.query(sql).then(() => { console.log('Schema 初始化成功'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
     "
     ```  
     若用引用变量，Railway 部署后 Backend 里已有 `DATABASE_URL`，你本地要把连接串临时填进 `.env` 再跑上面命令；或者用 Railway 提供的 **「Query」** 在网页里执行 `database/schema.sql` 里的 SQL（复制粘贴执行）。

完成后，Backend 和 Cron 都用同一套 Variables，自然会连到 Railway 的 PostgreSQL。

---

## 三、配置为 Web 服务

1. 在项目里会有一个 **Service**（从 GitHub 来的那个），点进去。
2. 打开 **「Settings」** 标签：
   - **Root Directory**：留空或 `.`（必须是仓库根目录，否则 pnpm workspace 构建会失败）。
   - **Build / Start**：若仓库根目录有 `railway.toml`，会使用其中的 `buildCommand` 与 `startCommand`；否则在 Settings 中手动填 Build = `pnpm install`，Start = `pnpm --filter @bht/crm start`。
   - **Watch Paths**：留空即可（默认整仓变更都会触发部署）。
3. 打开 **「Variables」** 标签，添加环境变量（见下一节）。

---

## 四、环境变量（Variables）

在 Backend Service 的 **Variables** 里：

- **DATABASE_URL**、**DATABASE_SSL**：若已按「二」添加了 Railway Postgres 并做了引用，这里会自动有 `DATABASE_URL`，只需再设 `DATABASE_SSL` = `true`。
- 其余变量可 **Add Variable** 或 **Raw Editor** 手动添加（**不要**把 `.env` 推送到 GitHub）。

建议配置：

| 变量名 | 说明 | 从哪里来 |
|--------|------|-----------|
| `DATABASE_URL` | 数据库连接串 | Railway Postgres 引用（见第二节） |
| `DATABASE_SSL` | 是否 SSL | 填 `true` |
| `SERVICEM8_API_KEY` | ServiceM8 API 密钥 | ServiceM8 后台 → Settings → API Keys |
| `TWILIO_ACCOUNT_SID` | Twilio 账户 SID | Twilio 控制台（见第五节） |
| `TWILIO_AUTH_TOKEN` | Twilio 认证令牌 | Twilio 控制台 |
| `TWILIO_PHONE_NUMBER` | 发短信的号码 | Twilio 购买的号码，E.164 如 `+61412345678` |

- `PORT` 不用填，Railway 会自动注入。

---

## 五、Twilio 配置（发短信）

自动化发短信走 Twilio，按下面做一次即可。

### 1. 注册 Twilio

1. 打开 [twilio.com](https://www.twilio.com)，点 **Sign up**。
2. 填邮箱、密码、手机号验证。
3. 登录后进入 **Console (Dashboard)**。

### 2. 拿到 Account SID 和 Auth Token

1. 在 Console 首页可以看到 **Account SID** 和 **Auth Token**（点 “Show” 显示）。
2. 这两个就是 `TWILIO_ACCOUNT_SID` 和 `TWILIO_AUTH_TOKEN`，复制到 Railway 的 Variables。

### 3. 购买一个发短信用的号码

1. 左侧菜单 **Phone Numbers** → **Manage** → **Buy a number**。
2. 国家选 **Australia (+61)**，勾选 **SMS**，点 **Search**。
3. 选一个号码，按提示完成购买（试用账户会送一点余额，够测试）。
4. 买好后在 **Phone Numbers** → **Manage** → **Active numbers** 里看到你的号码，格式如 `+61 412 345 678`。
5. 在 Railway Variables 里加 **`TWILIO_PHONE_NUMBER`**，填 E.164 格式：`+61412345678`（去掉空格）。

### 4. 试用账户限制（可选看）

- 试用账户只能给「已验证的」手机号发短信；要发任意号码需升级或充值。
- 在 **Phone Numbers** → **Manage** → **Verified Caller IDs** 里可添加要接收短信的号码做测试。

### 5. 在 Railway 里填的三个变量

| 变量名 | 值 |
|--------|-----|
| `TWILIO_ACCOUNT_SID` | Console 首页的 Account SID |
| `TWILIO_AUTH_TOKEN` | Console 首页的 Auth Token |
| `TWILIO_PHONE_NUMBER` | 刚买的号码，如 `+61412345678` |

---

## 六、生成公网地址

1. 在同一个 Service 的 **「Settings」** 里找到 **「Networking」**。
2. 点击 **「Generate Domain」**，Railway 会分配一个 `xxx.up.railway.app` 的域名。
3. 之后用这个域名访问你的 API，例如：  
   `https://你的域名.up.railway.app/api/customers`。

---

## 七、定时任务（Cron）：Sync + Automations

需要两个定时任务：同步 ServiceM8、跑自动化引擎。

### 方式 A：Railway Cron（推荐）

1. 在 **同一 Project** 里点击 **「+ New」**，选 **「Empty Service」** 或 **「Cron Job」**（视 Railway 当前界面而定）。
2. 若没有单独的 “Cron” 类型：
   - 再 **「+ New」** → **「GitHub Repo」**，仍选 `CRM_SYSTEM`，会多一个 Service。
   - 在这个新 Service 的 **Settings** 里：
     - **Start Command** 改为：`node api/sync-servicem8.js`
     - 在 **Settings → Cron Schedule** 里设成例如：`0 2 * * *`（每天凌晨 2 点）。
   - 再新建一个 Service，同样连 `CRM_SYSTEM`：
     - **Start Command** 改为：`node scripts/run-automations.js`
     - **Cron Schedule** 设成：`0 3 * * *`（每天凌晨 3 点）。
3. 这两个 Cron Service 的 **Variables** 要和主 Web Service 一致（同一 Project 下可共用 Variables，或各自再贴一份）。

若 Railway 界面是 **「Cron」** 类型：

- 新建 **Cron**，选同一仓库，Command 填：`node api/sync-servicem8.js`，Schedule 填：`0 2 * * *`。
- 再新建一个 **Cron**，Command：`node scripts/run-automations.js`，Schedule：`0 3 * * *`。
- （可选）**Invoice 逾期提醒**：再新建 **Cron**，Command：`node scripts/run-invoice-overdue.js`（working directory 为 `apps/crm`），Schedule：`0 4 * * *`。若不想单独建 Cron，可在主 Web Service 的 Variables 里设 `AUTO_INVOICE_OVERDUE_DAILY=true`，由 API 进程每 24 小时自动跑一次。

Cron 表达式示例：

- 每天 02:00 UTC：`0 2 * * *`
- 每天 03:00 UTC：`0 3 * * *`

（注意 Railway 多为 UTC，悉尼时间需加 10 或 11 小时。）

### 方式 B：用 GitHub Actions 代替

若暂时不想在 Railway 上配 Cron，可以用 GitHub Actions 定时调用你的 API 或脚本，效果类似。需要的话可以再写一份 Actions 示例。

---

## 八、检查部署是否成功

1. **Deployments** 里看最新一次部署状态为 **Success**。
2. 浏览器访问：  
   `https://你的域名.up.railway.app/api/customers`  
   应返回 JSON（可能为空数组 `[]`）。
3. 若 502/503，看 **Deployments → View Logs** 里是否有报错（例如缺环境变量、数据库连不上）。

---

## 九、小结

| 步骤 | 做什么 |
|------|--------|
| 1 | Railway 用 GitHub 登录，New Project → Deploy from GitHub → 选 CRM_SYSTEM |
| 2 | + New → Database → PostgreSQL，在 Backend Variables 里引用 `DATABASE_URL`，设 `DATABASE_SSL=true` |
| 3 | 用 PostgreSQL 的 Connect URL 在本地跑一次 schema 初始化（或网页 Query 执行 schema.sql） |
| 4 | Service Settings：Start Command = `npm start` |
| 5 | Variables：Twilio 三件套 + SERVICEM8_API_KEY（Twilio 见第五节） |
| 6 | Networking：Generate Domain，得到 API 公网地址 |
| 7 | 新建 2 个 Cron：sync + automations |
| 8 | 用 `/api/customers` 测试 API |

之后每次往 GitHub 的 `main` 分支 push，Railway 会自动重新部署。
