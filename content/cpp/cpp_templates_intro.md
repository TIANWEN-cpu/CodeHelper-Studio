# 模板编程入门

## 概述

模板是 C++ 泛型编程的核心机制。它允许你编写与类型无关的代码，编译器会根据实际使用的类型在编译期自动生成对应的代码。标准库中的容器（`std::vector`、`std::map`）、算法（`std::sort`、`std::find`）和智能指针（`std::unique_ptr`）全部基于模板实现。理解模板是掌握现代 C++ 的必经之路。

## 为什么需要模板

### 问题：类型重复的代码

```cpp
// 没有模板时，每种类型都要写一个函数
int maxInt(int a, int b) { return a > b ? a : b; }
double maxDouble(double a, double b) { return a > b ? a : b; }
std::string maxString(const std::string& a, const std::string& b) {
    return a > b ? a : b;
}
// 逻辑完全相同，只是类型不同！
```

### 解决方案：函数模板

```cpp
#include <iostream>
#include <string>

// 一个模板适用于所有类型
template <typename T>
T maxValue(T a, T b) {
    return a > b ? a : b;
}

int main() {
    std::cout << maxValue(3, 7) << std::endl;                // int
    std::cout << maxValue(3.14, 2.72) << std::endl;          // double
    std::cout << maxValue(std::string("abc"), std::string("xyz")) << std::endl;

    return 0;
}
```

## 函数模板

### 基本语法

```cpp
#include <iostream>
#include <string>

// template <typename T> 和 template <class T> 完全等价
template <typename T>
void printValue(const T& value) {
    std::cout << value << std::endl;
}

// 多个模板参数
template <typename T, typename U>
auto add(T a, U b) -> decltype(a + b) {
    return a + b;
}

int main() {
    // 编译器自动推导类型
    printValue(42);           // T = int
    printValue(3.14);         // T = double
    printValue(std::string("Hello"));  // T = std::string

    // 多参数模板
    std::cout << add(1, 2.5) << std::endl;     // int + double → double
    std::cout << add(10, 20) << std::endl;     // int + int → int

    return 0;
}
```

### 显式指定模板参数

```cpp
#include <iostream>

template <typename T>
T castValue(double value) {
    return static_cast<T>(value);
}

int main() {
    // 编译器无法推导返回类型，必须显式指定
    int a = castValue<int>(3.14);       // a = 3
    double b = castValue<double>(3.14); // b = 3.14
    float c = castValue<float>(3.14);   // c = 3.14f

    std::cout << a << " " << b << " " << c << std::endl;

    return 0;
}
```

### 非类型模板参数

```cpp
#include <iostream>
#include <array>

// 非类型模板参数：必须是编译期常量
template <typename T, int N>
T sumArray(const T (&arr)[N]) {
    T total = T();  // 默认初始化
    for (int i = 0; i < N; ++i) {
        total += arr[i];
    }
    return total;
}

int main() {
    int nums[] = {1, 2, 3, 4, 5};
    std::cout << "总和: " << sumArray(nums) << std::endl;  // N = 5

    double vals[] = {1.1, 2.2, 3.3};
    std::cout << "总和: " << sumArray(vals) << std::endl;  // N = 3

    return 0;
}
```

## 类模板

### 基本语法

```cpp
#include <iostream>
#include <string>

// 类模板
template <typename T>
class Stack {
public:
    Stack() : top_(-1) {}

    void push(const T& value) {
        if (top_ < MAX_SIZE - 1) {
            data_[++top_] = value;
        }
    }

    void pop() {
        if (top_ >= 0) {
            --top_;
        }
    }

    T top() const {
        if (top_ >= 0) {
            return data_[top_];
        }
        throw std::runtime_error("Stack is empty");
    }

    bool empty() const { return top_ < 0; }
    size_t size() const { return top_ + 1; }

private:
    static const int MAX_SIZE = 100;
    T data_[MAX_SIZE];
    int top_;
};

int main() {
    Stack<int> intStack;
    intStack.push(10);
    intStack.push(20);
    intStack.push(30);
    std::cout << "栈顶: " << intStack.top() << std::endl;  // 30

    Stack<std::string> stringStack;
    stringStack.push("Hello");
    stringStack.push("World");
    std::cout << "栈顶: " << stringStack.top() << std::endl;  // World

    return 0;
}
```

