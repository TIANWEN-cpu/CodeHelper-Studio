# 移动语义与右值引用

## 概述

移动语义是 C++11 引入的最重要特性之一，它允许程序"窃取"临时对象的资源而非复制它们，从而大幅提升性能。右值引用是实现移动语义的基础。理解移动语义不仅能写出更高效的代码，还能深入理解现代 C++ 中 `std::move`、`std::unique_ptr`、`std::vector` 等核心组件的工作原理。

## 左值 vs 右值

### 基本概念

- **左值（lvalue）**：有名字、可以取地址的表达式，生命周期超过当前表达式
- **右值（rvalue）**：临时对象、字面量，生命周期通常只到当前表达式结束

```cpp
#include <iostream>
#include <string>

int main() {
    int a = 10;        // a 是左值（有名字）
    int b = 20;        // b 是左值
    int c = a + b;     // a + b 是右值（临时结果）

    std::string s1 = "hello";   // s1 是左值
    std::string s2 = s1 + "!";  // s1 + "!" 是右值（临时 string）

    // 左值可以取地址
    std::cout << "&a = " << &a << std::endl;
    // std::cout << &(a + b) << std::endl;  // 错误！右值不能取地址

    // 字面量是右值
    // int& ref = 42;  // 错误！不能将右值绑定到左值引用
    const int& cref = 42;  // OK：const 左值引用可以绑定右值

    return 0;
}
```

### 判断左值/右值的经验法则

```cpp
#include <iostream>

// 简单判断方法：
// 能放在赋值运算符左边的 → 左值
// 只能放在赋值运算符右边的 → 右值

int getValue() { return 42; }   // 返回右值
int& getRef(int& x) { return x; }  // 返回左值

int main() {
    int x = 10;

    // x 是左值：有名字，可以取地址
    // getValue() 是右值：临时值，没有名字
    // getRef(x) 是左值：返回的是引用

    int a = x;           // x 是左值
    int b = getValue();  // getValue() 是右值
    int& ref = getRef(x); // getRef(x) 是左值引用

    return 0;
}
```

## 右值引用

右值引用（`T&&`）是 C++11 引入的新引用类型，专门用于绑定右值（临时对象）。

```cpp
#include <iostream>
#include <string>

int main() {
    int x = 10;

    // 左值引用：绑定左值
    int& lref = x;

    // 右值引用：绑定右值
    int&& rref = 42;
    int&& rref2 = x + 1;

    // 右值引用可以被修改
    rref = 100;
    std::cout << "rref = " << rref << std::endl;  // 100

    // 右值引用延长了临时对象的生命周期
    std::string&& str = std::string("temporary");
    std::cout << "str = " << str << std::endl;  // 仍然有效

    // 左值不能绑定到右值引用
    // int&& bad = x;  // 编译错误！

    return 0;
}
```

### 函数重载：左值引用 vs 右值引用

```cpp
#include <iostream>
#include <string>

// 左值引用版本
void processValue(const std::string& s) {
    std::cout << "左值引用版本（拷贝）: " << s << std::endl;
}

// 右值引用版本
void processValue(std::string&& s) {
    std::cout << "右值引用版本（移动）: " << s << std::endl;
}

int main() {
    std::string name = "Alice";
    processValue(name);              // 调用左值引用版本
    processValue(std::string("Bob")); // 调用右值引用版本
    processValue("Charlie");          // 调用右值引用版本（字面量构造临时 string）

    return 0;
}
```

## 移动构造函数与移动赋值运算符

移动构造函数和移动赋值运算符"窃取"源对象的资源，而不是复制它们。

### 为什么需要移动语义

