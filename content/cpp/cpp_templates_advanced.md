# 模板进阶与类型萃取

## 概述

在掌握了模板基础之后，C++ 提供了更强大的元编程工具：SFINAE、`std::enable_if`、类型萃取（type_traits）、`constexpr`、`if constexpr`（C++17）以及 Concepts（C++20）。这些工具让你在编译期进行类型检查和代码生成，写出更安全、更高效的泛型代码。本章将带你逐步深入 C++ 模板元编程的世界。

## SFINAE：替换失败不是错误

SFINAE（Substitution Failure Is Not An Error）是 C++ 模板的核心规则之一：当模板参数替换失败时，编译器不会报错，而是简单地从候选函数集中移除该函数。

```cpp
#include <iostream>
#include <type_traits>

// 这个函数只在 T 有 .size() 成员时参与重载决议
template <typename T>
auto getSize(const T& container) -> decltype(container.size()) {
    std::cout << "使用 container.size()" << std::endl;
    return container.size();
}

// 这个函数只在 T 是数组时参与重载决议
template <typename T, std::size_t N>
std::size_t getSize(const T (&arr)[N]) {
    std::cout << "使用数组大小" << std::endl;
    return N;
}

int main() {
    std::vector<int> vec = {1, 2, 3};
    std::cout << "vec 大小: " << getSize(vec) << std::endl;  // 3

    int arr[] = {10, 20, 30, 40};
    std::cout << "arr 大小: " << getSize(arr) << std::endl;  // 4

    // 如果 T 既没有 .size() 也不是数组，两个模板都不匹配 → 编译错误
    // std::cout << getSize(42) << std::endl;  // 错误

    return 0;
}
```

### SFINAE 的实际应用

```cpp
#include <iostream>
#include <string>
#include <vector>

// 为有 serialize() 方法的类型启用
template <typename T>
auto serialize(const T& obj) -> decltype(obj.serialize()) {
    return obj.serialize();
}

// 为 std::string 特化
template <typename T>
auto serialize(const T& str)
    -> decltype(str.begin(), str.end(), std::string()) {
    return std::string(str.begin(), str.end());
}

class Data {
public:
    std::string serialize() const { return "Data{}"; }
};

int main() {
    Data d;
    std::cout << serialize(d) << std::endl;

    std::string s = "hello";
    std::cout << serialize(s) << std::endl;

    return 0;
}
```

## std::enable_if

`std::enable_if` 是 SFINAE 的标准化工具，用于在编译期有条件地启用或禁用函数/类。

```cpp
#include <iostream>
#include <type_traits>
#include <string>

// 只在 T 是整数类型时启用
template <typename T>
typename std::enable_if<std::is_integral<T>::value, T>::type
doubleValue(T value) {
    std::cout << "整数版本" << std::endl;
    return value * 2;
}

// 只在 T 是浮点类型时启用
template <typename T>
typename std::enable_if<std::is_floating_point<T>::value, T>::type
doubleValue(T value) {
    std::cout << "浮点版本" << std::endl;
    return value * 2.0;
}

int main() {
    std::cout << doubleValue(5) << std::endl;       // 整数版本 → 10
    std::cout << doubleValue(3.14) << std::endl;    // 浮点版本 → 6.28

    return 0;
}
```

### C++14 简化写法

```cpp
#include <iostream>
#include <type_traits>

// C++14: std::enable_if_t 简化了写法
template <typename T>
std::enable_if_t<std::is_integral<T>::value, T>
triple(T value) {
    return value * 3;
}

// 也可以放在模板参数中
template <typename T,
          std::enable_if_t<std::is_integral<T>::value, int> = 0>
T quadruple(T value) {
    return value * 4;
}

int main() {
    std::cout << triple(7) << std::endl;       // 21
    std::cout << quadruple(7) << std::endl;    // 28
    return 0;
}
```

## 类型萃取（Type Traits）

类型萃取在 `<type_traits>` 头文件中提供，用于在编译期查询和修改类型属性。

### 类型查询

```cpp
#include <iostream>
#include <type_traits>
#include <string>
#include <vector>

int main() {
    // 类型类别查询
    std::cout << "int 是整数: " << std::is_integral<int>::value << std::endl;
    std::cout << "double 是整数: " << std::is_integral<double>::value << std::endl;
    std::cout << "int 是浮点: " << std::is_floating_point<int>::value << std::endl;
    std::cout << "int 是指针: " << std::is_pointer<int*>::value << std::endl;
    std::cout << "int 是引用: " << std::is_reference<int&>::value << std::endl;
    std::cout << "int 是算术: " << std::is_arithmetic<int>::value << std::endl;

    // 复合查询
    std::cout << "int 是 trivial: " << std::is_trivial<int>::value << std::endl;
    std::cout << "vector 是 trivial: " << std::is_trivial<std::vector<int>>::value << std::endl;
    std::cout << "int 是 POD: " << std::is_pod<int>::value << std::endl;

    // C++17: _v 后缀简化写法
    std::cout << "int 是整数: " << std::is_integral_v<int> << std::endl;
    std::cout << "string 是类: " << std::is_class_v<std::string> << std::endl;

    return 0;
}
```