### 类模板的成员函数在类外定义

```cpp
#include <iostream>

template <typename T>
class Box {
public:
    Box(const T& value);
    T getValue() const;
    void setValue(const T& value);
private:
    T value_;
};

// 类外定义：需要 template <typename T> 和 Box<T>
template <typename T>
Box<T>::Box(const T& value) : value_(value) {}

template <typename T>
T Box<T>::getValue() const {
    return value_;
}

template <typename T>
void Box<T>::setValue(const T& value) {
    value_ = value;
}

int main() {
    Box<int> intBox(42);
    std::cout << intBox.getValue() << std::endl;

    Box<double> doubleBox(3.14);
    std::cout << doubleBox.getValue() << std::endl;

    return 0;
}
```

### 类模板的多个参数

```cpp
#include <iostream>
#include <string>

template <typename TKey, typename TValue>
class Pair {
public:
    Pair(const TKey& key, const TValue& value)
        : key_(key), value_(value) {}

    TKey getKey() const { return key_; }
    TValue getValue() const { return value_; }

    void print() const {
        std::cout << "(" << key_ << ", " << value_ << ")" << std::endl;
    }

private:
    TKey key_;
    TValue value_;
};

int main() {
    Pair<int, std::string> p1(1, "Alice");
    p1.print();

    Pair<std::string, double> p2("pi", 3.14159);
    p2.print();

    return 0;
}
```

## 模板实例化

### 隐式实例化

```cpp
#include <iostream>

template <typename T>
T square(T x) {
    std::cout << "square<" << typeid(T).name() << "> 被调用" << std::endl;
    return x * x;
}

int main() {
    // 编译器在首次使用时自动生成对应版本的代码
    square(5);       // 隐式实例化 square<int>
    square(3.14);    // 隐式实例化 square<double>
    square(5);       // 使用已实例化的 square<int>，不再生成

    return 0;
}
```

### 显式实例化

```cpp
// 显式实例化声明（告诉编译器：这个模板会用到这些类型）
template int square<int>(int);
template double square<double>(double);

// 显式实例化定义（强制编译器生成代码）
// template int square<int>(int);

// 用途：
// 1. 减少编译时间（在 .cpp 中显式实例化，其他文件只声明）
// 2. 控制哪些类型可以使用模板
```

## 模板特化

### 全特化

当某个特定类型需要不同的实现时，可以使用模板特化。

```cpp
#include <iostream>
#include <cstring>
#include <string>

// 主模板
template <typename T>
bool isEqual(const T& a, const T& b) {
    std::cout << "使用通用版本" << std::endl;
    return a == b;
}

// 全特化：针对 const char* 的特殊实现
template <>
bool isEqual<const char*>(const char* const& a, const char* const& b) {
    std::cout << "使用 const char* 特化版本" << std::endl;
    return std::strcmp(a, b) == 0;
}

int main() {
    std::cout << isEqual(3, 3) << std::endl;           // 通用版本
    std::cout << isEqual(3.14, 3.14) << std::endl;     // 通用版本
    std::cout << isEqual("hello", "hello") << std::endl;  // 特化版本
    std::cout << isEqual("hello", "world") << std::endl;  // 特化版本

    return 0;
}
```

### 类模板特化