```cpp
#include <iostream>
#include <cstring>

class MyString {
public:
    // 构造函数
    MyString(const char* str) {
        size_ = std::strlen(str);
        data_ = new char[size_ + 1];
        std::strcpy(data_, str);
        std::cout << "构造: " << data_ << std::endl;
    }

    // 拷贝构造函数（深拷贝：分配新内存）
    MyString(const MyString& other)
        : size_(other.size_) {
        data_ = new char[size_ + 1];
        std::strcpy(data_, other.data_);
        std::cout << "拷贝构造: " << data_ << std::endl;
    }

    // 移动构造函数（窃取资源：不分配新内存）
    MyString(MyString&& other) noexcept
        : size_(other.size_), data_(other.data_) {
        other.data_ = nullptr;  // 源对象放弃资源
        other.size_ = 0;
        std::cout << "移动构造: " << data_ << std::endl;
    }

    // 拷贝赋值运算符
    MyString& operator=(const MyString& other) {
        std::cout << "拷贝赋值" << std::endl;
        if (this != &other) {
            delete[] data_;
            size_ = other.size_;
            data_ = new char[size_ + 1];
            std::strcpy(data_, other.data_);
        }
        return *this;
    }

    // 移动赋值运算符
    MyString& operator=(MyString&& other) noexcept {
        std::cout << "移动赋值" << std::endl;
        if (this != &other) {
            delete[] data_;
            data_ = other.data_;   // 窃取指针
            size_ = other.size_;
            other.data_ = nullptr;  // 源对象放弃资源
            other.size_ = 0;
        }
        return *this;
    }

    ~MyString() {
        std::cout << "析构: " << (data_ ? data_ : "(空)") << std::endl;
        delete[] data_;
    }

    const char* c_str() const { return data_ ? data_ : "(空)"; }

private:
    char* data_;
    size_t size_;
};

int main() {
    std::cout << "=== 拷贝构造 ===" << std::endl;
    MyString s1("Hello");
    MyString s2 = s1;  // 拷贝构造：分配新内存，复制内容

    std::cout << "\n=== 移动构造 ===" << std::endl;
    MyString s3 = MyString("World");  // 移动构造：窃取临时对象的内存
    // 编译器可能优化掉移动（RVO），但语义上是移动

    std::cout << "\n=== 拷贝赋值 ===" << std::endl;
    MyString s4("Test");
    s4 = s1;  // 拷贝赋值

    std::cout << "\n=== 移动赋值 ===" << std::endl;
    MyString s5("Another");
    s5 = MyString("Moved");  // 移动赋值：窃取临时对象

    std::cout << "\n=== 结果 ===" << std::endl;
    std::cout << "s1: " << s1.c_str() << std::endl;
    std::cout << "s3: " << s3.c_str() << std::endl;
    std::cout << "s5: " << s5.c_str() << std::endl;

    return 0;
}
```

**关键区别**：

- **拷贝**：分配新内存 → 复制内容 → 深拷贝（慢）
- **移动**：窃取指针 → 源对象置空 → 浅拷贝（快）

## std::move：强制移动

`std::move` 将左值转换为右值引用，从而允许移动语义。

```cpp
#include <iostream>
#include <string>
#include <vector>

int main() {
    std::string source = "Hello, World!";
    std::cout << "移动前 source: " << source << std::endl;

    // std::move 将 source 转为右值引用
    std::string target = std::move(source);

    std::cout << "移动后 target: " << target << std::endl;
    std::cout << "移动后 source: \"" << source << "\"" << std::endl;
    // source 现在处于"有效但未指定"的状态
    // 不要使用 source 的值，但可以给它赋新值

    source = "New Value";  // OK：可以重新赋值
    std::cout << "重新赋值后 source: " << source << std::endl;

    // std::move 的实际效果
    std::vector<int> vec1 = {1, 2, 3, 4, 5};
    std::vector<int> vec2 = std::move(vec1);

    std::cout << "vec2 大小: " << vec2.size() << std::endl;  // 5
    std::cout << "vec1 大小: " << vec1.size() << std::endl;  // 0（被移走了）

    return 0;
}
```

### std::move 的本质

```cpp
// std::move 的简化实现
template <typename T>
typename std::remove_reference<T>::type&& move(T&& t) {
    return static_cast<typename std::remove_reference<T>::type&&>(t);
}

// std::move 不移动任何东西！它只是类型转换
// 真正的移动发生在移动构造函数/移动赋值运算符中
```

