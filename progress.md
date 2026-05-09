# 进度记录：打包发布脚本

## 2026-05-07

- 已新增 `scripts/package-release.sh`：
  - 默认应用名 `wenda`，也支持传参覆盖。
  - 执行 `npm run build`。
  - 校验 `.next/standalone/server.js` 和 `.next/static` 是否存在。
  - 生成 standalone 发布目录 `release/<appName>`。
  - 复制 `.next/standalone`、`.next/static`，存在 `public` 时同步复制。
  - 生成 `<appName>-release.tar.gz`。
  - 输出服务器解压和 PM2 启动示例。
- 已给脚本增加执行权限。
- 已在 `package.json` 增加命令：`npm run package:release`。
- 本端未执行打包脚本，未运行 `npm run build`，未运行任何 test。
- 用户使用发布包启动后仍报 `production-start-no-build-id`。
- 已定位脚本缺陷：发布目录缺少 `.next/BUILD_ID` 和 `.next/server`，原因是复制 standalone 时没有可靠复制隐藏 `.next` 内容。
- 已修复 `scripts/package-release.sh`：
  - 显式复制 `.next/standalone/.next`。
  - 显式复制 `server.js/package.json/node_modules`。
  - 复制静态资源到 `.next/static`。
  - 发布前强校验 `.next/BUILD_ID` 与 `.next/server`。
  - 生成 `start-pm2.sh`，启动时自动 `cd` 到发布目录，并给 PM2 设置 `--cwd`。
- 已用 `SKIP_BUILD=1 bash scripts/package-release.sh wenda` 基于现有构建产物验证打包脚本。
- 已验证：
  - `release/wenda/.next/BUILD_ID` 存在。
  - `release/wenda/.next/server` 存在。
  - `wenda-release.tar.gz` 内包含 `./.next/BUILD_ID`、`./.next/server/`、`./server.js`、`./start-pm2.sh`。
- 用户要求发布包包含数据库，并且部署后路径为 `/data/wenda/data/wenda.sqlite`。
- 已修改 `scripts/package-release.sh`：
  - 默认 `INCLUDE_DB=1`。
  - 默认源数据库为 `data/gjj.sqlite`，可通过 `DB_SOURCE=/path/to/source.sqlite` 覆盖。
  - 发布包内复制为 `data/<appName>.sqlite`。
  - 同步复制 `-wal` 和 `-shm` 文件，避免 WAL 数据丢失。
  - `start-pm2.sh` 默认 `SQLITE_DB_PATH=$(pwd)/data/<appName>.sqlite`。
  - 输出部署路径改为 `/data/<appName>`。
- 已用 `SKIP_BUILD=1 bash scripts/package-release.sh wenda` 验证打包。
- 已验证 `wenda-release.tar.gz` 内包含：
  - `./data/wenda.sqlite`
  - `./data/wenda.sqlite-wal`
  - `./data/wenda.sqlite-shm`

---

# 进度记录：构建类型错误修复

## 2026-05-07

- 用户运行 `npm run build` 后反馈类型错误：
  - 文件：`app/student/exam/[attemptId]/page.tsx:153`
  - 原因：`gradeAttempt()` 的返回值中 `gradingStatus` 被推断为普通 `string`，不能传给 `completeAttempt(ExamAttempt)`。
- 已定位根因在 `lib/training/exam.ts`：
  - `gradeAttempt()` 未显式标注返回 `ExamAttempt`。
  - `gradingStatus` 未显式标注 `AttemptGradingStatus`。
- 已修复：
  - 引入 `AttemptGradingStatus` 类型。
  - `gradeAttempt(...): ExamAttempt`。
  - `const gradingStatus: AttemptGradingStatus = ...`。
- 用户再次运行构建后反馈类型错误：
  - 文件：`lib/server/feishuClient.ts:359`
  - 原因：`values` 来自飞书响应，类型为 `any`，在 strict 下不能对 untyped 的 `headers.reduce` 使用泛型参数。
