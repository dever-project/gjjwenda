# 发现记录：CRM推送记录接收与后台管理

## 已知事实

- 用户要求查看 `doc/CRM推送字段(新).xlsx`。
- 用户要求后台单独做一个 CRM 记录表，列表展示几个基本信息。
- 用户要求 CRM 记录可以修改、可以查看详情。
- 用户要求做一个接口接收该 Excel 描述的推送字段。
- 用户进一步明确：这轮就是实现一个接口，接收这些字段到数据库；Excel 表是说明字段。
- 用户明确要求不运行 build/test。

## 待梳理

- Excel 中的字段名、字段编码、必填/示例等信息。已确认：
  - 工作簿含 `Sheet1/Sheet2/Sheet3`，后两个为空。
  - `Sheet1` 主要字段从第 3 行开始，列为字段 key、参数说明、是否常用。
  - 常用字段包括 `name/mobile/tel/city/province/district/area/subjectName/promotionName/searchHost/searchEngine/chatId/chatURL/firstUrl/refer/note` 等。
- 当前 SQLite 仓库和 API route 的封装方式。
- 当前后台导航、列表页、详情/编辑交互的可复用组件。

## 初步设计倾向

- 新增 CRM 专用 SQLite 表保存：抽取字段 + 完整原始 JSON。
- 新增服务端仓库集中处理建表和推送入库，避免 API route 里散落 SQL。
- 推送接口接受 JSON 对象或数组；无法识别的字段不丢弃，统一放入 `payload_json`。
- 本轮暂不做管理端页面，后续可基于抽取字段快速展示列表。

---

# 发现记录：角色管理与全角色考试入口

## 已知事实

- 用户要求：可以在员工管理中把某个员工改成管理员。
- 用户要求：管理员后台也有员工考试功能；所有角色都有考试功能。

## 代码证据

- `app/admin/users/page.tsx`
  - `const students = users.filter(u => u.role === 'student'...)`，只展示员工。
  - 添加用户时固定 `role: 'student'`。
  - 当前没有 `updateUser` 调用，无法改角色。
- `components/ClientLayout.tsx`
  - 管理员访问 `/student` 会被重定向回 `/admin`。
  - 管理员导航没有“我的考试/考试记录”。
- `app/student/page.tsx`
  - 考试记录以 `currentUser.id` 归属；不依赖 `role === 'student'`，所以管理员可复用同一页面完成考试。

## 设计决策

- 不复制考试页到 `/admin`；管理员导航直接链接 `/student` 和 `/student/records`，复用现有考试闭环。
- 用户管理展示全部用户，角色列可切换。
- 不允许把最后一个管理员降为员工，避免锁死后台。

---

# 发现记录：接入飞书登录

## 已知事实

- 用户要求：当前登录接入飞书登录。
- 参考实现路径：`/mnt/e/dev/gjj`。
- 飞书登录后的用户角色都是员工。
- 当前项目目录：`/mnt/e/dev/shenchuang/gjj`。
- 用户要求不运行 build/test。

## 当前项目初步事实

- `app/login/page.tsx` 当前是纯客户端本地账号密码登录。
- 登录态通过 `useStore.setCurrentUser(user)` 写入 Zustand，并通过 `training-exam-current-user-id` 持久化当前用户 ID。
- 管理员/员工分流在登录页和 `ClientLayout` 里按 `user.role === 'admin' ? '/admin' : '/student'`。
- 现有飞书 AppID/AppSecret 已保存在服务端 SQLite `feishu_settings`，可复用 `readFeishuCredentials()`，无需新增前端密钥。

## 待确认/待查

- `/mnt/e/dev/gjj` 的飞书登录 OAuth URL、回调、用户信息接口。已确认：
  - 前端浏览器 OAuth 地址：`https://open.feishu.cn/open-apis/authen/v1/authorize`。
  - 飞书内 H5 SDK：`https://lf-scm-cn.feishucdn.com/lark/op/h5-js-sdk-1.5.30.js`。
  - 飞书内优先调用 `tt/lark/h5sdk.requestAuthCode()` 获取 code。
  - 服务端先用 `/open-apis/auth/v3/app_access_token/internal` 获取 `app_access_token`。
  - 再用 `/open-apis/authen/v1/access_token` + `grant_type=authorization_code` + `code` 换取 `open_id/name/mobile/avatar` 等身份。
