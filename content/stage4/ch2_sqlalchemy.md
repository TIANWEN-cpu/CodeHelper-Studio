# 阶段四：SQLAlchemy 进阶

## 1. ORM 思想

对象关系映射（Object-Relational Mapping）允许我们使用 Python 类来描述数据库表，将行数据映射为对象实例。

## 2. 核心组件

- **Engine**: 数据库连接引擎。
- **Base**: 所有模型的基类。
- **Session**: 数据库会话，处理事务。

## 3. 示例代码

```python
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String)
```
