# asyncio 与协程的第一印象

## 你会学到

- 读懂最小 `async/await` 代码
- 知道异步适合 IO 密集问题
- 避免把异步神化

## 为什么这节课重要

异步真正解决的是“等待期间别闲着”。如果你还没形成这个直觉，就很容易在不该用异步的地方硬套 `async/await`。

## 核心知识

- 协程是可以被挂起和恢复的函数
- 事件循环负责调度任务
- CPU 密集工作并不会因为 asyncio 自动变快

## 示例

```python
import asyncio

async def say_later():
    await asyncio.sleep(1)
    return "done"

print(asyncio.run(say_later()))
```

## 常见误区

- 把耗 CPU 的逻辑塞进 asyncio 期待提速
- 忘记 await，结果只得到 coroutine 对象
- 一上来就把整个项目异步化

## 继续练什么

- 写两个协程，分别 sleep 不同秒数并输出结果
- 比较同步请求流程和异步请求流程的差异

## 参考资料

- [A Conceptual Overview of asyncio](https://docs.python.org/3/howto/a-conceptual-overview-of-asyncio.html)

## 推荐论文 / 经典文章

- [The Reactive Manifesto](https://www.reactivemanifesto.org/)
  它不是论文体裁，但很适合建立对异步和响应性的直觉。
