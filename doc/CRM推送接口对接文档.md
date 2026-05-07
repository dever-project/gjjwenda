# CRM 推送接口对接文档

版本：v1.0  
更新时间：2026-05-06

## 1. 接口用途

本接口用于接收 CRM/card-push 推送字段，并写入系统数据库表 `crm_records`。

接口会做两件事：

1. 将推送的完整原始字段保存到 `payload_json`。
2. 从原始字段中抽取常用信息到独立列，方便后续后台列表、搜索和详情展示。

字段说明来源：`doc/CRM推送字段(新).xlsx`。

## 2. 接口地址

```http
POST /api/crm/push
```

部署后完整地址示例：

```text
https://<你的系统域名>/api/crm/push
```

## 3. 鉴权说明

当前版本接口未内置鉴权参数。

如果该接口需要暴露给外部系统，建议上线时在网关或反向代理层增加以下任一保护：

- IP 白名单
- 固定 Token 请求头
- 签名校验

如需系统内置 Token 校验，可约定请求头，例如：

```http
X-CRM-PUSH-TOKEN: <token>
```

## 4. 请求格式

推荐使用 JSON：

```http
Content-Type: application/json
```

接口同时兼容：

- JSON 对象
- JSON 对象数组
- `{ "records": [...] }`
- `{ "items": [...] }`
- `{ "data": [...] }`
- `application/x-www-form-urlencoded`
- `multipart/form-data`
- 表单字段中的 `data`、`records`、`items` 为 JSON 字符串

## 5. 推荐字段

接口不强制必填字段。对接方可以按 Excel 中字段原样推送。

为了后续后台展示和去重，建议至少传以下字段：

| 字段 | 说明 | 建议 |
| --- | --- | --- |
| `name` | 客户姓名 | 建议传 |
| `mobile` | 电话 | 建议传 |
| `tel` | 手机 | 可与 `mobile` 二选一 |
| `city` | 城市 | 建议传 |
| `province` | 省份 | 可选 |
| `district` | 区县/地区 | 可选 |
| `subjectName` | 项目名称 | 建议传 |
| `promotionName` | 推广渠道名称 | 建议传 |
| `promotionId` | 推广渠道 ID | 可选 |
| `searchHost` | 客户来源/渠道 | 可选 |
| `searchEngine` | 搜索引擎/平台 | 可选 |
| `chatId` | 对话 ID | 建议传，用于去重更新 |
| `chatURL` | 对话页 URL | 可选 |
| `firstUrl` | 落地页 URL | 可选 |
| `refer` | 来源页 URL | 可选 |
| `note` | 备注 | 可选 |

## 6. 幂等更新规则

接口会优先用以下字段识别同一条外部记录：

```text
cardId
recordId
clueId
leadId
chatId
chat_id
ssid
visitorStaticId
visitor_static_id
```

规则：

- 如果推送中包含以上任意字段，系统会用第一个有值的字段作为外部唯一标识。
- 相同 `外部标识字段 + 外部标识值` 再次推送时，会更新同一条 `crm_records` 记录。
- 如果外部标识没有命中已有记录，会继续按手机号去重：优先读取 `mobile`，其次读取 `tel`、`phone`。
- 手机号会去掉空格、短横线、括号，并兼容 `+86` / `86` 前缀。
- 如果没有外部标识，也没有手机号，每次推送都会新增一条记录。

建议对接方优先传 `mobile`，同时传 `chatId`、`recordId` 或业务侧稳定唯一 ID。

## 7. 单条 JSON 推送示例

请求：

```bash
curl -X POST "https://<你的系统域名>/api/crm/push" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "mobile": "13800138000",
    "city": "上海",
    "province": "上海",
    "district": "浦东新区",
    "subjectName": "DoublePlus 新人认证",
    "promotionName": "百度推广",
    "promotionId": "promo_001",
    "searchHost": "百度",
    "searchEngine": "baidu",
    "chatId": "chat_202605060001",
    "chatURL": "https://example.com/chat/202605060001",
    "firstUrl": "https://example.com/landing",
    "refer": "https://example.com/source",
    "note": "客户咨询新人认证课程"
  }'
```

成功响应：

```json
{
  "success": true,
  "count": 1,
  "records": [
    {
      "id": "crm_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "externalId": "chat_202605060001",
      "externalIdSource": "chatId",
      "name": "张三",
      "mobile": "13800138000",
      "subjectName": "DoublePlus 新人认证",
      "promotionName": "百度推广",
      "receivedAt": 1778054400000,
      "updatedAt": 1778054400000,
      "created": true
    }
  ]
}
```

