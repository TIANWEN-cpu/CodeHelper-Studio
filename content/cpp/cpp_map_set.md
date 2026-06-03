# map、set 与关联容器

## 课程概述

关联容器是 C++ STL 中用于存储键值对或唯一元素的容器。`std::map` 和 `std::set` 基于红黑树实现，保持元素有序；`std::unordered_map` 和 `std::unordered_set` 基于哈希表实现，提供平均 O(1) 的查找性能。理解它们的区别和适用场景，对写出高效的代码至关重要。

## std::map：有序键值对

`std::map` 基于红黑树（自平衡二叉搜索树）实现，按键排序，查找、插入、删除的时间复杂度均为 O(log n)：

```cpp
#include <iostream>
#include <map>
#include <string>

int main() {
    // 创建 map
    std::map<std::string, int> scores;

    // 插入元素
    scores["Alice"] = 95;
    scores["Bob"] = 87;
    scores["Charlie"] = 92;

    // 使用 insert（不会覆盖已有键）
    scores.insert({"David", 88});
    scores.insert(std::make_pair("Eve", 91));

    // 访问元素
    std::cout << "Alice: " << scores["Alice"] << std::endl;

    // 使用 at（带边界检查，键不存在时抛异常）
    try {
        std::cout << "Bob: " << scores.at("Bob") << std::endl;
        // std::cout << scores.at("Frank") << std::endl;  // 抛异常！
    } catch (const std::out_of_range& e) {
        std::cout << "键不存在: " << e.what() << std::endl;
    }

    // 使用 find（键不存在时返回 end()）
    auto it = scores.find("Charlie");
    if (it != scores.end()) {
        std::cout << "找到 Charlie: " << it->second << std::endl;
    }

    // 遍历（按键排序）
    std::cout << "所有成绩（按名字排序）:" << std::endl;
    for (const auto& [name, score] : scores) {
        std::cout << "  " << name << ": " << score << std::endl;
    }

    // 删除元素
    scores.erase("Bob");
    std::cout << "删除 Bob 后大小: " << scores.size() << std::endl;

    return 0;
}
```

### map 的关键特性

```cpp
#include <iostream>
#include <map>

int main() {
    std::map<std::string, int> ages;

    // [] 运算符：键不存在时会自动创建（值为默认值 0）
    std::cout << "不存在的键: " << ages["NewPerson"] << std::endl;  // 输出 0
    std::cout << "大小: " << ages.size() << std::endl;  // 1！自动插入了

    // 检查键是否存在
    if (ages.count("NewPerson")) {
        std::cout << "NewPerson 存在" << std::endl;
    }

    // contains（C++20）
    // if (ages.contains("NewPerson")) { ... }

    // 范围查询
    std::map<int, std::string> sorted = {
        {3, "three"}, {1, "one"}, {4, "four"}, {1, "one"}, {5, "five"}
    };
    // 按键排序后：{1: "one"}, {3: "three"}, {4: "four"}, {5: "five"}
    // 注意：键 1 只出现一次（map 的键唯一）

    for (const auto& [k, v] : sorted) {
        std::cout << k << ": " << v << std::endl;
    }

    return 0;
}
```

## std::unordered_map：哈希表

`std::unordered_map` 基于哈希表实现，平均查找/插入/删除时间复杂度为 O(1)，但元素无序：

```cpp
#include <iostream>
#include <unordered_map>
#include <string>

int main() {
    std::unordered_map<std::string, int> scores;

    scores["Alice"] = 95;
    scores["Bob"] = 87;
    scores["Charlie"] = 92;

    // 遍历（无序）
    std::cout << "所有成绩（无序）:" << std::endl;
    for (const auto& [name, score] : scores) {
        std::cout << "  " << name << ": " << score << std::endl;
    }

    // 与 map 相同的接口
    std::cout << "Alice: " << scores.at("Alice") << std::endl;
    std::cout << "大小: " << scores.size() << std::endl;

    return 0;
}
```

## std::set 与 std::unordered_set

`set` 存储唯一元素，`unordered_set` 是其哈希表版本：

```cpp
#include <iostream>
#include <set>
#include <unordered_set>

int main() {
    // set：有序、唯一
    std::set<int> s = {5, 3, 8, 1, 3, 5};  // 重复的 3 和 5 被忽略
    std::cout << "set（有序）: ";
    for (int n : s) std::cout << n << " ";  // 1 3 5 8
    std::cout << std::endl;

    // unordered_set：无序、唯一
    std::unordered_set<int> us = {5, 3, 8, 1, 3, 5};
    std::cout << "unordered_set（无序）: ";
    for (int n : us) std::cout << n << " ";
    std::cout << std::endl;

    // 常用操作
    s.insert(10);
    s.erase(3);

    if (s.count(5)) {
        std::cout << "5 在 set 中" << std::endl;
    }

    // 查找
    auto it = s.find(8);
    if (it != s.end()) {
        std::cout << "找到: " << *it << std::endl;
    }

    return 0;
}
```

## 何时使用哪个容器

