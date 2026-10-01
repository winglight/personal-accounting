# 真实项目 UI 改版交付与验证

日期：2026-10-01

## 交付对象

- 实际仓库：`winglight/personal-accounting`
- 修改基线：`main` / `dac0d183ba33a5d21abe8cb6b12e02c827cdc8c5`
- 这是现有 React / TypeScript 应用的可应用代码改动，不是静态原型。原型中的模拟账户、模拟交易和本地模拟保存没有引入生产代码。
- 初次交付包生成时仅完成本地修改及测试。2026-10-01 用户随后授权提交并推送，用户最新指定直接推送 `main`。本轮仅发布代码提交；没有创建 PR、远端 migration 或主动执行生产部署。

## 变更

1. 桌面侧栏、顶部操作区、移动底栏统一六个现有入口：记账、明细、统计、账户、分类、设置。原路由及 `/admin` 分流保留。
2. 五主题：暖白、石墨、森林绿、琥珀、柔紫。新用户、无合法偏好、存储异常均以森林绿为默认；合法旧选择保留。独立键 `pa-accounting-theme` 只存外观；旧 `theme=light/dark` 分别迁移到暖白/石墨。支持首屏恢复、主题色 meta、跨标签页同步、共享选择器。
3. 首页使用真实 AppContext 账户、交易和设置。收入/支出/余额按币种分别展示，转账不计收支。手工与 AI 入口始终可见；切换输入方式不会重挂载相应表单，主题切换不会重建应用。
4. 手工表单仍保留日期、收支、两级分类、账户、备注、项目、付款人、余额预估。账户管理、主账户标记、手动转账、分类编辑、明细筛选与编辑保留原 dispatch 行为。
5. 统计新增日/周/月/年范围浏览、前后翻页、回当前；范围浏览与原有趋势聚合粒度独立。自定义范围、收入/支出序列开关、一级/二级分类、原分类时间图保留。增加分类总额柱状图、金额/占比数据表、币种选择、空态和日期校验。
6. 今日列表为转账使用中性标识；今日与周图不再跨币种相加。未知币种不会悄悄按主币种计入。
7. 登录、账户、分类、设置和弹窗使用统一语义配色。输入标签关联、模态框标题/焦点/Escape、分类展开按钮、可见删除按钮及移动安全区得到完善。
8. 新增纯函数和真实 React 组件回归测试；测试使用独立 fixture/mocked API，不会向生产账本或 AI 服务写入数据。

## 保持不变的业务边界

以下源文件/目录与基线完全一致：`worker/`、`migrations/`、`src/App.tsx`、`src/contexts/`、`src/types/`、`src/utils/api.ts`、`src/lib/auth-client.ts`、`src/utils/aiClient.ts`、`src/utils/aiQueue.ts`、`src/utils/receiptImage.ts`、`src/utils/aiLogs.ts`、`src/pages/AdminPage.tsx`、`wrangler.jsonc`。

- AuthGate → AppProvider、same-origin Cookie、Origin 检查、D1 用户隔离与对象版本契约不变。
- 乐观更新、版本填充、串行 mutation、失败 reload 不变；dispatch 返回不是服务端保存确认。
- AI 文本/小票解析、审核编辑、确认、已有放弃操作、离线队列、重试、撤回、模型/模板配置及 receipt metadata 管道不变。AIChat 只增加一个 CSS 类。
- 手动转账仍走原有 ADD_TRANSACTION 转账分支。没有 AI 转账入口。
- 普通设置页没有恢复已移除的旧数据迁移/导出 UI；管理员导入保持原样。
- 所有测试凭据均为本地占位数据；没有把真实密钥或 `.dev.vars` 放进交付。

## 已通过的检查

基线：
- `npm ci`：成功（本环境需将 npm cache 指到可写目录）
- `npm run check`：通过
- `npm run lint`：0 错误；2 个基线已有 Fast Refresh warning
- `npm run build`：通过；已有大于 500 kB 的 chunk 提示