```cpp
#include <iostream>
#include <string>
#include <vector>

// 主模板
template <typename T>
class Container {
public:
    void add(const T& value) {
        std::cout << "添加元素: " << value << std::endl;
        data_.push_back(value);
    }

    void print() const {
        std::cout << "Container: ";
        for (const auto& item : data_) {
            std::cout << item << " ";
        }
        std::cout << std::endl;
    }

private:
    std::vector<T> data_;
};

// 特化：针对 bool 类型
template <>
class Container<bool> {
public:
    void add(bool value) {
        std::cout << "添加布尔值: " << (value ? "true" : "false") << std::endl;
        data_ |= (1 << count_);
        count_++;
    }

    void print() const {
        std::cout << "Container<bool>: " << count_ << " 个值" << std::endl;
    }

private:
    unsigned int data_ = 0;
    int count_ = 0;
};

int main() {
    Container<int> intContainer;
    intContainer.add(10);
    intContainer.add(20);
    intContainer.print();

    Container<bool> boolContainer;
    boolContainer.add(true);
    boolContainer.add(false);
    boolContainer.print();

    return 0;
}
```

## 为什么 STL 使用模板

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

int main() {
    // STL 容器全部是模板
    std::vector<int> intVec = {3, 1, 4, 1, 5};
    std::vector<std::string> strVec = {"banana", "apple", "cherry"};

    // STL 算法全部是模板
    std::sort(intVec.begin(), intVec.end());
    std::sort(strVec.begin(), strVec.end());

    // 同一个算法适用于任何可比较的类型
    for (int n : intVec) std::cout << n << " ";
    std::cout << std::endl;
    for (const auto& s : strVec) std::cout << s << " ";
    std::cout << std::endl;

    return 0;
}
```

**STL 使用模板的原因**：

1. **类型安全**：编译期检查类型，而非运行时
2. **零开销**：编译期生成代码，没有虚函数调用的开销
3. **通用性**：一套代码适用于所有满足要求的类型
4. **可扩展**：自定义类型只要满足接口要求就能使用 STL

## 常见陷阱与最佳实践

### 陷阱 1：模板代码必须放在头文件中

```cpp
// 错误：模板定义放在 .cpp 文件中
// template <typename T>
// T add(T a, T b) { return a + b; }  // 在其他 .cpp 中无法找到定义

// 正确：模板的声明和定义都放在头文件中
// 或者使用显式实例化
```

### 陷阱 2：类型推导失败

```cpp
template <typename T>
void print(T a, T b) {}

// print(1, 2.5);  // 错误！T 无法同时推导为 int 和 double
// 解决：使用两个模板参数
template <typename T, typename U>
void print2(T a, U b) {}
print2(1, 2.5);  // OK
```

### 陷阱 3：模板编译错误信息冗长

```cpp
// 模板错误信息通常很长，关注最前面的错误原因
// 使用 static_assert 提供友好的错误信息
template <typename T>
void process(T value) {
    static_assert(std::is_arithmetic<T>::value,
                  "process 只能用于数值类型");
    // ...
}
```

### 最佳实践

1. **模板代码放在头文件中**
2. **使用 `typename` 而非 `class`（更清晰）**
3. **参数用 `const T&` 避免不必要的拷贝**
4. **使用 `static_assert` 提供友好的编译错误**
5. **模板命名清晰，文档化类型约束**
6. **优先使用 STL 已有的模板，不要重复造轮子**

## 练习

1. 编写函数模板 `swapValues(T& a, T& b)`，交换两个变量的值。

2. 编写类模板 `Array<T, N>`，实现固定大小的数组，支持 `[]` 运算符和 `size()` 方法。

3. 为 `Array<T, N>` 实现 `const char*` 的特化版本，使用不同的存储策略。

4. 编写函数模板 `findMax`，在数组中查找最大值。

5. 编写类模板 `Optional<T>`，模拟 `std::optional` 的基本功能。

## 参考链接

- [函数模板 - cppreference](https://en.cppreference.com/w/cpp/language/function_template)
- [类模板 - cppreference](https://en.cppreference.com/w/cpp/language/class_template)
- [模板特化 - cppreference](https://en.cppreference.com/w/cpp/language/template_specialization)
- [模板参数 - cppreference](https://en.cppreference.com/w/cpp/language/template_parameters)
- [C++ Core Guidelines: T.1 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rt-templates)
