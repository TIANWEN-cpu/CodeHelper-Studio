# 实战项目三：简易 ORM 框架

## 任务描述

实现一个类似 SQLAlchemy 风格的轻量级 ORM，支持通过类定义表结构，并实现简单的 CRUD。

## 技术要点

- 使用 **元类 (Metaclass)** 拦截类定义并建立字段映射。
- 字符串格式化生成 SQL 语句。
- 属性描述符或简单的属性访问控制。

## 核心逻辑示例

```python
class Field:
    pass

class ModelMetaclass(type):
    def __new__(cls, name, bases, attrs):
        # 映射逻辑...
        return type.__new__(cls, name, bases, attrs)
```
