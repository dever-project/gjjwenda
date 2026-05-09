# AI 情景训练功能设计

日期：2026-05-09

## 背景

现有系统已经具备题库导入、考试发布、员工考试、成绩记录和管理员复核能力。AI 情景训练作为考试后的练习反馈工具，补齐“真实业务对话演练”链路。它不改变考试成绩，不触发重考，不作为认证门槛。

第一版采用“场景脚本型”设计：管理员创建训练场景并上传本地资料，员工选择场景与 AI 进行多轮对话，结束后系统生成结构化训练报告。

## 目标

1. 管理员可以维护 AI 训练场景，包括角色、任务、开场白、评分维度、红线规则和本地资料。
2. 管理员可以上传 DOCX、TXT、MD 文件，系统抽取文本作为该场景的专属资料依据。
3. 员工可以选择已发布场景开始情景训练。
4. AI 在训练中扮演具体业务角色，例如客户、业主、债务人、家属、中介、律师或 PM。
5. AI 在训练结束后作为隐形训练官生成报告，包括总分、维度得分、亮点、问题、红线提示和推荐改法。
6. 管理员可以查看员工训练记录和训练报告。

## 非目标

1. 第一版不支持 PDF 上传。
2. 第一版不把训练分数计入考试成绩。
3. 第一版不设置通过或不通过。
4. 第一版不做排行榜、任务派发、自动推荐场景。
5. 第一版不复用飞书知识库作为资料来源，只支持本地上传。

## 用户角色

### 管理员

管理员负责配置训练场景、上传资料、发布或下架场景，并查看员工训练记录。

### 员工

员工选择场景进行模拟训练。员工是真正的系统用户，AI 扮演场景中的业务对象，并在训练结束后给出反馈。

## 信息架构

管理员导航新增“AI 情景训练”分组：

- 训练场景：创建、编辑、发布、下架场景。
- 训练记录：查看员工训练会话和报告。

员工导航新增“AI 情景训练”入口：

- 场景列表：选择已发布场景。
- 训练对话：与 AI 角色多轮对话。
- 我的记录：查看本人历史训练报告。

## 管理员场景配置

每个训练场景包含以下字段：

- 场景名称：用于列表和员工选择。
- 适用阶段：例如新人、岗位、租赁权论证、合规红线。
- 难度：基础、中等、高。
- 场景简介：说明训练背景。
- AI 角色：描述 AI 扮演对象的身份、性格、知识水平、情绪和沟通风格。
- 员工任务：说明员工在本场训练中需要完成的目标。
- AI 开场白：员工开始训练后 AI 发出的第一句话。
- 资料文本：由上传文件抽取出的文本，可由管理员查看摘要。
- 评分维度：默认 5 项，总分 100。
- 红线规则：训练中需要重点识别的越界表达或禁语。
- 状态：草稿、已发布、已下架。
- 创建时间和更新时间。

默认评分维度：

- 业务理解：20 分。
- 资料运用：20 分。
- 沟通推进：20 分。
- 话术表达：20 分。
- 合规安全：20 分。

管理员可以编辑维度名称、说明和分值，但系统需要校验总分为 100。若管理员不编辑，则使用默认维度。

## 本地资料上传

第一版支持以下文件：

- DOCX。
- TXT。
- MD。

上传规则：

- 每个场景可以上传多个文件。
- 文件上传后抽取文本并保存到场景资料中。
- DOCX 复用现有题库导入中的文本抽取思路，读取 `word/document.xml`。
- TXT 和 MD 使用 UTF-8 文本读取。
- 单个文件限制为 5MB。
- 场景资料总文本保留前 80,000 个字符，避免 AI 请求过大。

资料使用方式：

- 对话阶段：AI 角色回答和追问时参考资料，但不能把资料整段背给员工。
- 评分阶段：AI 根据资料判断员工是否正确转化核心知识点。
- 报告阶段：指出员工哪些地方没有覆盖资料中的关键要点。

