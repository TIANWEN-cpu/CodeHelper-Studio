# 方法、字符串与常见集合

## 学习目标

- 会定义带参数和返回值的方法
- 会使用 `List` 和 `Dictionary`
- 能写出基础的数据处理逻辑

## 方法是边界，不只是语法

当你能清楚地说出“这个方法接收什么、返回什么”，代码通常就会更稳。

```csharp
int Add(int a, int b)
{
    return a + b;
}
```

## 常见集合

- `List<T>`：有顺序的一组元素
- `Dictionary<TKey, TValue>`：键值映射

## 学会一个习惯

别急着写大段流程，先想：

- 我的输入是什么？
- 我的返回值是什么？
- 这段逻辑值得单独成一个方法吗？

## 参考文献

- [C# Methods](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/methods)
- [Collection types in C#](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/collections)

## 推荐论文 / 文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  方法和模块边界的感觉，越早建立越值钱。
