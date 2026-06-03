# 异常处理与错误管理

## 概述

异常处理是 C++ 中管理错误的重要机制。与返回错误码不同，异常可以跨越多层函数调用传递错误信息，并且强制调用者处理错误。本章将系统讲解 try/catch/throw 的使用、异常层次结构、自定义异常设计、异常安全保证、`noexcept` 关键字，以及异常与错误码的选择策略。

## 异常基础：try / catch / throw

### 抛出和捕获异常

```cpp
#include <iostream>
#include <stdexcept>
#include <string>

double divide(double a, double b) {
    if (b == 0.0) {
        throw std::runtime_error("除数不能为零");
    }
    return a / b;
}

int main() {
    try {
        std::cout << "10 / 3 = " << divide(10, 3) << std::endl;
        std::cout << "10 / 0 = " << divide(10, 0) << std::endl;  // 抛出异常
        std::cout << "这行不会被执行" << std::endl;
    } catch (const std::runtime_error& e) {
        std::cerr << "运行时错误: " << e.what() << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "标准异常: " << e.what() << std::endl;
    } catch (...) {
        std::cerr << "未知异常" << std::endl;
    }

    std::cout << "程序继续执行" << std::endl;

    return 0;
}
```

### 异常的传播

```cpp
#include <iostream>
#include <stdexcept>

void level3() {
    throw std::runtime_error("level3 发生错误");
}

void level2() {
    level3();  // 不捕获，异常向上传播
}

void level1() {
    level2();  // 不捕获，异常继续向上传播
}

int main() {
    try {
        level1();  // 异常从 level3 一路传播到这里
    } catch (const std::exception& e) {
        std::cerr << "在 main 中捕获: " << e.what() << std::endl;
    }

    return 0;
}
```

### 栈展开（Stack Unwinding）

```cpp
#include <iostream>
#include <stdexcept>

class Resource {
public:
    Resource(const char* name) : name_(name) {
        std::cout << name_ << " 获取资源" << std::endl;
    }
    ~Resource() {
        std::cout << name_ << " 释放资源" << std::endl;
    }
private:
    const char* name_;
};

void riskyFunction() {
    Resource r1("r1");
    Resource r2("r2");

    throw std::runtime_error("出错了！");

    // r3 不会被构造
    // Resource r3("r3");
}  // 即使抛出异常，r1 和 r2 的析构函数也会被调用

int main() {
    try {
        riskyFunction();
    } catch (const std::exception& e) {
        std::cerr << "捕获: " << e.what() << std::endl;
    }
    // 输出：
    // r1 获取资源
    // r2 获取资源
    // r2 释放资源  ← 栈展开：析构函数按反序调用
    // r1 释放资源
    // 捕获: 出错了！

    return 0;
}
```

## 异常层次结构

C++ 标准库提供了一套异常类层次结构：

```cpp
#include <iostream>
#include <stdexcept>
#include <vector>
#include <string>

void demonstrateExceptions() {
    // std::exception（基类）
    // ├── std::logic_error（逻辑错误，程序可避免）
    // │   ├── std::invalid_argument     无效参数
    // │   ├── std::out_of_range         超出范围
    // │   ├── std::length_error         长度超限
    // │   └── std::domain_error         定义域错误
    // └── std::runtime_error（运行时错误，程序无法避免）
    //     ├── std::range_error          值域错误
    //     ├── std::overflow_error       上溢
    //     ├── std::underflow_error      下溢
    //     └── std::system_error         系统错误

    // 示例
    std::vector<int> vec = {1, 2, 3};
    try {
        vec.at(10);  // 抛出 std::out_of_range
    } catch (const std::out_of_range& e) {
        std::cerr << "越界: " << e.what() << std::endl;
    }

    try {
        std::stoi("not_a_number");  // 抛出 std::invalid_argument
    } catch (const std::invalid_argument& e) {
        std::cerr << "无效参数: " << e.what() << std::endl;
    }

    try {
        std::string s(1000000000000ULL, 'a');  // 可能抛出 std::length_error
    } catch (const std::length_error& e) {
        std::cerr << "长度错误: " << e.what() << std::endl;
    }
}

int main() {
    demonstrateExceptions();
    return 0;
}
```

## 自定义异常