### 类型转换

```cpp
#include <iostream>
#include <type_traits>

int main() {
    // 添加/移除 const
    using T1 = std::add_const<int>::type;       // const int
    using T2 = std::remove_const<const int>::type;  // int

    // 添加/移除引用
    using T3 = std::add_lvalue_reference<int>::type;   // int&
    using T4 = std::remove_reference<int&>::type;      // int

    // 移除指针
    using T5 = std::remove_pointer<int*>::type;        // int

    // 条件类型（类似三元运算符）
    using T6 = std::conditional<true, int, double>::type;  // int
    using T7 = std::conditional<false, int, double>::type; // double

    // C++14: _t 后缀简化写法
    using T8 = std::remove_reference_t<int&>;  // int
    using T9 = std::conditional_t<true, int, double>;  // int

    // C++17: std::void_t（用于 SFINAE 检测）
    using T10 = std::void_t<int, double, char>;  // void

    return 0;
}
```

### 使用类型萃取实现通用打印

```cpp
#include <iostream>
#include <type_traits>
#include <vector>
#include <string>

// 通用打印：利用类型萃取选择合适的输出方式
template <typename T>
void smartPrint(const T& value) {
    if constexpr (std::is_integral_v<T>) {
        std::cout << "[整数] " << value << std::endl;
    } else if constexpr (std::is_floating_point_v<T>) {
        std::cout << "[浮点] " << value << std::endl;
    } else if constexpr (std::is_same_v<T, std::string>) {
        std::cout << "[字符串] " << value << std::endl;
    } else {
        std::cout << "[其他] " << value << std::endl;
    }
}

int main() {
    smartPrint(42);         // [整数] 42
    smartPrint(3.14);       // [浮点] 3.14
    smartPrint(std::string("Hello"));  // [字符串] Hello

    return 0;
}
```

## constexpr 函数与变量

`constexpr` 允许在编译期计算表达式和函数，实现零运行时开销。

### constexpr 变量

```cpp
#include <iostream>

constexpr int MAX_SIZE = 100;
constexpr double PI = 3.14159265358979;

// constexpr 数组大小
constexpr int fibonacci(int n) {
    return (n <= 1) ? n : fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    // 编译期计算
    constexpr int fib10 = fibonacci(10);
    std::cout << "fibonacci(10) = " << fib10 << std::endl;  // 55

    // 用作数组大小（必须是编译期常量）
    int arr[fibonacci(5)];  // 大小为 5 的数组
    std::cout << "数组大小: " << sizeof(arr) / sizeof(arr[0]) << std::endl;

    return 0;
}
```

### constexpr 函数

```cpp
#include <iostream>

// constexpr 函数：可以在编译期或运行期调用
constexpr int factorial(int n) {
    return (n <= 1) ? 1 : n * factorial(n - 1);
}

constexpr int power(int base, int exp) {
    return (exp == 0) ? 1 : base * power(base, exp - 1);
}

// C++14: constexpr 函数可以有循环
constexpr int sumToN(int n) {
    int sum = 0;
    for (int i = 1; i <= n; ++i) {
        sum += i;
    }
    return sum;
}

int main() {
    // 编译期调用
    constexpr int f5 = factorial(5);
    constexpr int p2_10 = power(2, 10);
    constexpr int s100 = sumToN(100);

    std::cout << "5! = " << f5 << std::endl;          // 120
    std::cout << "2^10 = " << p2_10 << std::endl;     // 1024
    std::cout << "sum(1..100) = " << s100 << std::endl;  // 5050

    // 运行期调用
    int x = 6;
    std::cout << "6! = " << factorial(x) << std::endl;  // 720

    return 0;
}
```

## if constexpr（C++17）

`if constexpr` 在编译期进行条件判断，不满足条件的分支不会被实例化。

```cpp
#include <iostream>
#include <type_traits>
#include <string>
#include <vector>

// 编译期分支：不满足条件的代码不会被编译
template <typename T>
void process(const T& value) {
    if constexpr (std::is_integral_v<T>) {
        std::cout << "处理整数: " << value << std::endl;
        std::cout << "  二进制: ";
        // 以下代码只在 T 是整数时才实例化
        for (int i = 31; i >= 0; --i) {
            std::cout << ((value >> i) & 1);
        }
        std::cout << std::endl;
    } else if constexpr (std::is_floating_point_v<T>) {
        std::cout << "处理浮点数: " << value << std::endl;
    } else if constexpr (std::is_same_v<T, std::string>) {
        std::cout << "处理字符串: " << value << std::endl;
        std::cout << "  长度: " << value.length() << std::endl;
    } else {
        std::cout << "处理未知类型" << std::endl;
    }
}

int main() {
    process(42);
    process(3.14);
    process(std::string("Hello"));

    return 0;
}
```

### if constexpr vs 普通 if