- 当前 `appStateRepository` 是否已有单用户 upsert 方法，若无应做小型复用函数，避免整份 AppData 手动拼装散落到 API。已确认：
  - 当前只有 `replaceAppState()` 全量保存和 `replaceExamAttempt()` 局部保存。
  - 用户登录创建/更新适合新增 `upsertUser()`，不要为了一个飞书用户全表替换。

## 设计决策

- 复用现有飞书设置表中的 AppID/AppSecret，飞书登录配置接口只返回 `enabled/appId`，不返回 Secret。
- 管理员本地账号密码登录保留；飞书登录成功统一创建/更新为 `role: 'student'`。
- 飞书用户 ID/用户名从 `open_id` 派生，避免手机号缺失时无法登录。
- 前端飞书登录成功后先 `setCurrentUser(user)` 写当前登录态，再 `refreshData()` 把新用户同步进 Zustand 用户列表。

---

# 发现记录：修复多维表格生成应用 WrongRequestBody

## 已知事实

- 用户反馈：“根据多维表格生成系统应用”时报 `WrongRequestBody`。
- 截图位置是 AI 应用工厂弹窗，正在输入飞书多维表格 URL 后生成应用。
- 用户仍要求不运行 build/test。

## 代码证据

- `app/api/ai-apps/generate/route.ts`
  - 读取 `sourceUrl` 后调用 `buildDynamicAppFromFeishu()`。
- `lib/dynamic-apps/feishuAppBuilder.ts`
  - 生成应用时会先列数据表、列字段，再调用 `searchFeishuBitableRecords()` 读取 20 条样例记录。
- `lib/server/feishuClient.ts`
  - `searchFeishuBitableRecords()` 当前调用 `POST /bitable/v1/apps/{appToken}/tables/{tableId}/records/search?...`。
  - 请求体包含 `view_id` 和 `field_names`，没有筛选条件。

## 接口依据

- 飞书/Apifox 文档的“列出记录”接口为：
  - `GET /bitable/v1/apps/{app_token}/tables/{table_id}/records`
  - 示例把 `view_id`、`filter`、`sort`、`field_names`、`page_token`、`page_size` 都放在 Query 参数中。
- 本系统这里只需要读记录，不需要复杂搜索；用 GET 列出记录可以避免不必要的 POST body。

## 根因判断

- 当前代码在只读记录场景使用了 `/records/search` 的 POST body，飞书返回 `WrongRequestBody`。
- 最小修复是把通用记录读取函数改为 GET 列出记录接口，用 query 参数传 `field_names/page_size/page_token/view_id`。

## 第二轮补充

- 用户反馈改为 GET 后仍返回 `{ error: "WrongRequestBody" }`。
- 当前前端只显示错误消息，不显示是哪一个飞书接口返回，因此不能确认错误来自：
  - 列数据表；
  - 列字段；
  - 列记录；
  - 或认证接口。
- 记录读取仍带可选参数 `field_names` 和 `view_id`；如果这些 query 在特定表格/视图下不被接受，飞书仍可能返回 `WrongRequestBody`。
- 应增加两点：
  1. 飞书 API 错误带脱敏接口路径和错误码，避免继续盲查。
  2. 读取记录遇到 `WrongRequestBody` 时，自动去掉 `field_names/view_id`，用最小参数重试。

---

# 发现记录：隐藏知识库/同步来源并优化成绩阅卷

## 已知事实

- 用户要求在 `gjj` 下开发。
- 用户要求隐藏知识库管理、隐藏飞书设置里的同步来源。
- 用户希望成绩管理中的阅卷“最好自动打分”，人工阅卷只是偶尔看一下。
- 用户明确要求不运行 `npm run build` 或任何 test 测试命令。

## 待梳理

- 管理端导航和首页是否暴露“知识库管理”。已确认：
  - `components/ClientLayout.tsx` 管理端侧边栏有 `知识库管理 -> /admin/knowledge`。
  - `components/ClientLayout.tsx` 路由预热列表包含 `/admin/knowledge` 和 `/student/knowledge`。
  - `app/admin/page.tsx` 仪表盘统计卡展示“知识库文章”，说明文案也出现“飞书知识库学习/知识库数据”。
  - `app/admin/knowledge/page.tsx` 是完整知识库管理页，直接访问会展示分类、文章、同步记录。
