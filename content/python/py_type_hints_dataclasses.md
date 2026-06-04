# 类型标注与 dataclass：把数据模型写清楚

## 你会学到

- 理解类型标注是“帮助理解和检查”，不是强制运行时约束
- 知道 `dataclass` 适合哪类对象
- 学会把一团散乱字段整理成稳定的数据模型

## 为什么这节课重要

很多项目不是逻辑太难，而是“数据到底长什么样”一直不清楚。类型标注和 `dataclass` 可以让你的代码更像文档，也更方便后面接测试、接数据库、接接口。

## 核心知识

- 类型标注提升可读性，也能配合工具发现问题。
- `dataclass` 适合“主要承载数据”的对象。
- 数据模型一旦清楚，函数边界也会跟着清楚。

## 示例

```python
from dataclasses import dataclass

@dataclass
class Student:
    name: str
    score: int
    active: bool = True


def passed(student: Student) -> bool:
    return student.score >= 60
```

## 你应该关注什么

- 字段名是否能清楚表达含义
- 默认值是不是合理
- 一个 `dataclass` 是否已经承担了太多职责

## 常见误区

- 以为加了类型标注就等于不会出错
- 什么对象都塞进 `dataclass`
- 在一个模型里混太多业务方法，导致边界变脏

## 小练习

- 定义一个 `LessonProgress` 数据模型
- 给 `name`、`minutes`、`completed` 加上类型
- 再写一个函数，接收它并返回进度描述文本

## 什么时候用 dataclass 很顺手

- 配置对象
- 接口返回结果的本地映射
- 练习记录、项目记录、用户资料这种“字段明确”的结构

## 参考资料

- [dataclasses — Data Classes](https://docs.python.org/3/library/dataclasses.html)
- [typing — Support for type hints](https://docs.python.org/3/library/typing.html)
- [PEP 557 – Data Classes](https://peps.python.org/pep-0557/)

## 推荐论文 / 经典文章

- [PEP 484 – Type Hints](https://peps.python.org/pep-0484/)
  它不是论文体裁，但非常适合建立“类型标注到底在解决什么问题”的直觉。
