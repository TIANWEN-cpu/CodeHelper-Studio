# sort、find 等 STL 算法

## 课程概述

STL 算法是 C++ 标准库中最强大的工具之一。它们通过迭代器操作容器，与容器本身解耦，使得同一套算法可以适用于 vector、list、array 等所有标准容器。本章将系统学习排序、查找、修改、数值等常用算法，以及它们的复杂度特性。

## 排序算法

### std::sort

`std::sort` 是最常用的排序算法，采用 Introsort（内省排序），平均时间复杂度 O(n log n)：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

int main() {
    // 基本排序（升序）
    std::vector<int> nums = {5, 3, 8, 1, 9, 2, 7};
    std::sort(nums.begin(), nums.end());
    std::cout << "升序: ";
    for (int n : nums) std::cout << n << " ";  // 1 2 3 5 7 8 9
    std::cout << std::endl;

    // 降序排序
    std::vector<int> nums2 = {5, 3, 8, 1, 9};
    std::sort(nums2.begin(), nums2.end(), std::greater<int>());
    std::cout << "降序: ";
    for (int n : nums2) std::cout << n << " ";  // 9 8 5 3 1
    std::cout << std::endl;

    // 自定义比较函数
    std::vector<std::string> words = {"banana", "apple", "cherry", "date"};
    std::sort(words.begin(), words.end(),
        [](const std::string& a, const std::string& b) {
            return a.length() < b.length();  // 按长度排序
        });
    std::cout << "按长度排序: ";
    for (const auto& w : words) std::cout << w << " ";
    std::cout << std::endl;

    return 0;
}
```

### std::stable_sort

`stable_sort` 保证相等元素的相对顺序不变（稳定排序）：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

struct Student {
    std::string name;
    int score;
};

int main() {
    std::vector<Student> students = {
        {"Alice", 85}, {"Bob", 90}, {"Charlie", 85}, {"David", 90}
    };

    // stable_sort：分数相同的学生保持原有顺序
    std::stable_sort(students.begin(), students.end(),
        [](const Student& a, const Student& b) {
            return a.score > b.score;
        });

    std::cout << "按分数降序（稳定）:" << std::endl;
    for (const auto& s : students) {
        std::cout << "  " << s.name << ": " << s.score << std::endl;
    }
    // Alice 在 Charlie 之前（原有顺序被保留）
    // Bob 在 David 之前

    return 0;
}
```

### std::partial_sort

`partial_sort` 只排序前 n 个元素，比完全排序更快：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> nums = {5, 3, 8, 1, 9, 2, 7, 4, 6};

    // 只找出最小的 3 个元素并排序
    std::partial_sort(nums.begin(), nums.begin() + 3, nums.end());

    std::cout << "前 3 个最小: ";
    for (int i = 0; i < 3; ++i) std::cout << nums[i] << " ";  // 1 2 3
    std::cout << std::endl;

    std::cout << "其余（无序）: ";
    for (size_t i = 3; i < nums.size(); ++i) std::cout << nums[i] << " ";
    std::cout << std::endl;

    return 0;
}
```

## 查找算法

### std::find

`std::find` 线性查找，适用于任何容器：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

int main() {
    std::vector<int> nums = {10, 20, 30, 40, 50};

    // 查找元素
    auto it = std::find(nums.begin(), nums.end(), 30);
    if (it != nums.end()) {
        std::cout << "找到 30，位置: " << std::distance(nums.begin(), it) << std::endl;
    }

    // 查找不存在的元素
    auto notFound = std::find(nums.begin(), nums.end(), 99);
    if (notFound == nums.end()) {
        std::cout << "99 不存在" << std::endl;
    }

    // 用 lambda 查找满足条件的元素
    auto firstEven = std::find_if(nums.begin(), nums.end(),
        [](int n) { return n % 2 == 0; });
    if (firstEven != nums.end()) {
        std::cout << "第一个偶数: " << *firstEven << std::endl;
    }

    return 0;
}
```

### std::binary_search

`binary_search` 在有序范围内二分查找，O(log n)：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> nums = {1, 3, 5, 7, 9, 11, 13};  // 必须有序！

    std::cout << "5 存在: " << std::binary_search(nums.begin(), nums.end(), 5) << std::endl;
    std::cout << "6 存在: " << std::binary_search(nums.begin(), nums.end(), 6) << std::endl;

    return 0;
}
```

### std::lower_bound 与 std::upper_bound

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> nums = {1, 3, 3, 3, 5, 7, 9};

    // lower_bound: 第一个 >= value 的位置
    auto lb = std::lower_bound(nums.begin(), nums.end(), 3);
    std::cout << "lower_bound(3): " << *lb << " (位置 " << std::distance(nums.begin(), lb) << ")" << std::endl;

    // upper_bound: 第一个 > value 的位置
    auto ub = std::upper_bound(nums.begin(), nums.end(), 3);
    std::cout << "upper_bound(3): " << *ub << " (位置 " << std::distance(nums.begin(), ub) << ")" << std::endl;

    // 统计元素 3 的个数
    auto range = std::equal_range(nums.begin(), nums.end(), 3);
    std::cout << "3 的个数: " << std::distance(range.first, range.second) << std::endl;

    return 0;
}
```

## 修改算法

### std::transform

`transform` 对范围内的每个元素应用函数，将结果写入输出迭代器：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

