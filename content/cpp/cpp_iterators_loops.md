# 迭代器与范围 for 循环

## 课程概述

迭代器是 C++ STL 的核心抽象，它提供了一种统一的方式来遍历容器中的元素。理解迭代器的概念、类别、失效场景，以及范围 for 循环的底层原理，是高效使用 STL 的关键。

## 迭代器的概念

迭代器是一种"智能指针"，它指向容器中的元素，并提供类似指针的操作（解引用 `*`、递增 `++`、比较 `==`/`!=`）：

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> nums = {10, 20, 30, 40, 50};

    // 获取迭代器
    std::vector<int>::iterator it = nums.begin();  // 指向第一个元素

    // 解引用：访问元素
    std::cout << "*it = " << *it << std::endl;  // 10

    // 递增：移动到下一个元素
    ++it;
    std::cout << "*it = " << *it << std::endl;  // 20

    // 遍历整个容器
    for (auto it2 = nums.begin(); it2 != nums.end(); ++it2) {
        std::cout << *it2 << " ";
    }
    std::cout << std::endl;

    return 0;
}
```

### begin 与 end

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v = {1, 2, 3};

    // begin() 指向第一个元素
    // end() 指向最后一个元素的"后面"（哨兵位置）
    auto first = v.begin();
    auto last = v.end();

    std::cout << "*begin() = " << *first << std::endl;  // 1
    // *last 是未定义行为！end() 不能解引用

    // 空容器的 begin() == end()
    std::vector<int> empty;
    std::cout << "空容器: begin == end? " << (empty.begin() == empty.end()) << std::endl;

    return 0;
}
```

## 迭代器类别

C++ 迭代器分为五个类别，功能依次增强：

```cpp
// 1. 输入迭代器（Input Iterator）：只能读取，单向移动
//    典型：std::istream_iterator
//    操作：*it, ++it, it1 == it2, it1 != it2

// 2. 输出迭代器（Output Iterator）：只能写入，单向移动
//    典型：std::ostream_iterator
//    操作：*it = value, ++it

// 3. 前向迭代器（Forward Iterator）：可读写，单向移动
//    典型：std::forward_list 的迭代器
//    操作：输入 + 输出迭代器的所有操作

// 4. 双向迭代器（Bidirectional Iterator）：可读写，双向移动
//    典型：std::list, std::set, std::map 的迭代器
//    操作：前向迭代器的所有操作 + --it

// 5. 随机访问迭代器（Random Access Iterator）：可读写，任意访问
//    典型：std::vector, std::deque, 数组指针
//    操作：双向迭代器的所有操作 + it[n], it1 - it2, it1 < it2
```

```cpp
#include <iostream>
#include <vector>
#include <list>

int main() {
    // vector 的迭代器是随机访问迭代器
    std::vector<int> v = {1, 2, 3, 4, 5};
    auto vit = v.begin();
    std::cout << vit[2] << std::endl;     // 随机访问：3
    std::cout << *(vit + 3) << std::endl; // 指针算术：4

    // list 的迭代器是双向迭代器
    std::list<int> lst = {1, 2, 3, 4, 5};
    auto lit = lst.begin();
    ++lit;   // OK
    --lit;   // OK
    // lit[2];       // 错误！list 迭代器不支持随机访问
    // lit + 2;      // 错误！

    return 0;
}
```

## const_iterator

`const_iterator` 用于只读遍历，不能通过它修改元素：

```cpp
#include <iostream>
#include <vector>

void printVector(const std::vector<int>& v) {
    // const 容器的 begin()/end() 返回 const_iterator
    for (std::vector<int>::const_iterator it = v.begin(); it != v.end(); ++it) {
        std::cout << *it << " ";
        // *it = 100;  // 编译错误！const_iterator 不能修改元素
    }
    std::cout << std::endl;
}

int main() {
    std::vector<int> nums = {1, 2, 3, 4, 5};

    // 显式使用 const_iterator
    for (std::vector<int>::const_iterator it = nums.cbegin(); it != nums.cend(); ++it) {
        std::cout << *it << " ";
    }
    std::cout << std::endl;

    // 推荐：用 auto 简化
    for (auto it = nums.cbegin(); it != nums.cend(); ++it) {
        std::cout << *it << " ";
    }
    std::cout << std::endl;

    printVector(nums);

    return 0;
}
```

## 迭代器失效

迭代器失效是指迭代器不再指向有效的元素，使用失效的迭代器会导致未定义行为：

### vector 迭代器失效

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v = {1, 2, 3, 4, 5};
    auto it = v.begin();

    // push_back 可能导致重新分配，所有迭代器失效
    v.push_back(6);
    // *it = 100;  // 可能失效！如果 capacity 不够，重新分配后 it 指向已释放的内存

    // 安全的做法：重新获取迭代器
    it = v.begin();
    *it = 100;  // 现在安全

    // insert/erase 会使插入/删除位置及之后的迭代器失效
    v.insert(v.begin() + 2, 99);
    // 所有 >= begin()+2 的迭代器都失效了

    v.erase(v.begin());
    // 所有 >= begin() 的迭代器都失效了

    return 0;
}
```

### list 迭代器失效规则

```cpp
#include <iostream>
#include <list>

