# HTTP 请求与开放 API 入门

## 学习目标

- 理解请求、响应、状态码和 JSON
- 会调用一个简单的开放 API
- 了解“程序接外部服务”时最需要注意什么

## 先别急着背术语

HTTP 请求你可以先理解成：  
“我的程序给另一个服务发一条消息，对方回我一个结果。”

最常见的几个概念：

- URL：要访问的地址
- Method：做什么操作，最常见是 `GET`
- Status Code：请求结果状态
- JSON：很常见的数据交换格式

## 一个最小例子

```python
import requests

response = requests.get("https://api.github.com")
print(response.status_code)
print(response.json())
```

## 写这类代码时要记住

- 网络请求可能失败
- 对方可能很慢
- 返回的数据结构不一定永远不变

## 参考文献

- [requests Quickstart](https://requests.readthedocs.io/en/latest/user/quickstart/)
- [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/)

## 推荐论文 / 文章

- [MapReduce: Simplified Data Processing on Large Clusters](https://research.google.com/archive/mapreduce-osdi04.pdf)
  等你开始接触更大规模的数据和服务时，这篇文章会让你对“分布式处理”有初步感觉。
