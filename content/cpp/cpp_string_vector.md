# string 与 vector 的基础操作

## 课程概述

`std::string` 和 `std::vector` 是 C++ 标准库中最常用的两个容器。它们分别提供了安全、高效的字符串和动态数组操作。本章将详细讲解它们的核心操作、性能优化技巧，以及何时使用 `reserve` 来提升性能。

## std::string 基础操作

`std::string` 是 `std::basic_string<char>` 的别名，提供了丰富的字符串操作接口：

```cpp
#include <iostream>
#include <string>

int main() {
    // 创建字符串
    std::string s1 = "Hello";
    std::string s2("World");
    std::string s3(5, 'A');       // "AAAAA"
    std::string s4 = s1 + " " + s2;  // "Hello World"

    std::cout << "s1: " << s1 << std::endl;
    std::cout << "s2: " << s2 << std::endl;
    std::cout << "s3: " << s3 << std::endl;
    std::cout << "s4: " << s4 << std::endl;

    return 0;
}
```

### 字符串拼接

```cpp
#include <iostream>
#include <string>

int main() {
    std::string greeting = "Hello";

    // 方法 1：+ 运算符
    std::string full = greeting + ", World!";

    // 方法 2：+= 运算符
    greeting += "!";
    greeting += " How are you?";

    // 方法 3：append
    std::string msg = "Hello";
    msg.append(", ");
    msg.append("DevLearner");

    // 方法 4：push_back（添加单个字符）
    std::string word = "hello";
    word.push_back('!');

    std::cout << full << std::endl;
    std::cout << greeting << std::endl;
    std::cout << msg << std::endl;
    std::cout << word << std::endl;

    return 0;
}
```

### substr、find、compare

```cpp
#include <iostream>
#include <string>

int main() {
    std::string text = "The quick brown fox jumps over the lazy dog";

    // substr: 提取子串
    std::string sub1 = text.substr(4, 5);  // 从位置 4 开始，取 5 个字符
    std::cout << "substr(4, 5): " << sub1 << std::endl;  // "quick"

    std::string sub2 = text.substr(10);    // 从位置 10 到末尾
    std::cout << "substr(10): " << sub2 << std::endl;     // "brown fox..."

    // find: 查找子串
    size_t pos = text.find("fox");
    if (pos != std::string::npos) {
        std::cout << "找到 'fox' 在位置 " << pos << std::endl;
    }

    // 从后往前找
    size_t lastPos = text.rfind("the");
    std::cout << "最后一个 'the' 在位置 " << lastPos << std::endl;

    // find_first_of: 查找任意一个字符
    size_t vowelPos = text.find_first_of("aeiou");
    std::cout << "第一个元音在位置 " << vowelPos << std::endl;

    // compare: 字符串比较
    std::string a = "apple";
    std::string b = "banana";
    std::cout << "compare: " << a.compare(b) << std::endl;  // 负数（a < b）
    std::cout << "compare: " << a.compare("apple") << std::endl;  // 0（相等）

    // 也可以直接用运算符
    std::cout << (a < b) << std::endl;   // true
    std::cout << (a == "apple") << std::endl;  // true

    return 0;
}
```

### 其他常用操作

```cpp
#include <iostream>
#include <string>

int main() {
    std::string s = "  Hello, World!  ";

    // 长度和容量
    std::cout << "长度: " << s.length() << std::endl;
    std::cout << "是否为空: " << s.empty() << std::endl;

    // 字符访问
    std::cout << "s[0]: " << s[0] << std::endl;       // 空格
    std::cout << "s.at(3): " << s.at(3) << std::endl; // 'H'（带边界检查）

    // 修改
    s[0] = 'X';
    std::cout << "修改后: " << s << std::endl;

    // 插入和删除
    std::string t = "Hello!";
    t.insert(5, ", World");  // "Hello, World!"
    std::cout << t << std::endl;

    t.erase(5, 7);  // 从位置 5 删除 7 个字符
    std::cout << t << std::endl;  // "Hello!"

    // 替换
    std::string u = "I like cats";
    u.replace(7, 4, "dogs");  // "I like dogs"
    std::cout << u << std::endl;

    // C 风格字符串
    const char* cstr = u.c_str();
    std::cout << "C 字符串: " << cstr << std::endl;

    return 0;
}
```