int main() {
    std::list<int> lst = {1, 2, 3, 4, 5};
    auto it = lst.begin();

    // list 的 push_back 不会使现有迭代器失效
    lst.push_back(6);
    std::cout << "*it = " << *it << std::endl;  // 仍然有效

    // 只有被 erase 的元素的迭代器会失效
    auto toErase = std::next(lst.begin(), 2);  // 指向 3
    lst.erase(toErase);
    // toErase 现在失效

    return 0;
}
```

### 迭代器失效总结

| 容器    | push_back                  | insert               | erase                    |
| ------- | -------------------------- | -------------------- | ------------------------ |
| vector  | 可能全部失效（重新分配时） | 插入点及之后全部失效 | 删除点及之后全部失效     |
| deque   | 可能全部失效               | 全部失效             | 全部失效                 |
| list    | 不失效                     | 不失效               | 仅被删除元素的迭代器失效 |
| map/set | 不失效                     | 不失效               | 仅被删除元素的迭代器失效 |

## 范围 for 循环的底层原理

范围 for 循环（C++11）是传统迭代器的语法糖：

```cpp
// 范围 for 循环
std::vector<int> v = {1, 2, 3};
for (const auto& x : v) {
    std::cout << x << " ";
}

// 等价于以下代码：
{
    auto&& __range = v;
    auto __begin = __range.begin();
    auto __end = __range.end();
    for (; __begin != __end; ++__begin) {
        const auto& x = *__begin;
        std::cout << x << " ";
    }
}
```

### 范围 for 的注意事项

```cpp
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v = {1, 2, 3, 4, 5};

    // 值拷贝：创建副本
    for (int x : v) {
        x *= 2;  // 只修改了副本
    }
    std::cout << "值拷贝后: ";
    for (int n : v) std::cout << n << " ";  // 1 2 3 4 5
    std::cout << std::endl;

    // 引用：修改原元素
    for (auto& x : v) {
        x *= 2;
    }
    std::cout << "引用修改后: ";
    for (int n : v) std::cout << n << " ";  // 2 4 6 8 10
    std::cout << std::endl;

    // const 引用：只读，避免拷贝
    for (const auto& x : v) {
        std::cout << x << " ";
    }
    std::cout << std::endl;

    return 0;
}
```

## auto 与迭代器

`auto` 让迭代器的使用更加简洁：

```cpp
#include <iostream>
#include <vector>
#include <map>
#include <string>

int main() {
    std::vector<int> nums = {1, 2, 3};

    // 不使用 auto（繁琐）
    for (std::vector<int>::const_iterator it = nums.begin(); it != nums.end(); ++it) {
        std::cout << *it << " ";
    }
    std::cout << std::endl;

    // 使用 auto（简洁）
    for (auto it = nums.begin(); it != nums.end(); ++it) {
        std::cout << *it << " ";
    }
    std::cout << std::endl;

    // map 的迭代器
    std::map<std::string, int> scores = {{"Alice", 95}, {"Bob", 87}};
    for (auto it = scores.begin(); it != scores.end(); ++it) {
        std::cout << it->first << ": " << it->second << std::endl;
    }

    // 配合范围 for 更简洁
    for (const auto& [name, score] : scores) {
        std::cout << name << ": " << score << std::endl;
    }

    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：在遍历时 erase 元素

```cpp
std::vector<int> v = {1, 2, 3, 4, 5};
for (auto it = v.begin(); it != v.end(); ++it) {
    if (*it % 2 == 0) {
        v.erase(it);  // 错误！erase 后 it 失效，++it 是未定义行为
    }
}

// 正确做法：使用 erase 的返回值
for (auto it = v.begin(); it != v.end(); ) {
    if (*it % 2 == 0) {
        it = v.erase(it);  // erase 返回下一个有效迭代器
    } else {
        ++it;
    }
}
```

### 陷阱 2：end() 迭代器的误用

```cpp
auto it = v.end();
// *it = 10;  // 未定义行为！end() 不能解引用
```

### 最佳实践

1. **优先使用范围 for 循环**（不需要索引时）
2. **遍历时使用 `const auto&`**
3. **需要修改时使用 `auto&`**
4. **erase 后使用返回值更新迭代器**
5. **使用 `cbegin()`/`cend()` 进行只读遍历**

## 练习

### 练习 1：迭代器查找

用迭代器在 vector 中查找第一个大于 10 的元素，返回其位置。

### 练习 2：迭代器删除

用迭代器遍历 vector，删除所有偶数元素。

### 练习 3：反向遍历

使用 `rbegin()` 和 `rend()` 反向遍历 vector。

### 练习 4：迭代器距离

计算 vector 中两个迭代器之间的距离（元素个数）。

### 练习 5：map 遍历

创建一个 `std::map<std::string, int>`，用迭代器和范围 for 分别遍历并打印。

## 参考链接

- [C++ 迭代器库 - cppreference](https://en.cppreference.com/w/cpp/iterator)
- [C++ 迭代器类别 - cppreference](https://en.cppreference.com/w/cpp/iterator)
- [C++ 范围 for - cppreference](https://en.cppreference.com/w/cpp/language/range-for)
- [C++ 迭代器失效 - cppreference](https://en.cppreference.com/w/cpp/container/vector#Iterator_invalidation)
- [C++ Core Guidelines: SL.con.3 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Sl-iterators)