- 已修复：
  - 将 `values[0]` 显式转为 `unknown[]`。
  - 将数据行显式转为 `unknown[][]`。
  - 去掉 `reduce<JsonObject>` 泛型调用，改为给 accumulator 标注 `JsonObject`。
- 用户第三次运行构建后反馈类型错误：
  - 文件：`lib/training/questionImport.ts:288`
  - 原因：DOCX/Excel 导入生成的对象字面量未被上下文收窄，`gradingMode` 被推断为普通 `string`。
- 已系统处理 `questionImport.ts` 的同类字面量类型：
  - `normalizeQuestionType()` 显式返回 `QuestionType`。
  - DOCX section type 显式为 `QuestionType | '专题'`。
  - `parseTeacherDocxQuestions()` / `parseQuestionRows()` 的 map 回调显式返回 `Question`。
  - `parseConfigRows()` 的 map 回调显式返回 `ExamConfig`。
  - `createRules()` 显式返回 `ExamQuestionRule[]`。
  - `gradingMode` 显式标注 `GradingMode`。
- 已运行 `./node_modules/.bin/tsc --noEmit --pretty false` 做类型扫描，结果通过。
- 未在本端运行 `npm run build`，未运行任何 test 测试命令；请用户重新执行打包命令验证。

---

# 进度记录：管理员清空考试题库

## 2026-05-07

- 已读取用户要求：管理员增加清空考试题库功能，用于清理测试数据。
- 已梳理现有题库管理页和 `useStore`：
  - 题库页已有导入题库/考试数据入口。
  - 题目、考试配置、已发布考试、考试记录都在 `AppData` 中统一持久化。
- 已新增 `clearQuestionBank()`：
  - 清空 `questions`。
  - 清空 `examConfigs`。
  - 清空 `publishedExams`。
  - 清空 `examAttempts`。
  - 清空 `trainingProgress`。
- 已修改 `app/admin/questions/page.tsx`：
  - 题库管理页新增“清空题库”按钮。
  - 按钮仅在存在题库/考试数据时可点。
  - 增加二次确认弹窗，展示将删除的数据数量。
  - 明确提示员工账号和飞书配置不会删除。
- 用户确认“考试记录啥的也要同时清空”，已补充学习进度一起清空，避免测试学习/考试状态残留。
- 未运行 `npm run build`，未运行任何 test 测试命令。

---

# 进度记录：CRM推送手机号去重

## 2026-05-06

- 已核对 `/api/crm/push` 当前幂等规则：原先只按外部 ID 去重，`mobile` 只有普通索引，不会作为兜底去重条件。
- 已修改 `lib/server/crmRepository.ts`：
  - 外部 ID 仍优先。
  - 外部 ID 没命中时，按 `mobile/tel/phone` 归一化后的手机号匹配已有记录。
  - 手机号归一化会去掉空格、短横线、括号，并兼容 `+86` / `86` 前缀。
  - 更新已有手机号记录时会补写新的外部 ID。
  - 新增 `idx_crm_records_tel` 索引。
- 已更新 `doc/CRM推送接口对接文档.md` 的幂等规则和联调检查清单。
- 未运行 `npm run build`，未运行任何 test 测试命令。

---

# 进度记录：考试记录页展示优化

## 2026-05-06

- 已根据截图排查 `app/student/records/page.tsx`。
- 根因：页面使用 `p-8 max-w-5xl mx-auto` 的居中窄容器，右侧主内容区没有充分利用宽度。
- 已修改为后台一致的全宽布局：
  - 顶部固定标题栏。
  - 表格容器占满主内容区域。
  - 表头 sticky。
  - 空状态高度和提示增强。
  - 管理员进入该页时说明“这里展示当前管理员账号本人的考试记录；所有员工成绩看成绩管理”。