```cpp
#include <iostream>
#include <stdexcept>
#include <string>
#include <memory>

// 自定义异常：继承标准异常类
class DatabaseException : public std::runtime_error {
public:
    DatabaseException(const std::string& message, int errorCode)
        : std::runtime_error(message), errorCode_(errorCode) {}

    int getErrorCode() const { return errorCode_; }

private:
    int errorCode_;
};

// 更复杂的自定义异常
class FileOperationException : public std::runtime_error {
public:
    enum class Operation { Read, Write, Open, Close };

    FileOperationException(Operation op, const std::string& filename,
                           const std::string& message)
        : std::runtime_error(message), operation_(op), filename_(filename) {}

    Operation getOperation() const { return operation_; }
    const std::string& getFilename() const { return filename_; }

    const char* what() const noexcept override {
        // 缓存 what() 消息
        static thread_local std::string buffer;
        buffer = "文件操作失败 [" + filename_ + "]: " +
                 std::runtime_error::what();
        return buffer.c_str();
    }

private:
    Operation operation_;
    std::string filename_;
};

// 使用自定义异常
class Database {
public:
    void connect(const std::string& host) {
        if (host.empty()) {
            throw DatabaseException("主机地址不能为空", 1001);
        }
        // 模拟连接
        connected_ = true;
    }

    void query(const std::string& sql) {
        if (!connected_) {
            throw DatabaseException("未连接到数据库", 1002);
        }
        if (sql.empty()) {
            throw DatabaseException("SQL 不能为空", 1003);
        }
        std::cout << "执行查询: " << sql << std::endl;
    }

private:
    bool connected_ = false;
};

int main() {
    Database db;

    try {
        db.connect("");  // 抛出异常
    } catch (const DatabaseException& e) {
        std::cerr << "数据库错误: " << e.what()
                  << " (代码: " << e.getErrorCode() << ")" << std::endl;
    }

    try {
        db.connect("localhost");
        db.query("");  // 抛出异常
    } catch (const DatabaseException& e) {
        std::cerr << "数据库错误: " << e.what()
                  << " (代码: " << e.getErrorCode() << ")" << std::endl;
    }

    return 0;
}
```

## 异常安全保证

C++ 定义了四种异常安全级别：

```cpp
#include <iostream>
#include <vector>
#include <string>
#include <stdexcept>

class SafeContainer {
public:
    // 1. 无保证：可能泄漏资源或破坏不变量
    void noGuarantee() {
        // 不做任何特殊处理
    }

    // 2. 基本保证：如果抛出异常，对象仍处于有效状态
    //    （可能改变了值，但没有泄漏或破坏）
    void basicGuarantee(const std::string& value) {
        // 先操作临时副本，成功后再替换
        std::string temp = value;
        // 这里可能抛出异常
        temp += " processed";
        // 如果到这里没异常，再做不可回退的操作
        data_ = temp;
    }

    // 3. 强保证：如果抛出异常，状态完全不变（原子操作）
    void strongGuarantee(const std::string& value) {
        std::string oldData = data_;  // 保存旧状态
        try {
            data_ = value;
            // 可能抛出异常的操作
            data_ += " processed";
        } catch (...) {
            data_ = oldData;  // 恢复旧状态
            throw;            // 重新抛出异常
        }
    }

    // 4. 不抛出保证（noexcept）：绝不抛出异常
    void nothrowGuarantee(int value) noexcept {
        count_ = value;  // 简单赋值，不抛出
    }

    std::string getData() const { return data_; }
    int getCount() const { return count_; }

private:
    std::string data_;
    int count_ = 0;
};
```

### Copy-and-Swap 惯用法（强异常安全）

```cpp
#include <iostream>
#include <cstring>
#include <utility>

class MyString {
public:
    MyString(const char* str) {
        size_ = std::strlen(str);
        data_ = new char[size_ + 1];
        std::strcpy(data_, str);
    }

    // 拷贝构造
    MyString(const MyString& other)
        : size_(other.size_) {
        data_ = new char[size_ + 1];
        std::strcpy(data_, other.data_);
    }

    // 移动构造
    MyString(MyString&& other) noexcept
        : size_(other.size_), data_(other.data_) {
        other.data_ = nullptr;
        other.size_ = 0;
    }

    // Copy-and-Swap 赋值运算符：强异常安全
    MyString& operator=(MyString other) {  // 注意：按值传参
        swap(*this, other);
        return *this;
    }  // other 离开作用域，自动释放旧资源

    friend void swap(MyString& a, MyString& b) noexcept {
        using std::swap;
        swap(a.data_, b.data_);
        swap(a.size_, b.size_);
    }

    ~MyString() { delete[] data_; }

    const char* c_str() const { return data_ ? data_ : ""; }

private:
    char* data_;
    size_t size_;
};

int main() {
    MyString s1("Hello");
    MyString s2("World");

    s1 = s2;  // 强异常安全：如果拷贝失败，s1 不变
    std::cout << "s1: " << s1.c_str() << std::endl;

    return 0;
}
```

## noexcept 关键字

`noexcept` 告诉编译器和调用者：这个函数不会抛出异常。

```cpp
#include <iostream>
#include <vector>
#include <type_traits>

// noexcept 声明：承诺不抛出异常
int simpleAdd(int a, int b) noexcept {
    return a + b;
}

// 条件 noexcept：根据表达式决定是否 noexcept
template <typename T>
void swapValues(T& a, T& b) noexcept(std::is_nothrow_move_constructible_v<T> &&
                                      std::is_nothrow_move_assignable_v<T>) {
    T temp = std::move(a);
    a = std::move(b);
    b = std::move(temp);
}

// noexcept 在移动构造函数中的重要性
class Important {
public:
    Important() { data_ = new int[1000000]; }

    // 移动构造函数必须 noexcept
    // 否则 std::vector 在扩容时会选择拷贝而非移动
    Important(Important&& other) noexcept
        : data_(other.data_) {
        other.data_ = nullptr;
    }

    ~Important() { delete[] data_; }

private:
    int* data_;
};

int main() {
    // noexcept 运算符：检查表达式是否 noexcept
    std::cout << "simpleAdd 是 noexcept: "
              << noexcept(simpleAdd(1, 2)) << std::endl;  // 1 (true)

    std::cout << "int 移动构造是 noexcept: "
              << std::is_nothrow_move_constructible_v<int> << std::endl;  // 1

    int a = 1, b = 2;
    swapValues(a, b);
    std::cout << "a = " << a << ", b = " << b << std::endl;

    // std::vector 扩容时使用移动（因为 Important 的移动构造是 noexcept）
    std::vector<Important> vec;
    vec.reserve(10);
    vec.push_back(Important());
    vec.push_back(Important());
    // 扩容时会移动而非拷贝

    return 0;
}
```

