# List 排序与去重 - C# 题解

## 解法一：LINQ

```csharp
using System;
using System.Linq;

class Program {
    static void Main() {
        int[] nums = Console.ReadLine().Split().Select(int.Parse).ToArray();
        var result = nums.Distinct().OrderBy(x => x);
        Console.WriteLine(string.Join(" ", result));
    }
}
```

## 解法二：HashSet

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

class Program {
    static void Main() {
        int[] nums = Console.ReadLine().Split().Select(int.Parse).ToArray();
        HashSet<int> set = new HashSet<int>(nums);
        List<int> sorted = set.ToList();
        sorted.Sort();
        Console.WriteLine(string.Join(" ", sorted));
    }
}
```

## 核心知识点
- `Distinct()` 去重，基于 `GetHashCode()` 和 `Equals()`
- `OrderBy()` 排序，返回 `IOrderedEnumerable`
- `HashSet<T>` 自动去重集合，插入 O(1)
- `string.Join()` 连接数组为字符串