| 容器            | 底层   | 有序 | 查找      | 插入      | 适用场景               |
| --------------- | ------ | ---- | --------- | --------- | ---------------------- |
| `map`           | 红黑树 | 是   | O(log n)  | O(log n)  | 需要有序遍历、范围查询 |
| `unordered_map` | 哈希表 | 否   | O(1) 平均 | O(1) 平均 | 快速查找、不需要有序   |
| `set`           | 红黑树 | 是   | O(log n)  | O(log n)  | 去重+有序              |
| `unordered_set` | 哈希表 | 否   | O(1) 平均 | O(1) 平均 | 快速去重、成员检查     |

**选择指南**：

- 需要有序遍历或范围查询 → 用 `map`/`set`
- 只需要快速查找 → 用 `unordered_map`/`unordered_set`
- 不确定时 → 先用 `unordered_map`（通常更快）

## 自定义哈希函数

对于自定义类型，需要为 `unordered_map`/`unordered_set` 提供哈希函数：

```cpp
#include <iostream>
#include <unordered_map>
#include <string>

struct Point {
    int x, y;

    bool operator==(const Point& other) const {
        return x == other.x && y == other.y;
    }
};

// 为 Point 提供哈希函数
struct PointHash {
    std::size_t operator()(const Point& p) const {
        // 简单的哈希组合
        return std::hash<int>()(p.x) ^ (std::hash<int>()(p.y) << 1);
    }
};

int main() {
    std::unordered_map<Point, std::string, PointHash> pointNames;
    pointNames[{1, 2}] = "起点";
    pointNames[{5, 8}] = "终点";

    std::cout << pointNames[{1, 2}] << std::endl;

    return 0;
}
```

对于 `map`/`set`，需要提供比较运算符（`operator<`）：

```cpp
#include <iostream>
#include <set>

struct Point {
    int x, y;

    // map/set 需要 operator< 来排序
    bool operator<(const Point& other) const {
        if (x != other.x) return x < other.x;
        return y < other.y;
    }
};

int main() {
    std::set<Point> points = {{3, 4}, {1, 2}, {3, 1}};
    for (const auto& p : points) {
        std::cout << "(" << p.x << ", " << p.y << ")" << std::endl;
    }
    return 0;
}
```

## 性能对比

```cpp
#include <iostream>
#include <map>
#include <unordered_map>
#include <chrono>
#include <random>

int main() {
    const int N = 1000000;
    std::mt19937 rng(42);

    // 测试 map
    std::map<int, int> m;
    auto start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < N; ++i) {
        m[rng()] = i;
    }
    auto end = std::chrono::high_resolution_clock::now();
    std::cout << "map 插入 " << N << " 个元素: "
              << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count()
              << " ms" << std::endl;

    // 测试 unordered_map
    std::unordered_map<int, int> um;
    start = std::chrono::high_resolution_clock::now();
    for (int i = 0; i < N; ++i) {
        um[rng()] = i;
    }
    end = std::chrono::high_resolution_clock::now();
    std::cout << "unordered_map 插入 " << N << " 个元素: "
              << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count()
              << " ms" << std::endl;

    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：[] 运算符自动插入

```cpp
std::map<std::string, int> m;
// int val = m["nonexistent"];  // 自动插入 "nonexistent" → 0！
// 使用 find 或 at 来检查
auto it = m.find("nonexistent");
if (it != m.end()) {
    int val = it->second;
}
```

### 陷阱 2：迭代器失效

```cpp
// map/set 的 erase 只使被删除元素的迭代器失效
// 其他迭代器仍然有效
std::map<int, int> m = {{1, 10}, {2, 20}, {3, 30}};
auto it = m.begin();
m.erase(2);
// it 仍然有效（除非它指向被删除的元素）
```

### 最佳实践

1. **不需要有序时用 `unordered_map`**（更快）
2. **用 `find` 而非 `[]` 检查键是否存在**
3. **自定义类型用作 unordered 容器的键时，提供 `operator==` 和哈希函数**
4. **用 `emplace` 代替 `insert` 避免临时对象**
5. **大量插入时考虑 `reserve`（unordered 容器）**

## 练习

### 练习 1：词频统计

读取一段文本，用 `unordered_map<string, int>` 统计每个单词出现的次数。

### 练习 2：电话簿

用 `map<string, string>` 实现电话簿，支持添加、查找、删除联系人。

### 练习 3：去重

用 `set` 对一组整数去重并排序。

### 练习 4：自定义类型

为 `struct Student { string name; int id; }` 实现 `unordered_set` 所需的哈希函数。

### 练习 5：性能对比

分别用 `map` 和 `unordered_map` 插入 10 万个元素，比较性能差异。

## 参考链接

- [std::map - cppreference](https://en.cppreference.com/w/cpp/container/map)
- [std::unordered_map - cppreference](https://en.cppreference.com/w/cpp/container/unordered_map)
- [std::set - cppreference](https://en.cppreference.com/w/cpp/container/set)
- [std::unordered_set - cppreference](https://en.cppreference.com/w/cpp/container/unordered_set)
- [std::hash - cppreference](https://en.cppreference.com/w/cpp/utility/hash)