- 已做静态复核：
  - `app/student/records/page.tsx` 已无 `max-w-5xl/mx-auto/Card/CardContent`。
- 未运行 `npm run build`，未运行任何 test 测试命令。

---

# 进度记录：CRM推送记录接收与后台管理

## 2026-05-06

- 已读取用户要求：查看 `doc/CRM推送字段(新).xlsx`，后台新增 CRM 记录表，支持列表/详情/修改，并新增接收推送字段的接口。
- 已确认项目文件存在：`doc/CRM推送字段(新).xlsx`。
- 已读取 Excel：
  - `Sheet1` 有 CRM/card-push 字段说明。
  - `Sheet2/Sheet3` 为空。
  - 推送字段 key 包含 `name/mobile/tel/city/province/district/area/subjectName/promotionName/searchHost/searchEngine/chatId/chatURL/firstUrl/refer/note` 等。
- 用户已收窄范围：本轮只做接收接口和数据库落库。
- 已建立本轮计划、发现、进度记录。
- 已新增 `lib/server/crmRepository.ts`：
  - 自动创建 `crm_records` 独立表和索引。
  - 保存完整原始 payload 到 `payload_json`。
  - 抽取基础列：姓名、电话、邮箱/微信/QQ、地区、项目、校区、公司、渠道、会话、落地页、备注等。
  - 用 `cardId/recordId/clueId/leadId/chatId/ssid/visitorStaticId` 等外部标识做幂等更新；没有外部标识则每次新增。
- 已新增 `app/api/crm/push/route.ts`：
  - `POST /api/crm/push` 接收 JSON 对象、数组、`records/items/data` 包装数组、表单数据。
  - 支持 `data/records/items` 为 JSON 字符串的表单推送。
  - 返回 `{ success, count, records }`。
  - `GET /api/crm/push` 返回接口说明，方便对接方确认地址。
- 已新增对接文档：`doc/CRM推送接口对接文档.md`。
- 已做非 build/test 静态复核：
  - 确认新增接口文件位于 `app/api/crm/push/route.ts`。
  - 确认 `crm_records` 建表、索引、入库逻辑集中在 `lib/server/crmRepository.ts`。
- 本轮不会运行 `npm run build`，不会运行任何 test 测试命令。

---

# 进度记录：角色管理与全角色考试入口

## 2026-05-06

- 已读取用户要求：员工管理能把员工改管理员；管理员后台也要有员工考试功能；所有角色都有考试功能。
- 已梳理：
  - `app/admin/users/page.tsx` 当前只展示员工，只能添加员工。
  - `components/ClientLayout.tsx` 当前禁止管理员访问 `/student`。
  - `app/student/page.tsx` 考试页逻辑基于 `currentUser.id`，可被管理员复用。
- 已修改 `components/ClientLayout.tsx`：
  - 管理员不再被阻止访问 `/student`。
  - 管理员导航的“培训考试”下新增“我的考试”和“考试记录”，复用现有员工考试页。
- 已修改 `app/admin/users/page.tsx`：
  - 员工管理改为展示全部用户。
  - 角色列显示管理员/员工 Badge。
  - 支持“设为管理员 / 改为员工”。
  - 阻止把最后一个管理员降级，避免后台锁死。
  - 禁止修改当前登录用户自己的角色。
- 已修改 `app/student/page.tsx`：
  - 管理员进入考试页时显示管理员也可考试的说明。
- 已做非 build/test 静态复核：
  - `rg "pathname\\.startsWith\\('/student'\\)" components/ClientLayout.tsx` 无匹配，管理员不再被拦截到后台。
  - 确认管理员导航和员工导航均有“我的考试/考试记录”。
  - 确认用户管理有“设为管理员/改为员工”和“至少需要保留一个管理员”的保护。
- 未运行 `npm run build`，未运行任何 test 测试命令。

---

# 进度记录：接入飞书登录

## 2026-05-06

