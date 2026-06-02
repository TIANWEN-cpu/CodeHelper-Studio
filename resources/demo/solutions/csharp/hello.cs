# Hello C# - C# 题解

## 解法

```csharp
using System;

class Program {
    static void Main() {
        string name = Console.ReadLine();
        Console.WriteLine($"Hello, {name}!");
    }
}
```

## 核心知识点
- `Console.ReadLine()` 从标准输入读取一行
- `$"..."` 字符串插值（C# 6+），内嵌变量更直观
- 也可使用 `string.Format("Hello, {0}!", name)`
