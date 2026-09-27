# Personal Accounting

基于 React 和 Cloudflare Workers 的个人记账应用。账号、分类、交易、附件、汇率和设置均按字段存入 D1 关系表；浏览器不再作为主数据源。

## 功能

- Email 注册、登录和服务端 Cookie 会话
- 收入、支出、账户间转账（转账双边余额由 D1 原子维护）
- 两级分类、明细筛选、每批 10 条的滚动加载
- AI 文本记账与小票识别
- 管理员为指定用户导入旧版 `localStorage` 账本，支持导入前备份与幂等去重
- 每个用户的数据隔离和对象级版本冲突检查

金额在界面和 API 中使用两位小数，在 D1 中统一乘以 100 后用 `INTEGER` 存储（字段名为 `amount_minor`、`balance_minor` 等），即人民币以“分”为单位。

## 本地安装与运行

要求：

- Node.js 20 或更高版本
- npm
- macOS、Linux 或 Windows 均可（Wrangler 会自动安装对应平台的 `workerd`）

### 1. 安装依赖

```bash
npm ci
```

如果修改过 `package.json`、需要更新 lockfile，才使用：

```bash
npm install
```

### 2. 配置本地 Secrets

复制示例文件：

```bash
cp .dev.vars.example .dev.vars
```

编辑 `.dev.vars`：

```dotenv
BETTER_AUTH_SECRET="替换为至少32字节的随机值"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="替换为强密码"
```

生成 `BETTER_AUTH_SECRET` 可以使用：

```bash
openssl rand -base64 32
```

`.dev.vars` 已被 Git 忽略，不要提交该文件。`ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 只用于独立管理员页面，不会创建普通记账用户，也不会写入 D1。

### 3. 初始化本地 D1 并启动

一条命令完成前端构建、本地 D1 migration 和 Worker 启动：

```bash
npm run dev
```

Wrangler 会在终端打印实际访问地址，通常是：

- 普通应用：`http://localhost:8787/`
- 管理员后台：`http://localhost:8787/admin`

也可以分步运行，便于定位问题：

```bash
npm run build
npm run db:migrate:local
npx wrangler dev
```

本地 D1 数据由 Wrangler 保存在项目的 `.wrangler/` 目录中。再次启动不会清空数据，migration 也不会重复执行。

### 4. 验证普通用户功能

1. 打开普通应用，选择“注册”，填写昵称、Email 和至少 8 位密码。
2. 登录后新增账户、分类、收入和支出。
3. 创建一笔转账，检查转出账户减少、转入账户增加。
4. 打开明细页，检查收支、一级分类、二级分类筛选，以及每批 10 条滚动加载。
5. 退出后重新登录，确认数据仍然存在。

### 5. 验证管理员功能与旧数据导入

1. 打开 `/admin`，使用 `.dev.vars` 中的 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 登录。
2. 检查用户列表；可新建、编辑、重置密码或删除用户。
3. 普通用户可在“设置 → 数据存储与本地迁移”下载旧浏览器账本 JSON。
4. 管理员在用户列表中找到目标用户，点击“导入 JSON”并选择该备份。
5. 回到该普通用户账号，核对分类、账户余额和交易条数。
6. 再次为同一用户导入同一文件，应提示已经导入，不会创建重复数据。

只有管理员接口可以导入，并且目标用户 ID 由管理员页面指定。普通用户直接调用 `/api/import` 会返回 `403`。

### 本地开发说明

`npm run dev` 使用 Worker 同时提供 API 和构建后的前端，因此没有 Vite 热更新。仅修改前端样式时可以运行：

```bash
npm run dev:web
```

但 Vite 单独运行时没有 Worker 的注册、登录和 D1 API；需要完整功能时仍应使用 `npm run dev`。

如果看到 `no such table`，先停止服务并执行：

```bash
npm run db:migrate:local
```

如果端口 `8787` 被占用，可以显式指定其他端口：

```bash
npx wrangler dev --port 8788
```

### 本地校验命令

```bash
npm run check
npm run lint
npm run build
npm run deploy:dry
```

其中 `deploy:dry` 只打包和检查 Worker，不会发布到 Cloudflare。

## 部署到 Cloudflare Workers

先登录 Wrangler，并设置认证密钥：

```bash
npx wrangler login
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
```

然后部署：

```bash
npm run deploy
```

`wrangler.jsonc` 声明了 D1 binding、静态资源和可观测性。Wrangler 会按配置解析 `personal-accounting` 数据库；若所在账号要求预先创建 D1，请先运行 `npx wrangler d1 create personal-accounting`，再将返回的 `database_id` 写入 `wrangler.jsonc` 的 D1 配置。远端 migration 会在 Worker 发布前执行。

## 数据迁移说明

升级后，普通用户在“设置”页的“数据存储与本地迁移”区域下载浏览器旧账本。管理员访问 `/admin`，使用 Worker Secret 中的管理员账号和密码登录，再选择目标用户导入该 JSON。普通用户没有导入 API 权限。

服务端会校验数据、计算 SHA-256，并以目标用户和来源哈希记录导入批次；同一用户重复导入同一份数据不会创建副本。导入不会删除原来的 `localStorage`，核对云端条数和余额后再自行清理浏览器数据。

## 管理员后台

`/admin` 是独立页面，不进入普通账本。管理员可以查询、新建、修改和删除用户、重置用户密码（同时撤销该用户现有会话），并为指定用户导入旧账本。管理员会话使用单独的 HttpOnly、SameSite=Strict 签名 Cookie；管理员账号和密码只从 Worker Secret 读取，不存入 D1。

## 主要数据表

- Better Auth：`user`、`session`、`account`、`verification`
- 账本：`financial_accounts`、`categories`、`transactions`
- 附属对象：`transaction_attachments`、`exchange_rates`、`user_settings`
- 迁移审计：`import_batches`

所有账本表均以服务端会话得到的用户 ID 限定查询；业务接口不会信任客户端提交的 `user_id`。
