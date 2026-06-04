# 数组与字符串处理

## 课程概述

数组和字符串是编程中最基础的数据结构。C++ 提供了多种方式来处理它们：从 C 风格的原始数组和字符数组，到现代 C++ 推荐的 `std::string` 和 `std::vector`。理解它们的区别和适用场景，对写出安全高效的代码至关重要。

## C 风格数组

C 风格数组是固定大小的连续内存块，在编译时必须知道大小：

```cpp
#include <iostream>

int main() {
    // 声明并初始化
    int numbers[5] = {10, 20, 30, 40, 50};

    // 部分初始化，未指定的元素自动初始化为 0
    int partial[5] = {1, 2};  // {1, 2, 0, 0, 0}

    // 让编译器推断大小
    int autoSize[] = {1, 2, 3, 4, 5};  // 大小为 5

    // 访问元素
    std::cout << "numbers[0] = " << numbers[0] << std::endl;  // 10
    std::cout << "numbers[4] = " << numbers[4] << std::endl;  // 50

    // 遍历
    for (int i = 0; i < 5; ++i) {
        std::cout << numbers[i] << " ";
    }
    std::cout << std::endl;

    // 计算数组大小
    std::cout << "元素个数: " << sizeof(numbers) / sizeof(numbers[0]) << std::endl;

    return 0;
}
```

**注意**：C 风格数组没有内置的边界检查，访问越界不会报错但会导致未定义行为。

## 数组退化为指针

当数组作为函数参数传递时，它会**退化**为指向首元素的指针。这意味着函数内部无法通过 `sizeof` 获取数组大小：

```cpp
#include <iostream>

// arr 在这里退化为 int*，sizeof(arr) 是指针的大小（8 字节），不是数组大小
void printArrayBad(int arr[]) {
    std::cout << "sizeof(arr) = " << sizeof(arr) << std::endl;  // 8（指针大小）
}

// 正确做法：额外传递数组大小
void printArrayGood(int arr[], int size) {
    for (int i = 0; i < size; ++i) {
        std::cout << arr[i] << " ";
    }
    std::cout << std::endl;
}

// 使用模板保留数组大小信息（C++ 技巧）
template <size_t N>
void printArrayTemplate(int (&arr)[N]) {
    std::cout << "数组大小: " << N << std::endl;
    for (int i = 0; i < N; ++i) {
        std::cout << arr[i] << " ";
    }
    std::cout << std::endl;
}

int main() {
    int nums[] = {1, 2, 3, 4, 5};
    printArrayBad(nums);       // 无法知道大小
    printArrayGood(nums, 5);   // 手动传大小
    printArrayTemplate(nums);  // 编译器自动推断大小为 5
    return 0;
}
```

## 多维数组

```cpp
#include <iostream>

int main() {
    // 二维数组：3 行 4 列
    int matrix[3][4] = {
        {1, 2, 3, 4},
        {5, 6, 7, 8},
        {9, 10, 11, 12}
    };

    // 访问元素
    std::cout << "matrix[1][2] = " << matrix[1][2] << std::endl;  // 7

    // 遍历二维数组
    for (int i = 0; i < 3; ++i) {
        for (int j = 0; j < 4; ++j) {
            std::cout << matrix[i][j] << "\t";
        }
        std::cout << std::endl;
    }

    // 三维数组
    int cube[2][3][4] = {};  // 全部初始化为 0

    return 0;
}
```

## C 风格字符串

C 风格字符串本质上是**以空字符 `\0` 结尾的字符数组**：

```cpp
#include <iostream>
#include <cstring>  // C 字符串操作函数

int main() {
    // C 风格字符串
    char greeting[] = "Hello";  // 实际上是 {'H', 'e', 'l', 'l', 'o', '\0'}
    char name[20] = "Alice";

    // strlen: 字符串长度（不包括 \0）
    std::cout << "长度: " << strlen(greeting) << std::endl;  // 5

    // strcpy: 字符串复制
    char buffer[50];
    strcpy(buffer, greeting);
    std::cout << "复制后: " << buffer << std::endl;

    // strcat: 字符串拼接
    strcat(buffer, ", World!");
    std::cout << "拼接后: " << buffer << std::endl;  // Hello, World!

    // strcmp: 字符串比较
    std::cout << "strcmp: " << strcmp("abc", "abc") << std::endl;  // 0（相等）
    std::cout << "strcmp: " << strcmp("abc", "def") << std::endl;  // 负数
    std::cout << "strcmp: " << strcmp("def", "abc") << std::endl;  // 正数

    return 0;
}
```

### C 风格字符串的危险

```cpp
// 缓冲区溢出！
char small[5] = "Hi";
strcat(small, " there!");  // 超出 small 的容量，覆盖其他内存！

// 安全的替代方案：strncpy / strncat
char safe[20] = "Hi";
strncat(safe, " there!", sizeof(safe) - strlen(safe) - 1);
```

