# 第四章：面向对象编程 (OOP)

## 1. 类与对象

类是蓝图，对象是实例。

```python
class Dog:
    def __init__(self, name):
        self.name = name

    def bark(self):
        return f"{self.name} is barking!"
```

## 2. 继承与多态

子类可以继承父类的属性和方法。