说明：

- `created: true` 表示新增。
- `created: false` 表示命中外部唯一标识后更新已有记录。
- `receivedAt` 和 `updatedAt` 为毫秒时间戳。

## 8. 批量 JSON 推送示例

方式一：直接推送数组。

```json
[
  {
    "name": "张三",
    "mobile": "13800138000",
    "chatId": "chat_001"
  },
  {
    "name": "李四",
    "mobile": "13900139000",
    "chatId": "chat_002"
  }
]
```

方式二：使用 `records` 包装。

```json
{
  "records": [
    {
      "name": "张三",
      "mobile": "13800138000",
      "chatId": "chat_001"
    },
    {
      "name": "李四",
      "mobile": "13900139000",
      "chatId": "chat_002"
    }
  ]
}
```

成功响应：

```json
{
  "success": true,
  "count": 2,
  "records": [
    {
      "id": "crm_xxx",
      "externalId": "chat_001",
      "externalIdSource": "chatId",
      "name": "张三",
      "mobile": "13800138000",
      "created": true
    },
    {
      "id": "crm_yyy",
      "externalId": "chat_002",
      "externalIdSource": "chatId",
      "name": "李四",
      "mobile": "13900139000",
      "created": true
    }
  ]
}
```

## 9. 表单推送示例

如果对接方只能推送表单，可使用：

```bash
curl -X POST "https://<你的系统域名>/api/crm/push" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "name=张三" \
  --data-urlencode "mobile=13800138000" \
  --data-urlencode "chatId=chat_202605060001" \
  --data-urlencode "subjectName=DoublePlus 新人认证"
```

如果表单中只有一个 JSON 字符串字段，也支持：

```bash
curl -X POST "https://<你的系统域名>/api/crm/push" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'data={"name":"张三","mobile":"13800138000","chatId":"chat_202605060001"}'
```

## 10. 数据库存储说明

系统表：`crm_records`

常用字段会单独入列：

| 数据库列 | 来源字段 |
| --- | --- |
| `customer_name` | `name`、`repName`、`userRealName` |
| `mobile` | `mobile`、`tel`、`phone` |
| `tel` | `tel`、`mobile`、`phone` |
| `email` | `email` |
| `weixin` | `weixin`、`wx`、`wechat` |
| `qq` | `qq` |
| `province` | `province` |
| `city` | `city` |
| `district` | `district` |
| `area` | `area` |
| `subject_name` | `subjectName`、`subject_name` |
| `school_name` | `schoolName`、`school_name` |
| `company_id` | `companyId`、`company_id` |
| `company_name` | `companyName`、`company_name` |
| `promotion_id` | `promotionId`、`promotion_id` |
| `promotion_name` | `promotionName`、`promotion_name` |
| `search_host` | `searchHost`、`search_host` |
| `search_engine` | `searchEngine`、`search_engine` |
| `chat_id` | `chatId`、`chat_id` |
| `chat_url` | `chatURL`、`chatUrl`、`chat_url` |
| `first_url` | `firstUrl`、`first_url` |
| `refer_url` | `refer`、`referUrl`、`refer_url` |
| `note` | `note` |
| `payload_json` | 完整原始请求对象 |

Excel 中其他字段无需额外对接，原样传入即可，系统会完整保存到 `payload_json`。

## 11. 错误响应

### 请求体不是合法 JSON

HTTP 状态码：`400`

```json
{
  "error": "请求体不是合法 JSON"
}
```

### 请求体为空

HTTP 状态码：`400`

```json
{
  "error": "请求体不能为空"
}
```

### 批量数组中存在非对象记录

HTTP 状态码：`400`

```json
{
  "error": "第 1 条 CRM 记录必须是对象"
}
```

### 数据库写入失败

HTTP 状态码：`500`

```json
{
  "error": "CRM 推送入库失败"
}
```

## 12. 联调检查清单

对接方联调时请确认：

1. 请求地址是否为部署后的完整域名加 `/api/crm/push`。
2. 推荐使用 `POST`，不要使用 `GET` 推送数据。
3. 推荐 `Content-Type: application/json`。
4. 至少传一个客户联系方式字段，例如 `mobile` 或 `tel`。
5. 建议传稳定唯一 ID，例如 `chatId` 或 `recordId`；如果没有唯一 ID，至少传 `mobile` 用于手机号去重。
6. 收到 `success: true` 且 `count > 0` 即表示系统已接收并写入数据库。
