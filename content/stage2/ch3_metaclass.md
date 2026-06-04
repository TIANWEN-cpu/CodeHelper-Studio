# 阶段二：深度面向对象 - 元类 (Metaclass)

## 1. 万物皆对象

在 Python 中，类本身也是对象。创建类的“类”就是元类。

## 2. `type` 函数

`type` 不仅可以查看类型，还可以动态创建类：
`MyClass = type('MyClass', (BaseClass,), {'x': 5})`。

## 3. 自定义元类

通过继承 `type` 并重写 `__new__` 方法，你可以拦截类的创建过程。这是实现 ORM 框架（如 Django Models）的核心技术。
