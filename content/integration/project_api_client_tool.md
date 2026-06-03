# 项目八：API 数据抓取与本地整理工具

## 项目目标

调用公开 API，清洗返回的 JSON，再保存到本地文件或数据库。

## 这个项目为什么重要

- HTTP 请求
- JSON 结构处理
- 错误处理
- 小型数据流设计

## 推荐 MVP 范围

- 请求一个公开接口
- 解析返回 JSON
- 提取 2 到 3 个核心字段
- 把结果保存到本地

## 拆分建议

- 先选一个简单稳定的公开 API
- 把请求、解析、保存拆成三个函数
- 最后再考虑重试和日志

## 验收标准

- 请求失败时有明确提示
- 成功结果能被本地保存
- 输出结构清晰且字段稳定

## 参考资料

- [Python requests Quickstart](https://requests.readthedocs.io/en/latest/user/quickstart/)
- [json — JSON encoder and decoder](https://docs.python.org/3/library/json.html)

## 推荐论文 / 经典文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  网络请求项目很容易越做越大，MVP 控制尤其重要。