int main() {
    std::vector<int> nums = {1, 2, 3, 4, 5};

    // 每个元素乘以 2
    std::vector<int> doubled(nums.size());
    std::transform(nums.begin(), nums.end(), doubled.begin(),
        [](int n) { return n * 2; });

    std::cout << "翻倍: ";
    for (int n : doubled) std::cout << n << " ";  // 2 4 6 8 10
    std::cout << std::endl;

    // 转大写
    std::vector<std::string> words = {"hello", "world"};
    std::transform(words.begin(), words.end(), words.begin(),
        [](std::string s) {
            std::transform(s.begin(), s.end(), s.begin(), ::toupper);
            return s;
        });

    std::cout << "大写: ";
    for (const auto& w : words) std::cout << w << " ";
    std::cout << std::endl;

    return 0;
}
```

### std::replace 与 std::remove

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> nums = {1, 2, 3, 2, 4, 2, 5};

    // replace: 替换所有匹配的元素
    std::replace(nums.begin(), nums.end(), 2, 20);
    std::cout << "replace 2→20: ";
    for (int n : nums) std::cout << n << " ";  // 1 20 3 20 4 20 5
    std::cout << std::endl;

    // remove: 不是真正删除，而是将不删除的元素移到前面
    std::vector<int> v = {1, 2, 3, 2, 4, 2, 5};
    auto newEnd = std::remove(v.begin(), v.end(), 2);
    std::cout << "remove 2 后: ";
    for (auto it = v.begin(); it != newEnd; ++it) std::cout << *it << " ";  // 1 3 4 5
    std::cout << std::endl;

    // erase-remove idiom: 真正删除
    v.erase(newEnd, v.end());
    std::cout << "erase 后大小: " << v.size() << std::endl;  // 4

    return 0;
}
```

## 数值算法

### std::accumulate

`accumulate` 计算范围内元素的累积和（或其他操作）：

```cpp
#include <iostream>
#include <vector>
#include <numeric>
#include <string>

int main() {
    std::vector<int> nums = {1, 2, 3, 4, 5};

    // 求和（第三个参数是初始值）
    int sum = std::accumulate(nums.begin(), nums.end(), 0);
    std::cout << "总和: " << sum << std::endl;  // 15

    // 求积
    int product = std::accumulate(nums.begin(), nums.end(), 1,
        [](int acc, int n) { return acc * n; });
    std::cout << "乘积: " << product << std::endl;  // 120

    // 字符串拼接
    std::vector<std::string> words = {"Hello", ", ", "World", "!"};
    std::string sentence = std::accumulate(words.begin(), words.end(), std::string(""));
    std::cout << sentence << std::endl;

    return 0;
}
```

### std::inner_product

```cpp
#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::vector<int> a = {1, 2, 3};
    std::vector<int> b = {4, 5, 6};

    // 点积：1*4 + 2*5 + 3*6 = 32
    int dotProduct = std::inner_product(a.begin(), a.end(), b.begin(), 0);
    std::cout << "点积: " << dotProduct << std::endl;

    return 0;
}
```

## 算法复杂度速查

| 算法            | 时间复杂度  | 说明             |
| --------------- | ----------- | ---------------- |
| `sort`          | O(n log n)  | 快速排序变体     |
| `stable_sort`   | O(n log² n) | 稳定排序         |
| `partial_sort`  | O(n log k)  | k 为排序元素个数 |
| `find`          | O(n)        | 线性查找         |
| `binary_search` | O(log n)    | 需要有序范围     |
| `lower_bound`   | O(log n)    | 需要有序范围     |
| `transform`     | O(n)        | 遍历一次         |
| `replace`       | O(n)        | 遍历一次         |
| `remove`        | O(n)        | 遍历一次         |
| `accumulate`    | O(n)        | 遍历一次         |
| `unique`        | O(n)        | 需要已排序       |
| `count`         | O(n)        | 遍历一次         |
| `min_element`   | O(n)        | 遍历一次         |
| `max_element`   | O(n)        | 遍历一次         |

## 常见陷阱与最佳实践

### 陷阱 1：remove 不真正删除

```cpp
std::vector<int> v = {1, 2, 3, 2, 4};
std::remove(v.begin(), v.end(), 2);
// v 的大小没变！需要用 erase 配合
v.erase(std::remove(v.begin(), v.end(), 2), v.end());
```

### 陷阱 2：对无序容器用 binary_search

```cpp
std::vector<int> v = {5, 3, 8, 1};
// std::binary_search(v.begin(), v.end(), 3);  // 结果不可靠！必须先排序
std::sort(v.begin(), v.end());
std::binary_search(v.begin(), v.end(), 3);  // 现在正确
```

### 最佳实践

1. **优先使用 STL 算法而非手写循环**
2. **使用 erase-remove idiom 删除元素**
3. **binary_search 前确保范围已排序**
4. **用 lambda 使算法更灵活**
5. **了解算法复杂度，选择合适的算法**

## 练习

### 练习 1：排序与查找

对一个 vector 排序后，用 `binary_search` 查找指定元素。

### 练习 2：统计词频

用 `std::count` 统计 vector 中某个值出现的次数。

### 练习 3：transform 实践

用 `transform` 将 vector 中所有负数变为 0。

### 练习 4：自定义排序

对 `std::pair<int, std::string>` 按 first 降序、second 升序排序。

### 练习 5：accumulate 高级用法

用 `accumulate` 计算 vector 中所有字符串的总长度。

## 参考链接

- [STL 算法库 - cppreference](https://en.cppreference.com/w/cpp/algorithm)
- [std::sort - cppreference](https://en.cppreference.com/w/cpp/algorithm/sort)
- [std::find - cppreference](https://en.cppreference.com/w/cpp/algorithm/find)
- [std::accumulate - cppreference](https://en.cppreference.com/w/cpp/algorithm/accumulate)
- [数值算法 - cppreference](https://en.cppreference.com/w/cpp/numeric)
