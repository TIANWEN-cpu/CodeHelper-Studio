# 实战项目一：Todo 命令行工具

## 任务描述

实现一个通过命令行管理的待办事项工具，支持添加、删除、查看任务，并将任务保存到本地 JSON 文件。

## 技术要点

- `json` 模块进行序列化
- `sys.argv` 或 `argparse` 处理命令行输入
- `try-except` 处理文件 IO 异常

## 代码模板

```python
import json

def load_tasks():
    try:
        with open('tasks.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

# 继续编写你的逻辑...
```