## std::vector 基础操作

`std::vector` 是动态数组，可以在运行时增长和缩小：

```cpp
#include <iostream>
#include <vector>

int main() {
    // 创建 vector
    std::vector<int> v1;                    // 空 vector
    std::vector<int> v2 = {1, 2, 3, 4, 5};  // 初始化列表
    std::vector<int> v3(10);                // 10 个元素，全为 0
    std::vector<int> v4(5, 42);             // 5 个元素，全为 42
    std::vector<int> v5(v2);                // 拷贝构造

    // 基本操作
    v1.push_back(10);       // 在末尾添加元素
    v1.push_back(20);
    v1.push_back(30);

    std::cout << "大小: " << v1.size() << std::endl;       // 3
    std::cout << "容量: " << v1.capacity() << std::endl;   // 可能大于 3
    std::cout << "是否为空: " << v1.empty() << std::endl;  // false

    // 访问元素
    std::cout << "v1[0]: " << v1[0] << std::endl;       // 10
    std::cout << "v1.at(1): " << v1.at(1) << std::endl; // 20（带边界检查）
    std::cout << "第一个: " << v1.front() << std::endl;  // 10
    std::cout << "最后一个: " << v1.back() << std::endl; // 30

    // 修改元素
    v1[0] = 100;
    std::cout << "修改后: " << v1[0] << std::endl;

    return 0;
}
```

### push_back、pop_back、emplace_back

```cpp
#include <iostream>
#include <vector>
#include <string>

int main() {
    std::vector<std::string> names;

    // push_back: 在末尾添加元素（拷贝或移动）
    names.push_back("Alice");
    names.push_back("Bob");

    // emplace_back: 在末尾原地构造元素（避免临时对象）
    names.emplace_back("Charlie");  // 直接在 vector 内部构造 string

    // pop_back: 删除末尾元素
    names.pop_back();  // 删除 "Charlie"

    for (const auto& name : names) {
        std::cout << name << " ";
    }
    std::cout << std::endl;

    return 0;
}
```

### size 与 capacity

`size` 是当前元素个数，`capacity` 是已分配的内存容量（能容纳的元素个数）：

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v;
    std::cout << "初始: size=" << v.size() << ", capacity=" << v.capacity() << std::endl;

    for (int i = 0; i < 10; ++i) {
        v.push_back(i);
        std::cout << "push " << i << ": size=" << v.size()
                  << ", capacity=" << v.capacity() << std::endl;
    }
    // 注意 capacity 的增长模式：通常是 2 倍增长（1, 2, 4, 8, 16...）

    return 0;
}
```

### reserve 与 resize

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v;

    // reserve: 预分配容量，不改变 size
    v.reserve(100);
    std::cout << "reserve(100): size=" << v.size()
              << ", capacity=" << v.capacity() << std::endl;
    // size 仍为 0，但 capacity 至少为 100

    // resize: 改变 size，如果增大则填充默认值或指定值
    v.resize(5);
    std::cout << "resize(5): size=" << v.size()
              << ", capacity=" << v.capacity() << std::endl;
    // size 变为 5，新增元素为 0

    v.resize(10, 42);
    std::cout << "resize(10, 42): ";
    for (int n : v) std::cout << n << " ";
    std::cout << std::endl;

    // 何时使用 reserve：
    // 1. 你知道最终会有多少元素
    // 2. 你不想让 vector 反复重新分配内存
    std::vector<int> optimized;
    optimized.reserve(1000);  // 一次性分配
    for (int i = 0; i < 1000; ++i) {
        optimized.push_back(i);  // 不会触发重新分配
    }

    return 0;
}
```