## 员工训练流程

1. 员工进入 AI 情景训练场景列表。
2. 员工选择一个已发布场景。
3. 系统展示场景简介、训练目标、AI 角色、难度和资料摘要。
4. 员工点击“开始训练”。
5. 系统创建训练会话，并展示 AI 开场白。
6. 员工输入回复。
7. AI 按角色继续对话，可追问、反驳、施压或要求澄清。
8. 员工点击“结束训练”。
9. 系统生成训练报告。
10. 员工查看报告，也可以重新练习同一场景。

## AI 行为设计

AI 在对话中必须保持场景角色，不直接暴露评分标准。它应该像真实业务对象一样回应员工，而不是像老师一样讲课。

AI 对话需要遵守以下原则：

- 基于场景资料和角色设定回应。
- 不主动给员工标准答案。
- 通过追问、异议、情绪变化推动训练。
- 当员工表达模糊时要求澄清。
- 当员工出现风险表达时继续推进对话，但在最终报告中指出问题。

训练结束后，AI 切换为训练官视角，输出结构化报告。

## 训练报告

报告字段：

- 总分：0 到 100，仅作训练反馈。
- 维度评分：每个评分维度包含得分、满分、扣分原因和对话证据。
- 表现亮点：员工做得好的地方。
- 主要问题：员工需要改进的地方。
- 红线风险：命中的风险表达、风险等级、原因。
- 推荐改法：给出可直接替换的话术。
- 总结建议：下一次训练重点。

红线处理：

- 红线命中不产生通过或不通过。
- 一般风险主要扣合规安全分。
- 严重风险需要在报告中高亮。
- 合规安全维度不能高于红线风险允许的上限。例如命中严重红线时，合规安全最高 8/20。

## 数据模型

新增训练场景：

```ts
interface AiTrainingScenario {
  id: string;
  name: string;
  stage?: string;
  difficulty: '基础' | '中等' | '高';
  description: string;
  aiRole: string;
  traineeTask: string;
  openingMessage: string;
  scoringRubric: AiTrainingRubricItem[];
  redlineRules: AiTrainingRedlineRule[];
  documents: AiTrainingDocument[];
  status: 'draft' | 'published' | 'archived';
  createdAt: number;
  updatedAt: number;
}
```

新增场景文档：

```ts
interface AiTrainingDocument {
  id: string;
  fileName: string;
  fileType: 'docx' | 'txt' | 'md';
  text: string;
  uploadedAt: number;
}
```

新增评分维度：

```ts
interface AiTrainingRubricItem {
  id: string;
  name: string;
  description: string;
  maxScore: number;
}
```

新增红线规则：

```ts
interface AiTrainingRedlineRule {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}
```

新增训练会话：

```ts
interface AiTrainingSession {
  id: string;
  scenarioId: string;
  userId: string;
  status: 'in_progress' | 'completed';
  messages: AiTrainingMessage[];
  report?: AiTrainingReport;
  startedAt: number;
  endedAt?: number;
}
```

新增训练消息：

```ts
interface AiTrainingMessage {
  id: string;
  role: 'ai' | 'trainee';
  content: string;
  createdAt: number;
}
```

新增训练报告：

```ts
interface AiTrainingReport {
  totalScore: number;
  dimensionScores: AiTrainingDimensionScore[];
  strengths: string[];
  issues: string[];
  redlineHits: AiTrainingRedlineHit[];
  suggestedPhrases: string[];
  summary: string;
  generatedAt: number;
}
```

新增维度得分：

```ts
interface AiTrainingDimensionScore {
  rubricItemId: string;
  name: string;
  score: number;
  maxScore: number;
  reason: string;
  evidence: string;
}
```

新增红线命中：

```ts
interface AiTrainingRedlineHit {
  ruleId?: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  quote: string;
  reason: string;
  suggestion: string;
}
```