## 移动语义在 STL 中的应用

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <algorithm>

int main() {
    // std::vector 的移动
    std::vector<std::string> vec1 = {"a", "b", "c"};
    std::vector<std::string> vec2 = std::move(vec1);
    // vec2 直接获取 vec1 的内部数组指针，O(1) 操作
    std::cout << "vec1 大小: " << vec1.size() << std::endl;  // 0
    std::cout << "vec2 大小: " << vec2.size() << std::endl;  // 3

    // std::unique_ptr 的移动（独占所有权转移）
    auto ptr1 = std::make_unique<int>(42);
    // auto ptr2 = ptr1;  // 错误！unique_ptr 不可拷贝
    auto ptr2 = std::move(ptr1);  // OK：移动所有权
    std::cout << "ptr2: " << *ptr2 << std::endl;

    // 容器的 emplace_back（原地构造，避免临时对象）
    std::vector<std::string> names;
    names.emplace_back("Alice");   // 直接在容器内构造
    names.push_back("Bob");        // 可能涉及拷贝或移动
    names.push_back(std::string("Charlie"));  // 移动（右值）

    // std::swap 使用移动语义
    std::string a = "hello", b = "world";
    std::swap(a, b);  // 内部使用移动语义，非常高效

    return 0;
}
```

## 完美转发与 std::forward

完美转发允许函数模板将参数"原样"传递给另一个函数，保留其左值/右值属性。

### 万能引用（Universal Reference）

```cpp
#include <iostream>
#include <string>

template <typename T>
void wrapper(T&& param) {
    // T&& 在模板中是"万能引用"：
    // - 如果传入左值，T 推导为 T&，param 是 T&
    // - 如果传入右值，T 推导为 T，param 是 T&&
    if (std::is_lvalue_reference<T>::value) {
        std::cout << "左值传入" << std::endl;
    } else {
        std::cout << "右值传入" << std::endl;
    }
}

int main() {
    int x = 10;
    wrapper(x);        // 左值传入
    wrapper(42);       // 右值传入
    wrapper(std::move(x));  // 右值传入

    return 0;
}
```

### std::forward：完美转发

```cpp
#include <iostream>
#include <string>
#include <utility>

class Widget {
public:
    Widget(const std::string& s) {
        std::cout << "拷贝构造: " << s << std::endl;
    }
    Widget(std::string&& s) {
        std::cout << "移动构造: " << s << std::endl;
    }
};

// 没有完美转发的问题
template <typename T>
void badFactory(T arg) {
    // arg 在函数体内总是左值（有名字）
    Widget w(arg);  // 总是调用拷贝构造！
}

// 完美转发
template <typename T>
void goodFactory(T&& arg) {
    // std::forward 保留原始的左值/右值属性
    Widget w(std::forward<T>(arg));
}

int main() {
    std::string name = "Alice";

    std::cout << "=== 没有完美转发 ===" << std::endl;
    badFactory(name);              // 拷贝
    badFactory(std::string("Bob")); // 还是拷贝！

    std::cout << "\n=== 完美转发 ===" << std::endl;
    goodFactory(name);              // 拷贝构造（传入左值）
    goodFactory(std::string("Bob")); // 移动构造（传入右值）

    return 0;
}
```

### 完美转发在 emplace 中的应用

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <memory>

class Person {
public:
    Person(std::string name, int age)
        : name_(std::move(name)), age_(age) {
        std::cout << "Person 构造: " << name_ << ", " << age_ << std::endl;
    }
private:
    std::string name_;
    int age_;
};

int main() {
    std::vector<Person> people;

    // push_back：先构造临时对象，再移动/拷贝进容器
    people.push_back(Person("Alice", 25));

    // emplace_back：完美转发参数，直接在容器内存中原地构造
    people.emplace_back("Bob", 30);   // 无临时对象
    people.emplace_back("Charlie", 35);

    // make_shared 也是完美转发的典型应用
    auto person = std::make_shared<Person>("David", 40);

    return 0;
}
```