### 何时使用 reserve

```cpp
#include <iostream>
#include <vector>
#include <chrono>

int main() {
    const int N = 1000000;

    // 不使用 reserve
    auto start = std::chrono::high_resolution_clock::now();
    std::vector<int> v1;
    for (int i = 0; i < N; ++i) {
        v1.push_back(i);
    }
    auto end = std::chrono::high_resolution_clock::now();
    std::cout << "无 reserve: "
              << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count()
              << " ms" << std::endl;

    // 使用 reserve
    start = std::chrono::high_resolution_clock::now();
    std::vector<int> v2;
    v2.reserve(N);  // 预分配
    for (int i = 0; i < N; ++i) {
        v2.push_back(i);
    }
    end = std::chrono::high_resolution_clock::now();
    std::cout << "有 reserve: "
              << std::chrono::duration_cast<std::chrono::milliseconds>(end - start).count()
              << " ms" << std::endl;

    return 0;
}
```

**经验法则**：如果你大致知道 vector 最终的大小，使用 `reserve` 可以避免多次内存重新分配和元素拷贝。

## 范围 for 循环遍历

```cpp
#include <iostream>
#include <vector>
#include <string>

int main() {
    std::vector<int> nums = {1, 2, 3, 4, 5};

    // 值拷贝（不推荐，除非类型很小）
    for (int n : nums) {
        std::cout << n << " ";
    }
    std::cout << std::endl;

    // const 引用（推荐：只读遍历）
    for (const auto& n : nums) {
        std::cout << n << " ";
    }
    std::cout << std::endl;

    // 非 const 引用（需要修改元素时）
    for (auto& n : nums) {
        n *= 2;
    }
    std::cout << "翻倍后: ";
    for (int n : nums) std::cout << n << " ";
    std::cout << std::endl;

    // 带索引的遍历
    for (size_t i = 0; i < nums.size(); ++i) {
        std::cout << "nums[" << i << "] = " << nums[i] << std::endl;
    }

    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：迭代器失效

```cpp
std::vector<int> v = {1, 2, 3};
auto it = v.begin();
v.push_back(4);  // 可能触发重新分配，it 失效！
// *it = 10;     // 未定义行为！
```

### 陷阱 2：用 int 作为索引

```cpp
std::vector<int> v = {1, 2, 3};
// for (int i = 0; i < v.size(); ++i)  // 警告：有符号/无符号不匹配
for (size_t i = 0; i < v.size(); ++i)  // 正确
```

### 最佳实践

1. **优先使用 `emplace_back` 而非 `push_back`**（对于复杂类型）
2. **已知大小时使用 `reserve`**
3. **遍历时使用 `const auto&`**
4. **用 `at()` 进行带边界检查的访问**
5. **用 `empty()` 而非 `size() == 0`**

## 练习

### 练习 1：字符串反转

编写函数 `reverseString(std::string& s)`，原地反转字符串。

### 练习 2：vector 统计

编写函数计算 `std::vector<int>` 的最大值、最小值、平均值和总和。

### 练习 3：字符串分割

编写函数 `split(const std::string& str, char delimiter)`，返回 `std::vector<std::string>`。

### 练习 4：去重

编写函数 `removeDuplicates(std::vector<int>& v)`，删除 vector 中的重复元素。

### 练习 5：字符串回文

编写函数 `isPalindrome(const std::string& s)`，判断字符串是否为回文。

## 参考链接

- [std::string - cppreference](https://en.cppreference.com/w/cpp/string/basic_string)
- [std::vector - cppreference](https://en.cppreference.com/w/cpp/container/vector)
- [std::string::substr - cppreference](https://en.cppreference.com/w/cpp/string/basic_string/substr)
- [std::vector::reserve - cppreference](https://en.cppreference.com/w/cpp/container/vector/reserve)
- [C++ Core Guidelines: SL.str.1 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Ssl-str)