```cpp
#include <iostream>
#include <type_traits>

template <typename T>
void withIfConstexpr(T value) {
    if constexpr (std::is_pointer_v<T>) {
        std::cout << "指针值: " << *value << std::endl;  // 只有指针才实例化
    } else {
        std::cout << "非指针值: " << value << std::endl;
    }
}

// 普通 if：两个分支都会被实例化
template <typename T>
void withNormalIf(T value) {
    if (std::is_pointer_v<T>) {
        // std::cout << *value << std::endl;  // 错误！int 没有 *
    }
}

int main() {
    withIfConstexpr(42);     // 非指针值: 42
    withIfConstexpr(&42);    // 编译错误（字面量没有地址），但演示了原理
    withNormalIf(42);        // OK

    return 0;
}
```

## Concepts 入门（C++20）

Concepts 是 C++20 引入的模板约束机制，比 SFINAE 更简洁、更易读。

```cpp
#include <iostream>
#include <concepts>
#include <string>
#include <vector>

// 定义 Concept
template <typename T>
concept Numeric = std::is_integral_v<T> || std::is_floating_point_v<T>;

template <typename T>
concept Printable = requires(T t) {
    { std::cout << t } -> std::same_as<std::ostream&>;
};

// 使用 Concept 约束模板参数
template <Numeric T>
T add(T a, T b) {
    return a + b;
}

// 简写语法
Numeric auto multiply(Numeric auto a, Numeric auto b) {
    return a * b;
}

// 多个 Concept
template <Printable T>
void printValue(const T& value) {
    std::cout << value << std::endl;
}

// requires 子句
template <typename T>
requires std::is_same_v<T, int> || std::is_same_v<T, double>
T doubleValue(T value) {
    return value * 2;
}

int main() {
    std::cout << add(3, 5) << std::endl;          // 8
    std::cout << add(3.14, 2.72) << std::endl;   // 5.86
    // std::cout << add(std::string("a"), std::string("b")) << std::endl;  // 编译错误！

    std::cout << multiply(4, 5) << std::endl;     // 20
    std::cout << multiply(2.5, 4.0) << std::endl; // 10.0

    printValue(42);
    printValue(3.14);
    printValue(std::string("Hello"));

    std::cout << doubleValue(21) << std::endl;     // 42
    std::cout << doubleValue(10.5) << std::endl;   // 21.0

    return 0;
}
```

### 标准库 Concepts

```cpp
#include <iostream>
#include <concepts>
#include <vector>
#include <list>

template <std::integral T>
void printIntegral(T value) {
    std::cout << "整数: " << value << std::endl;
}

template <std::floating_point T>
void printFloating(T value) {
    std::cout << "浮点: " << value << std::endl;
}

// std::same_as
template <typename T>
requires std::same_as<T, int>
void onlyInt(T value) {
    std::cout << "只接受 int: " << value << std::endl;
}

int main() {
    printIntegral(42);
    printFloating(3.14);
    onlyInt(100);

    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：SFINAE 语法冗长易错

```cpp
// SFINAE 写法（冗长）
template <typename T>
typename std::enable_if<std::is_integral<T>::value, T>::type
foo(T t) { return t; }

// Concepts 写法（简洁，C++20）
template <std::integral T>
T foo(T t) { return t; }
```

### 陷阱 2：constexpr 函数的限制

```cpp
// C++11/14: constexpr 函数有严格限制
// C++17: 放宽限制
// C++20: 几乎没有限制（可以有 try-catch、goto 等）

constexpr int badExample() {
    // C++11 中不允许：
    // int* p = new int(42);  // 动态分配
    // delete p;
    // C++14 中不允许：
    // static int x = 0;  // 静态变量
    return 42;
}
```

### 最佳实践

1. **C++20 优先使用 Concepts 而非 SFINAE**
2. **C++17 优先使用 `if constexpr` 而非 SFINAE**
3. **用 `constexpr` 将运行时计算移到编译期**
4. **用类型萃取在编译期做类型检查**
5. **模板元编程代码要写清晰的注释**
6. **不要过度使用元编程，可读性优先**

## 练习

1. 用 SFINAE 实现一个 `hasToString` 类型萃取，检测类型是否有 `toString()` 方法。

2. 用 `if constexpr` 实现一个通用的 `toString` 函数，对不同类型使用不同的转换策略。

3. 实现一个编译期向量类 `Vec2<T>`，支持 constexpr 的加法和点积运算。

4. 用 Concepts（C++20）定义一个 `Sortable` Concept，要求类型支持 `<` 运算符。

5. 实现一个编译期斐波那契数列，用 `constexpr` 数组存储前 20 个值。

## 参考链接

- [SFINAE - cppreference](https://en.cppreference.com/w/cpp/language/sfinae)
- [std::enable_if - cppreference](https://en.cppreference.com/w/cpp/types/enable_if)
- [类型萃取 - cppreference](https://en.cppreference.com/w/cpp/metaheader/type_traits)
- [constexpr - cppreference](https://en.cppreference.com/w/cpp/language/constexpr)
- [if constexpr - cppreference](https://en.cppreference.com/w/cpp/language/if)
- [Concepts - cppreference](https://en.cppreference.com/w/cpp/language/constraints)
- [std::void_t - cppreference](https://en.cppreference.com/w/cpp/types/void_t)
- [C++ Core Guidelines: T.40 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rt-type)
