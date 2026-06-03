# 项目十三：C# API 数据看板原型

## 项目目标

做一个最小数据看板原型，从公开 API 拉取数据后展示：

- 来源名称
- 抓取时间
- 关键统计值
- 失败时的错误提示

## 为什么这个项目值得做

它能把这些能力串起来：

- HttpClient 请求
- JSON 解析
- 异步等待
- 结果建模
- 界面或控制台展示

## 推荐 MVP 范围

第一版先只做：

- 请求 1 个公开 API
- 解析 2 到 3 个字段
- 输出成一张简化卡片

## 拆分建议

- `FetchAsync()`
- `ParseResponse()`
- `BuildCardText()`
- `RenderCard()`

## 验收标准

- 请求成功时能展示结果
- 请求失败时能给出错误提示
- 不把网络请求、解析和展示逻辑全写在一个方法里

## 参考文献

- HttpClient docs: https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient
- System.Text.Json docs: https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/overview

## 推荐阅读

- Microsoft Learn minimal APIs and HTTP workflows