最终实现：
- `npm run check`：通过
- `npm run lint`：0 错误；仍为同一 2 个基线 warning
- `npm test`：58/58 通过
  - 33 个纯逻辑测试：五主题/偏好恢复/异常存储/跨标签事件，日期边界/闰年/跨年周/分页/自定义范围，币种与分类聚合、转账排除、minor-unit 精度
  - 25 个 React 组件/Context 测试：手工字段与 payload、AI/手工/主题切换保留草稿、手动转账、账户编辑、明细筛选与 receipt metadata、设置保留模型/模板、统计分页与币种、六路由入口、AI 文本审核编辑确认/小票批量确认/放弃/离线队列/重试/召回、真实 AppContext 乐观余额/串行版本/失败 reload、登录注册回调、模态 Escape 与焦点恢复
- `npm run build`：通过
- `npm run deploy:dry`：通过；仅打包，不发布
- `npm run db:migrate:local`：本地 D1 初始化成功，27 条 migration 命令完成；没有远端操作
- `git diff --check`：通过
- 独立主题复核：五主题 hover 文字对比 5.53–7.67、danger hover 5.85–7.31、输入边框 3.09–4.05；修复了石墨 hover 与输入边框级联遗漏
- 交付补丁在原始基线上 `git apply --check` 并实际应用成功，应用后文件逐一校验与交付源码相同

组件测试中的 Chart.js 渲染被替换为数据输出，验证传入的数据和交互状态；它不是实际 canvas 像素/布局验收。

## 未完成 / 不能声称通过

1. **完整 Workers + D1 浏览器 E2E 未跑通。** 本环境 `wrangler dev` 在本地启动时报告 `uv_interface_addresses returned Unknown system error 1`；显式 loopback 及授权的重试仍失败。
2. **真实浏览器视觉验收未完成。** 云浏览器打开本地预览被 `ERR_BLOCKED_BY_CLIENT` 拒绝；没有绕过该访问限制。桌面/移动端真实布局、原生下拉键盘行为和真实 canvas 图仍需在可访问的开发环境验收。
3. **真实服务登录/退出后的 D1 持久化、多人并发与跨用户隔离、管理员导入、真实 AI 文本/小票联网识别未做最终 E2E。** 相应后端和请求契约未改，组件/Context 检查不能替代这些测试。
4. 构建仍有 bundle 大于 500 kB 警告；本次生产前端约 733 kB（gzip 202 kB），原基线约 654 kB（gzip 187 kB）。没有以跳过告警的方式伪造全绿。

## 已存在的业务限制，未擅自改变

- 设置与 AI 的原有“保存成功”文案在乐观 dispatch 后立即显示，并非 D1 已确认。这次不改变 mutation 契约，也不将它当成已验证的远端成功。
- 原有跨币种转账会按同一数值加减两个账户，没有进行汇率换算。这次不变更后端转账金额语义；统计与展示按原币种分开，不制造统一折算总额。
- 原 README 的部分旧迁移说明与当前已移除的普通用户迁移 UI 不一致。本次没有按旧文档把已移除功能加回来。

## 应用与复核

本压缩包同时包含完整真实源码与 `redesign.patch`。二选一使用，不要对已更新源码再次套用补丁。

在基线仓库中先保存自己的未提交改动，确认当前代码基线，然后：

```sh
git apply --check /path/to/redesign.patch
git apply /path/to/redesign.patch
npm ci
npm run check
npm run lint
npm test
npm run build
npm run deploy:dry
```

测试通过后，在能正常运行本地 Worker 的环境配置个人 `.dev.vars`，执行 `npm run dev`，使用全新的测试用户验收：

- 五主题首次默认/刷新/切换；账户/分类/交易编辑未保存时切换主题
- AI 未启用/已启用两种状态下均可手工记账；AI 文本和小票编辑确认、放弃、失败重试、离线队列、撤回
- 手工完整字段、新增/编辑/删除交易、转账双边余额、分类和账户删除保护
- 明细日期/收支/两级分类过滤、10 条滚动加载、receipt 编辑后元数据保留
- 统计日/周/月/年跨边界翻页、自定义日期、独立聚合、序列开关、CNY/USD 分开、转账排除、空态
- 登出/登入后数据仍在；两用户隔离；`/admin` 的独立登录和导入
- 390px 手机与桌面宽度，焦点、弹窗滚动/关闭、浏览器前进后退

**不要将 `npm run dev:web` 视为完整功能环境，它只有 Vite，没有 Workers/D1/API。** 用户追加授权覆盖提交和直接推送 main，不包含生产发布授权或自动发布步骤。
