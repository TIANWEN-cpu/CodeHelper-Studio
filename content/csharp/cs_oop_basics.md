# 类、属性与面向对象基础

## 学习目标

- 会定义类和属性
- 理解对象实例和类模板的区别
- 会做简单的现实对象建模

## 一个最小例子

```csharp
class Student
{
    public string Name { get; set; }
    public int Score { get; set; }
}
```

这段代码最重要的不是记住语法，而是理解：  
你正在把“学生”这种现实概念，变成一份程序里的结构化模型。

## 为什么 C# 很适合练 OOP

因为它的类、属性、构造和访问修饰符都比较清晰，适合你把“对象建模”练扎实。

## 参考文献

- [Classes and objects in C#](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/tutorials/classes)
- [Properties in C#](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/properties)

## 推荐论文 / 文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  它能帮助你把“类怎么拆”这件事看得更清楚。