## 移动语义的规则与陷阱

### 规则 0/3/5

```cpp
// 五法则（Rule of Five）：C++11 扩展了三法则
class Resource {
public:
    // 1. 析构函数
    ~Resource() { delete[] data_; }

    // 2. 拷贝构造函数
    Resource(const Resource& other)
        : size_(other.size_) {
        data_ = new char[size_];
        std::memcpy(data_, other.data_, size_);
    }

    // 3. 拷贝赋值运算符
    Resource& operator=(const Resource& other) {
        if (this != &other) {
            delete[] data_;
            size_ = other.size_;
            data_ = new char[size_];
            std::memcpy(data_, other.data_, size_);
        }
        return *this;
    }

    // 4. 移动构造函数
    Resource(Resource&& other) noexcept
        : size_(other.size_), data_(other.data_) {
        other.data_ = nullptr;
        other.size_ = 0;
    }

    // 5. 移动赋值运算符
    Resource& operator=(Resource&& other) noexcept {
        if (this != &other) {
            delete[] data_;
            data_ = other.data_;
            size_ = other.size_;
            other.data_ = nullptr;
            other.size_ = 0;
        }
        return *this;
    }

private:
    char* data_;
    size_t size_;
};
```

### 陷阱 1：移动后使用源对象

```cpp
std::string s1 = "Hello";
std::string s2 = std::move(s1);
// std::cout << s1;  // 危险！s1 处于有效但未指定状态
s1 = "New";  // OK：可以重新赋值
```

### 陷阱 2：对 const 对象使用 std::move

```cpp
const std::string s = "Hello";
std::string s2 = std::move(s);  // 实际调用的是拷贝构造！
// const 右值引用只能绑定到 const 右值，移动构造需要非 const 右值
```

### 陷阱 3：忘记 noexcept

```cpp
// 移动构造函数应该标记 noexcept
// 否则 std::vector 在扩容时可能选择拷贝而非移动
class BadMove {
public:
    BadMove(BadMove&& other)  // 没有 noexcept！
        : data_(other.data_) {
        other.data_ = nullptr;
    }
    // std::vector 在扩容时担心异常安全，会放弃移动改用拷贝
};
```

### 最佳实践

1. **移动构造函数和移动赋值运算符标记 `noexcept`**
2. **移动后不要使用源对象的值**
3. **优先使用 `emplace_back` 而非 `push_back`**
4. **`std::move` 只是类型转换，真正的移动在移动构造函数中**
5. **不要对 const 对象使用 `std::move`**
6. **遵循五法则：自定义了析构函数/拷贝构造/拷贝赋值，也要考虑移动版本**

## 练习

1. 为 `DynamicArray` 类实现移动构造函数和移动赋值运算符。

2. 编写一个函数模板 `swap(T&& a, T&& b)`，使用移动语义实现交换。

3. 实现一个 `Box` 类模板，包含完美转发的 `emplace` 方法。

4. 比较 `push_back` 和 `emplace_back` 的性能差异（使用自定义类，打印构造/移动次数）。

5. 实现一个简易的 `unique_ptr`，包含移动语义支持。

## 参考链接

- [右值引用 - cppreference](https://en.cppreference.com/w/cpp/language/reference#Rvalue_references)
- [移动构造函数 - cppreference](https://en.cppreference.com/w/cpp/language/move_constructor)
- [移动赋值运算符 - cppreference](https://en.cppreference.com/w/cpp/language/move_assignment)
- [std::move - cppreference](https://en.cppreference.com/w/cpp/utility/move)
- [std::forward - cppreference](https://en.cppreference.com/w/cpp/utility/forward)
- [完美转发 - cppreference](https://en.cppreference.com/w/cpp/utility/forward)
- [C++ Core Guidelines: F.18 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rf-consume)