## 异常 vs 错误码

### 何时使用异常

```cpp
// 异常适合：
// 1. 真正的"异常"情况（不应该发生的事情）
// 2. 错误无法在本地处理
// 3. 构造函数失败（构造函数没有返回值）
// 4. 运算符重载中的错误（不能返回错误码）

class Config {
public:
    Config(const std::string& filename) {
        // 文件不存在是异常情况
        // 构造函数无法返回错误码
        // 必须使用异常
    }
};
```

### 何时使用错误码

```cpp
// 错误码适合：
// 1. 预期内的错误（如解析失败）
// 2. 性能敏感的代码路径
// 3. 嵌入式/实时系统
// 4. C 兼容接口

#include <system_error>

enum class ParseError {
    Success = 0,
    InvalidFormat,
    MissingField,
    OutOfRange
};

std::string parseErrorToString(ParseError err) {
    switch (err) {
        case ParseError::Success: return "成功";
        case ParseError::InvalidFormat: return "格式无效";
        case ParseError::MissingField: return "缺少字段";
        case ParseError::OutOfRange: return "超出范围";
        default: return "未知错误";
    }
}

// std::expected（C++23）或 std::optional 也是好的选择
#include <optional>

std::optional<int> parseInt(const std::string& str) {
    try {
        return std::stoi(str);
    } catch (...) {
        return std::nullopt;  // 解析失败
    }
}
```

## 常见陷阱与最佳实践

### 陷阱 1：在析构函数中抛出异常

```cpp
class BadClass {
public:
    ~BadClass() {
        // throw std::runtime_error("error");  // 危险！
        // 如果析构函数在栈展开期间抛出异常，
        // 会导致 std::terminate 直接终止程序
    }
};

// 正确做法：析构函数绝不抛出异常
class GoodClass {
public:
    ~GoodClass() noexcept {
        // 安全地清理资源
    }
};
```

### 陷阱 2：按值抛出和捕获

```cpp
// 不推荐：按值抛出（可能切片）
// throw std::runtime_error("error");

// 推荐：按值抛出，按 const 引用捕获
try {
    throw std::runtime_error("错误信息");
} catch (const std::exception& e) {  // const 引用
    std::cerr << e.what() << std::endl;
}
```

### 陷阱 3：裸指针 + 异常 = 内存泄漏

```cpp
void leakyFunction() {
    int* data = new int[1000];
    // 如果中间抛出异常，data 不会被 delete[]
    // doSomethingThatMayThrow();
    delete[] data;
}

// 正确做法：使用智能指针
void safeFunction() {
    auto data = std::make_unique<int[]>(1000);
    // 即使抛出异常，data 也会被自动释放
    // doSomethingThatMayThrow();
}
```

### 最佳实践

1. **按值抛出，按 const 引用捕获**
2. **析构函数绝不抛出异常（C++11 后默认 noexcept）**
3. **移动构造函数和移动赋值运算符标记 noexcept**
4. **用智能指针管理资源，避免异常导致的泄漏**
5. **优先使用标准异常类，自定义异常继承自它们**
6. **异常用于"异常"情况，错误码用于预期内的错误**
7. **了解并遵守函数的异常安全保证级别**

## 练习

1. 实现一个 `SafeDivision` 函数，在除数为零时抛出 `std::invalid_argument`。

2. 设计一个自定义异常层次结构：`AppException` 为基类，派生出 `NetworkException`、`DatabaseException` 和 `FileException`。

3. 用 Copy-and-Swap 实现一个动态数组类的赋值运算符，确保强异常安全。

4. 实现一个函数 `safeParseInt(const std::string&)`，返回 `std::optional<int>`。

5. 编写一个资源管理类，在析构函数中处理可能的错误（不抛出异常）。

## 参考链接

- [异常处理 - cppreference](https://en.cppreference.com/w/cpp/language/try_catch)
- [std::exception - cppreference](https://en.cppreference.com/w/cpp/error/exception)
- [std::runtime_error - cppreference](https://en.cppreference.com/w/cpp/error/runtime_error)
- [noexcept - cppreference](https://en.cppreference.com/w/cpp/language/noexcept)
- [异常安全 - cppreference](https://en.cppreference.com/w/cpp/language/exceptions)
- [C++ Core Guidelines: E.1 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-errors)