## 为什么 C++ 推荐使用 std::string

`std::string` 解决了 C 风格字符串的所有问题：自动内存管理、安全、功能丰富。

```cpp
#include <iostream>
#include <string>

int main() {
    // 创建字符串
    std::string s1 = "Hello";
    std::string s2("World");
    std::string s3 = s1 + ", " + s2 + "!";  // 拼接

    std::cout << s3 << std::endl;  // Hello, World!

    // 常用操作
    std::cout << "长度: " << s3.length() << std::endl;
    std::cout << "是否为空: " << s3.empty() << std::endl;
    std::cout << "字符: " << s3[0] << std::endl;

    // 子串
    std::string sub = s3.substr(0, 5);  // "Hello"
    std::cout << "子串: " << sub << std::endl;

    // 查找
    size_t pos = s3.find("World");
    if (pos != std::string::npos) {
        std::cout << "找到 'World' 在位置 " << pos << std::endl;
    }

    // 比较
    std::string a = "apple", b = "banana";
    if (a < b) std::cout << a << " 在 " << b << " 之前" << std::endl;

    return 0;
}
```

## std::array（C++11）

`std::array` 是 C++11 引入的固定大小数组容器，结合了 C 数组的性能和 STL 容器的安全性：

```cpp
#include <iostream>
#include <array>
#include <algorithm>

int main() {
    // 声明和初始化
    std::array<int, 5> arr = {10, 20, 30, 40, 50};

    // 安全访问（带边界检查）
    std::cout << "arr[2] = " << arr[2] << std::endl;       // 30
    std::cout << "arr.at(2) = " << arr.at(2) << std::endl; // 30（越界会抛异常）

    // 大小信息
    std::cout << "大小: " << arr.size() << std::endl;
    std::cout << "最大大小: " << arr.max_size() << std::endl;
    std::cout << "是否为空: " << arr.empty() << std::endl;

    // 遍历
    for (int n : arr) {
        std::cout << n << " ";
    }
    std::cout << std::endl;

    // 与 STL 算法配合
    std::sort(arr.begin(), arr.end());
    for (int n : arr) {
        std::cout << n << " ";
    }
    std::cout << std::endl;

    return 0;
}
```

### C 数组 vs std::array vs std::vector

| 特性     | C 数组      | std::array | std::vector |
| -------- | ----------- | ---------- | ----------- |
| 大小     | 编译期固定  | 编译期固定 | 运行时可变  |
| 内存     | 栈/静态区   | 栈/静态区  | 堆          |
| 边界检查 | 无          | at() 有    | at() 有     |
| 性能     | 最快        | 最快       | 稍慢        |
| STL 兼容 | 差          | 好         | 好          |
| 推荐场景 | 底层/嵌入式 | 固定大小   | 动态大小    |

## 常见陷阱与最佳实践

### 陷阱 1：数组越界

```cpp
int arr[5] = {1, 2, 3, 4, 5};
// arr[5] = 100;  // 越界！有效索引是 0-4
// 使用 arr.at(5) 会抛出 std::out_of_range 异常
```

### 陷阱 2：C 字符串未预留 \0 空间

```cpp
char buf[5];
strcpy(buf, "Hello");  // "Hello" 需要 6 字节（含 \0），溢出！
```

### 最佳实践

1. **优先使用 `std::string` 而非 C 字符串**
2. **优先使用 `std::vector` 而非动态 C 数组**
3. **固定大小数组用 `std::array`**
4. **使用 `at()` 进行带边界检查的访问**
5. **避免使用 `strcpy`/`strcat`，用 `std::string` 代替**

## 练习

### 练习 1：数组反转

用 C 风格数组实现数组反转，不使用额外空间。

### 练习 2：字符串长度

不使用 `strlen`，自己实现一个计算 C 风格字符串长度的函数。

### 练习 3：矩阵乘法

用二维数组实现两个 3x3 矩阵的乘法。

### 练习 4：std::array 排序

使用 `std::array` 和 `std::sort` 对一组数字排序，然后使用 `std::reverse` 反转。

### 练习 5：字符串统计

编写函数统计一个 `std::string` 中元音字母（a, e, i, o, u）的个数。

## 参考链接

- [C++ 数组 - cppreference](https://en.cppreference.com/w/cpp/language/array)
- [C++ std::array - cppreference](https://en.cppreference.com/w/cpp/container/array)
- [C++ std::string - cppreference](https://en.cppreference.com/w/cpp/string/basic_string)
- [C++ CString 库 - cppreference](https://en.cppreference.com/w/cpp/header/cstring)
- [C++ Core Guidelines: SL.con.1 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Sl-con)