`AppData` 增加：

- `aiTrainingScenarios: AiTrainingScenario[]`
- `aiTrainingSessions: AiTrainingSession[]`

SQLite 增加对应表。第一版沿用现有 AppData 读写模式，保持客户端 store 和 `/api/app-state` 的一致性。

## API 设计

第一版建议使用以下 API：

- `POST /api/ai-training/chat`
  - 输入：`scenarioId`、`sessionId`、`messages`。
  - 输出：AI 下一条角色回复。

- `POST /api/ai-training/report`
  - 输入：`scenarioId`、`sessionId`、完整消息。
  - 输出：结构化训练报告。

场景和会话的持久化通过现有 `/api/app-state` 完成。若后续数据量变大，再拆成专用 CRUD API。

## AI 输出约束

聊天接口输出普通文本。

报告接口必须输出可解析 JSON，字段与 `AiTrainingReport` 对齐。服务端需要校验 JSON 字段，解析失败时返回明确错误，并允许用户重新生成报告。

## 页面设计

### 管理员训练场景页

列表包含：

- 场景名称。
- 阶段。
- 难度。
- 状态。
- 文档数量。
- 更新时间。
- 操作：编辑、发布、下架、删除。

编辑页包含：

- 基础信息区。
- AI 角色和员工任务区。
- 本地资料上传区。
- 评分维度区。
- 红线规则区。
- 保存草稿和发布按钮。

### 管理员训练记录页

列表包含：

- 员工。
- 场景。
- 总分。
- 红线风险数量。
- 训练时间。
- 操作：查看报告。

### 员工场景列表页

卡片包含：

- 场景名称。
- 阶段。
- 难度。
- 简介。
- 训练目标。
- 最近一次训练分数。
- 开始训练按钮。

### 员工训练对话页

界面包含：

- 顶部场景标题和训练目标。
- 中间对话流。
- 底部输入框。
- 结束训练按钮。
- 报告生成中的加载状态。

### 员工报告页

展示：

- 总分。
- 维度得分。
- 亮点。
- 问题。
- 红线提示。
- 推荐改法。
- 返回场景和重新训练按钮。

## 错误处理

- 文件格式不支持：提示仅支持 DOCX、TXT、MD。
- 文件过大：提示管理员压缩或拆分资料。
- DOCX 解析失败：提示文件可能不是标准 Word 文档。
- 场景未发布：员工不可开始训练。
- AI 对话失败：保留当前会话，允许重试上一条。
- 报告生成失败：允许重新生成，不丢失对话记录。
- 评分维度总分不是 100：禁止发布。

## 测试重点

1. 管理员可以创建草稿场景并保存。
2. DOCX、TXT、MD 能正确抽取文本。
3. 不支持 PDF 上传。
4. 评分维度总分不是 100 时不能发布。
5. 员工只能看到已发布场景。
6. 员工可以开始训练、发送消息、结束训练。
7. 训练报告能保存到会话记录。
8. 训练分数不影响考试记录、考试通过状态和重考状态。
9. 管理员能查看所有员工训练记录。
10. 员工只能查看自己的训练记录。

## 实施顺序建议

1. 增加类型、默认评分维度、AppData 字段和 SQLite 持久化。
2. 抽出可复用的 DOCX/TXT/MD 文本解析工具。
3. 实现管理员场景列表和编辑页。
4. 实现员工场景列表和训练会话页。
5. 接入 AI 聊天接口。
6. 接入 AI 报告接口。
7. 实现管理员训练记录和员工历史记录。
8. 做端到端验证和边界测试。

## 决策记录

- AI 不扮演泛泛的“用户”，而是扮演具体业务角色。
- 员工是真正的用户，AI 同时承担前台角色和后台训练官。
- 第一版只支持本地 DOCX、TXT、MD 上传，不支持 PDF。
- 训练分数只做反馈，不影响考试认证。
- 第一版不设置通过或不通过。