- `app/admin/feishu/page.tsx` 的同步来源 UI 和服务端保存接口耦合方式。已确认：
  - 页面本地维护 `sources`，`handleSave` 将 `{ appId, appSecret, sources }` 一并 PUT 到 `/api/feishu/settings`。
  - “同步来源”只是一张 UI 表格，隐藏 UI 不需要删除服务端 sources 能力。
  - `handleSync` 仍会根据服务端已保存的 sources 执行同步。
- `lib/training/exam.ts` 当前对主观题/客观题的判分边界。已确认：
  - `MANUAL_TYPES = 简答/情景/论述/话术改写`。
  - `gradeAttempt()` 遇到 `isManualQuestion()` 会把答题标记为 `gradingMode: manual`、得分 0，并把整份答卷置为 `gradingStatus: pending`。
  - `finalizeManualReview()` 负责管理员保存主观题得分后完成整卷判定。
- 管理端成绩列表与单条阅卷页的状态展示逻辑。已确认：
  - `app/admin/records/page.tsx` 对 pending 显示“待阅卷”，操作按钮显示“阅卷”。
  - `app/admin/records/[attemptId]/page.tsx` 过滤 `manualQuestions`，手动录入分数/评语后调用 `finalizeManualReview()`。

## 初步设计倾向

- UI 隐藏走“少改动、可恢复”：隐藏入口/区块，不删类型和服务端同步能力。
- 阅卷自动化优先在考试提交时完成：能确定答案要点或参考答案的主观题自动给分，仍保留管理员阅卷页作为复核/修正入口。
- 自动主观题评分不引入 AI/新依赖：基于现有 `answerKey/rubric/correctAnswer` 做关键词命中率评分，并集中在 `lib/training/exam.ts`，避免页面里复制评分规则。

## 本轮实现结论

- 隐藏知识库管理的最小改动点：
  - `components/ClientLayout.tsx` 移除管理端侧边栏入口和路由预热。
  - `app/admin/knowledge/page.tsx` 改为重定向到 `/admin`，避免直接访问暴露管理页。
  - `app/admin/page.tsx` 移除知识库文章统计卡，避免首页继续暴露管理模块。
- 隐藏飞书同步来源的最小改动点：
  - `app/admin/feishu/page.tsx` 删除同步来源配置表 UI。
  - 继续保留 `sources` state 和保存 payload，避免破坏已有服务端同步配置。
- 成绩自动评分的复用点：
  - 继续使用 `gradeAttempt()` 作为交卷唯一评分入口。
  - 主观题自动评分 helper 与客观题评分 helper 同文件维护，共用 `isManualQuestion()`、标准化答案、按题目原始分换算百分制的逻辑。
  - `finalizeManualReview()` 保留给管理员复核/修正自动分，不另起复核流程。

---

# 发现记录：考试页首次进入卡顿排查

## 已知事实

- 用户反馈：点击开始考试/继续考试后没有立刻跳转，首次进入较慢，进入一次之后就正常。
- 当前项目是 Next.js App Router，学生考试页和考试详情页都是 client component。
- 不能运行 `npm run build` 或任何 test。

## 代码证据

- `app/student/page.tsx`
  - 新考试：创建 `newAttempt` 后执行 `await startAttempt(newAttempt)`，再 `router.push('/student/exam/:attemptId')`。
  - 继续考试：找到已有 in-progress attempt 后直接 `router.push(...)`。
- `store/useStore.ts`
  - `startAttempt` 先 `set` 写入本地 Zustand，再调用 `persistExamAttempt(attempt)`。
  - `persistExamAttempt` 走 `saveExamAttempt`。
- `lib/appStateClient.ts`
  - `saveExamAttempt` 发送 `PATCH /api/exam-attempts/:id`。
- `app/api/exam-attempts/[attemptId]/route.ts`
  - Next.js API route，`runtime = 'nodejs'`，保存到 SQLite。

## 初步结论

- 如果是新考试，点击卡顿的直接原因是页面等待后端保存完成后才跳转。
- 如果是继续考试，已不等待保存，首次慢主要是 Next.js dev 模式首次访问动态路由的懒编译/加载。
- 保留 Next.js 也可以优化体验：本地状态同步写入后立即跳转，保存失败再提示；并提前 prefetch 可继续考试的动态路由。
- 所有页面首次慢时，主要原因更偏向 Next.js 开发模式的“按页面首次编译”。生产构建后一般不会出现每个页面都首次编译的问题。
- 为改善开发体验，可以在登录后后台预热主要路由；这不会替代生产构建性能，但能减少手动首次点每页时的等待。