- 已读取用户要求：参考 `/mnt/e/dev/gjj` 飞书登录，飞书登录后角色都是员工。
- 已使用 `brainstorming` 和 `planning-with-files`；因用户禁止 test，本轮不执行 TDD 测试步骤。
- 已读取当前 `app/login/page.tsx`：现为本地用户名/密码登录，成功后 `setCurrentUser()` 并按角色跳转。
- 已初步列出参考项目文件，发现飞书登录相关文件：
  - `/mnt/e/dev/gjj/backend/module/auth/service/feishu.go`
  - `/mnt/e/dev/gjj/backend/module/auth/service/feishu_config.go`
  - `/mnt/e/dev/gjj/backend/module/auth/api/auth.go`
  - `/mnt/e/dev/gjj/front/client/src/features/auth/feishu.ts`
  - `/mnt/e/dev/gjj/front/client/src/pages/LoginPage/LoginPage.tsx`
- 已读取参考实现和当前用户持久化仓库。
- 已确认当前项目缺少单用户 upsert；本轮会新增仓库函数，避免飞书登录时全量替换 AppData。
- 已确定最小接入方案：
  - 新增服务端飞书登录模块。
  - 新增 `/api/auth/feishu/config`、`/api/auth/feishu/login`。
  - 新增客户端飞书 SDK helper。
  - 改造登录页：保留本地管理员登录，增加飞书登录按钮和飞书内自动登录。
- 已完成实现：
  - 新增 `lib/server/feishuAuth.ts`，复用当前飞书 AppID/AppSecret，按参考项目流程用 code 换飞书用户身份。
  - 新增 `upsertUser()`，飞书用户写入 SQLite `users`，角色固定为 `student`。
  - 新增 `/api/auth/feishu/config` 和 `/api/auth/feishu/login`。
  - 新增 `lib/client/feishuLogin.ts`，支持飞书 H5 SDK `requestAuthCode` 和浏览器 OAuth URL。
  - 重写 `app/login/page.tsx`：员工飞书登录；管理员本地账号登录；飞书登录后进入员工考试页。
- 本地账号登录已限制为管理员角色，员工不再走本地密码入口。
- 已做非 build/test 静态复核：
  - `rg "role: 'student'|role !== 'admin'|upsertUser|/api/auth/feishu/config|/api/auth/feishu/login|requestAuthCode|authen/v1/access_token" ...` 确认关键链路存在。
  - `find app/api/auth/feishu -type f` 确认新增 `config/route.ts` 与 `login/route.ts`。
  - `app/login/page.tsx` 已不使用 `useSearchParams`，避免登录页额外 Suspense 要求。
- 未运行 `npm run build`，未运行任何 test 测试命令。
- 复核飞书登录链路时发现并修正角色覆盖细节：
  - 新飞书用户仍默认员工。
  - 已存在用户如果在后台被改成管理员，后续飞书登录保留已有角色，不再被覆盖回员工。
  - `upsertUser()` 新增 `preserveExistingRole` 选项，飞书登录调用该选项。

---

# 进度记录：修复多维表格生成应用 WrongRequestBody

## 2026-05-06

- 已按系统化调试流程先定位链路，未直接猜测修改。
- 已读取：
  - `app/api/ai-apps/generate/route.ts`
  - `lib/dynamic-apps/feishuAppBuilder.ts`
  - `lib/server/feishuClient.ts`
- 已对照飞书“列出记录”接口文档：读取记录可用 GET `/records`，参数放 Query。
- 当前判断：`WrongRequestBody` 来自生成应用读取样例记录时使用了 POST `/records/search` 请求体；本场景应改为 GET 列出记录。
- 已修改 `lib/server/feishuClient.ts`：
  - 新增 `buildQueryString()` 统一构造 query。
  - `searchFeishuBitableRecords()` 保持函数签名不变，但底层改为 GET `/records`。
  - `page_size/page_token/view_id/field_names` 统一放到 Query 参数中。
