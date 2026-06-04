# 标准库、虚拟环境与测试起步

## 学习目标

- 学会用标准库处理路径和 JSON
- 理解虚拟环境的作用
- 知道如何给关键函数写基础测试

## 为什么先学标准库

很多项目问题，不需要额外装库，标准库就能解决大半。

常见高频模块：

- `pathlib`：处理文件路径
- `json`：读写 JSON
- `datetime`：时间日期
- `collections`：增强数据结构

## `pathlib` 示例

```python
from pathlib import Path

base = Path("data")
file_path = base / "users.json"
print(file_path)
```

比字符串拼路径更安全，也更清晰。

## 虚拟环境

一个项目一套依赖，不要把所有包都装到全局环境。

创建虚拟环境：

```bash
python -m venv .venv
```

激活后，你在当前项目里安装的库就和别的项目隔开了。

## 为什么要测试

测试不是给大团队专用的，它首先是给“未来的你”用的。

例如：

```python
def add(a, b):
    return a + b
```

最基础的测试：

```python
def test_add():
    assert add(2, 3) == 5
```

## 学习路径建议

- 先给纯函数写测试
- 再给数据处理逻辑写测试
- 最后再碰数据库和接口测试

## 本课总结

当你开始管理环境、读标准库文档、写基础测试时，你就正式跨进“做项目”的门槛了。这一步会让你后面学数据库和后端时轻松很多。
