# JSON、Pathlib 与项目数据读写

## 你会学到

- 会把 Python 数据写成 JSON
- 会用 pathlib 拼路径和判断文件存在
- 知道小项目如何把内存数据落到本地

## 为什么这节课重要

很多练习题只停留在内存里，但真实工具往往需要保存状态。JSON 和 pathlib 就是从“会写函数”走向“会做工具”的关键一步。

## 核心知识

- `json.dump` / `json.load` 解决数据交换
- `Path` 对象让路径操作更清晰
- 先确定数据结构，再决定如何保存

## 示例

```python
from pathlib import Path
import json

path = Path("data") / "user.json"
path.parent.mkdir(exist_ok=True)
payload = {"name": "Tom", "city": "Shanghai", "active": True}
path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
```

## 常见误区

- 直接拼接字符串路径，跨平台时容易乱
- 忘记指定 UTF-8，中文可能出问题
- 一边改数据结构，一边不更新读写逻辑

## 继续练什么

- 把待办事项列表保存到本地 JSON
- 读取 JSON 后统计其中 `active` 为 `True` 的人数

## 参考资料

- [pathlib — Object-oriented filesystem paths](https://docs.python.org/3/library/pathlib.html)
- [json — JSON encoder and decoder](https://docs.python.org/3/library/json.html)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  把数据结构、路径和持久化分开，是模块化思维的开始。