- 已做非 build/test 静态复核：
  - `rg "records/search" lib/server/feishuClient.ts app lib/dynamic-apps` 无匹配。
  - `rg "POST|body: JSON.stringify" lib/server/feishuClient.ts` 只剩获取 tenant token 的认证请求。
  - `rg "/bitable/v1/apps/.*records" lib/server/feishuClient.ts` 确认为 GET `/records${query}`。
- 未运行 `npm run build`，未运行任何 test 测试命令。
- 用户反馈仍为 `{ error: "WrongRequestBody" }`。
- 第二轮判断：需要进一步定位具体失败接口，并对记录读取中的可选 query 做自动降级。
- 已做第二轮修复：
  - `readJson()` 错误消息增加脱敏接口路径和错误码。
  - `feishuFetch()` 不再给 GET 请求强制加 `Content-Type: application/json`。
  - `parseFeishuBitableUrl()` 兼容 URL 末尾分号/空白，并支持从 hash 中读取 `table/view`。
  - `searchFeishuBitableRecords()` 遇到 `WrongRequestBody` 时，会去掉 `field_names/view_id`，用最小 query 重试一次。
  - `buildDynamicAppFromFeishu()` 不再因为样例记录读取失败阻断应用生成；字段元数据可用就先生成应用。
- 已做非 build/test 静态复核：
  - `rg "records/search|body: JSON.stringify\\(body\\)" lib/server/feishuClient.ts lib/dynamic-apps/feishuAppBuilder.ts app` 无匹配。
  - 确认 `searchFeishuBitableRecords()` 仍走 GET `/records`。
  - 确认 `buildDynamicAppFromFeishu()` 已捕获样例记录读取失败，不阻断生成。
- 未运行 `npm run build`，未运行任何 test 测试命令。
- 用户提供新错误：`WrongRequestBody（接口：/bitable/v1/apps/<app_token>/tables，错误码：1254001）`。
- 第三轮判断：错误来自列数据表接口自身，当前请求带 `page_size=100`；该参数不是生成应用必需项，应改成最小 query。
- 已修改 `lib/server/feishuClient.ts`：
  - `readFeishuBitableTables()` 去掉 `page_size=100`，仅分页时传 `page_token`。
  - `readFeishuBitableFields()` 同步去掉 `page_size=100`，避免列字段接口出现同类请求体错误。
- 已做非 build/test 静态复核：
  - `rg "tables\\?page_size|fields\\?page_size|page_size=100" lib/server/feishuClient.ts` 无匹配。
  - 确认列数据表/列字段都只通过 `buildQueryString({ page_token })` 构造最小分页 query。

---

# 进度记录：隐藏知识库/同步来源并优化成绩阅卷

## 2026-05-06

- 已读取用户要求与项目约束：中文回复，不运行 build/test，只在 `gjj` 内开发。
- 已使用 `using-superpowers`、`brainstorming`、`planning-with-files`；因用户禁止 test，本轮不执行 TDD 的测试创建/运行步骤。
- 已建立本轮计划、发现、进度记录。
- 已静态梳理管理端导航、飞书设置页、成绩管理/复核页、学生考试提交页和评分逻辑。
- 已隐藏管理端“知识库管理”：
  - 侧边栏移除入口。
  - 路由预热移除 `/admin/knowledge`。
  - `/admin/knowledge` 直接重定向到 `/admin`。
  - 管理首页移除“知识库文章”统计卡，相关文案改为“飞书资料学习/已同步资料”口径。
- 已隐藏飞书设置里的“同步来源”配置表；服务端 sources 能力保留，页面只展示应用凭据和同步/保存按钮。
- 已将成绩评分改为优先自动：
  - `gradeAttempt()` 对简答/情景/论述/话术改写尝试自动评分。
  - 有选项答案的主观题按选项自动判定。
  - 有参考要点/评分标准的文本题按关键词命中率给分并写入系统评语。
  - 无法提取参考要点时才进入人工处理。
