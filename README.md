# CRM System

轻量级 CRM 系统，面向小型电工承包公司，作为 ServiceM8 之上的控制层。

- ServiceM8 继续作为工单和排班的操作工具
- 本系统负责：数据同步、客户标签、自动化短信跟进、沟通记录

## 技术栈

- Node.js
- PostgreSQL
- Twilio (SMS)
- ServiceM8 API

## 项目结构

```
crm-system/
├── database/
│   └── schema.sql          # 数据库表结构
├── api/
│   ├── sync-servicem8.js   # ServiceM8 同步脚本
│   ├── customers.js        # 客户 API
│   └── jobs.js             # 工单 API
├── automation/
│   ├── automation-engine.js # 自动化引擎
│   └── triggers.js          # 触发器定义
├── integrations/
│   ├── servicem8-client.js  # ServiceM8 API 客户端
│   └── sms-client.js        # Twilio SMS 客户端
├── scripts/
│   └── run-automations.js   # 运行自动化
├── lib/
│   └── db.js                # 数据库连接
├── .env.example
└── README.md
```

## 快速开始

### 1. 环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串，如 `postgresql://user:pass@localhost:5432/crm` |
| `DATABASE_SSL` | 若使用云数据库需 SSL，设为 `true` |
| `SERVICEM8_API_KEY` | ServiceM8 开发者门户中的 API Key |
| `TWILIO_ACCOUNT_SID` | Twilio 账户 SID |
| `TWILIO_AUTH_TOKEN` | Twilio 认证令牌 |
| `TWILIO_PHONE_NUMBER` | 发送短信的 Twilio 号码（E.164 格式，如 +61400000000） |

### 2. 安装依赖

```bash
npm install
```

### 3. 初始化数据库

创建数据库并执行 schema：

```bash
createdb crm
psql -d crm -f database/schema.sql
```

或使用 npm 脚本（需已配置 `psql` 和数据库）：

```bash
npm run db:setup
```

### 4. 运行 ServiceM8 同步

从 ServiceM8 拉取客户和工单并写入本地数据库：

```bash
npm run sync
```

建议通过 cron 每日运行，例如每天凌晨 2 点：

```cron
0 2 * * * cd /path/to/crm-system && npm run sync
```

### 5. 运行自动化引擎

评估触发器、发送短信并记录沟通历史：

```bash
npm run automations
```

建议每日运行，例如每天上午 9 点：

```cron
0 9 * * * cd /path/to/crm-system && npm run automations
```

## 自动化触发器

| 触发器 | 条件 | 说明 |
|--------|------|------|
| JOB_COMPLETED_THANKYOU | 工单在过去 2 天内完成 | 感谢短信 |
| INACTIVE_12_MONTHS | 上次工单距今超过 365 天 | 唤醒老客户短信 |

同一客户同一触发器有 365 天冷却期，避免重复发送。

## ServiceM8 字段映射

同步脚本会将 ServiceM8 的 `Company` 映射到 `customers`，`Job` 映射到 `jobs`。若实际 API 字段名不同，可修改 `api/sync-servicem8.js` 中的映射逻辑。

常见字段对应：

- Company: `uuid`, `name`, `phone`, `email`, `address_suburb`, `address_post_code`
- Job: `uuid`, `company_uuid`, `scheduled_start_date`, `status`, `price`, `completed_date`

## 许可证

MIT