- 已把成绩管理的“阅卷”口径调整为“处理/复核/评分状态”，保留详情页用于偶尔抽查修正。
- 已做非 build/test 静态复核：
  - `rg "知识库管理|同步来源|待阅卷|人工阅卷|管理员阅卷|阅卷得分|知识库文章" app components lib store` 无匹配。
  - `rg "/admin/knowledge|/student/knowledge|BookOpen" components/ClientLayout.tsx app/admin/page.tsx app/admin/knowledge/page.tsx` 无匹配。
  - `rg "Table|Badge|updateSource|来源</TableHead>|飞书链接或 token" app/admin/feishu/page.tsx` 无匹配。
  - 确认 `lib/training/exam.ts` 新增 `autoGradeManualAnswer()`、`readReferenceKeywords()`，交卷时优先自动评分。
- 未运行 `npm run build`，未运行任何 test 测试命令。

---

# 进度记录：考试页首次进入卡顿排查

## 2026-04-30

- 已使用系统化调试流程，不先归因到 Next.js。
- 已读取学生考试列表页、考试详情页、状态持久化客户端、考试记录 API route。
- 已确认新考试入口当前会等待 SQLite 保存请求完成后才跳转。
- 已修改学生考试列表页：新考试立即跳转，考试记录后台保存；继续考试路由提前 prefetch；按钮进入中防重复点击。
- 已根据“所有页面首次慢”的补充反馈，给 `ClientLayout` 增加登录后的路由预取；开发模式下额外后台 fetch 主要页面，提前触发 Next dev 路由编译。
- 未运行 `npm run build`，未运行任何 test 测试命令。

---

# 进度记录：AI 情景训练

## 2026-05-09

- 已在隔离 worktree `/data/project/gjj/wenda/.worktrees/ai-scenario-training` 实现 AI 情景训练第一版闭环。
- 已新增 AI 训练数据模型和 SQLite 持久化：
  - 训练场景、场景文档、评分维度、红线规则、训练会话、训练报告。
  - 兼容早期本地 legacy payload，写入前会正规化为当前字段模型。
- 已新增管理员“情景训练”场景管理：
  - 支持新建、编辑、发布、下线、删除场景。
  - 支持 DOCX/TXT/MD 本地资料上传，不支持 PDF。
  - 支持编辑评分维度和红线规则，并校验发布时总分为 100。
- 已新增 AI 接口：
  - `/api/ai-training/chat` 生成角色扮演回复。
  - `/api/ai-training/report` 生成结构化训练报告。
  - 路由会校验服务端已保存会话，使用系统指令隔离不可信资料/对话，报告 JSON 严格校验。
- 已新增员工 AI 情景训练入口：
  - 员工只看到已发布场景。
  - 可开始训练、进入多轮对话、结束训练并生成报告。
  - AI 回复失败时保留员工已发送消息；报告生成失败时保留进行中会话。
- 已新增报告和记录页：
  - 员工可查看自己的训练报告。
  - 管理员可查看全部训练记录，并通过记录页进入报告详情。
  - 管理员查看员工会话/报告为只读，不能冒充员工继续训练。
- 已验证：
  - `APP_BASE_URL=http://localhost:3017 npm run test:ai-training-state` 通过。
  - `APP_BASE_URL=http://localhost:3017 npm run test:ai-training-flow` 通过。
  - `npx tsc --noEmit --pretty false` 通过。
  - `npm run build` 通过。
- 已知限制：
  - `npm run lint` 仍失败，失败点来自实现前已存在的 React lint 基线问题，包括旧页面 effect 内同步 setState、考试页 render 阶段 `Date.now()`、`FeishuRuntimeScripts` 的 script 策略 warning。
  - AI 情景训练分数仅作训练反馈，不影响考试成绩、通过状态或重考状态。
