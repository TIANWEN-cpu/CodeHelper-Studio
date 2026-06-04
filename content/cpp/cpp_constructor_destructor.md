# 构造函数与析构函数

## 课程概述

构造函数和析构函数是 C++ 类生命周期中最重要的两个特殊成员函数。构造函数负责对象的初始化，析构函数负责资源的清理。理解它们的类型、调用时机以及"三法则"，是写出健壮 C++ 代码的关键。

## 构造函数类型

### 默认构造函数

默认构造函数是不需要参数就能调用的构造函数。如果类没有定义任何构造函数，编译器会自动生成一个：

```cpp
#include <iostream>

class Widget {
public:
    // 默认构造函数
    Widget() {
        std::cout << "默认构造函数" << std::endl;
        value_ = 0;
    }

    int getValue() const { return value_; }

private:
    int value_;
};

int main() {
    Widget w1;       // 调用默认构造函数
    Widget w2{};     // C++11 统一初始化语法
    Widget* w3 = new Widget();  // 堆上创建

    std::cout << w1.getValue() << std::endl;  // 0

    delete w3;
    return 0;
}
```

**注意**：一旦你定义了任何构造函数，编译器就不再自动生成默认构造函数。

### 参数化构造函数

```cpp
#include <iostream>
#include <string>

class Person {
public:
    // 参数化构造函数
    Person(std::string name, int age)
        : name_(name), age_(age) {
        std::cout << "参数化构造函数: " << name_ << std::endl;
    }

    void introduce() const {
        std::cout << "我是 " << name_ << "，" << age_ << " 岁" << std::endl;
    }

private:
    std::string name_;
    int age_;
};

int main() {
    Person p1("Alice", 25);        // 直接初始化
    Person p2 = Person("Bob", 30); // 拷贝初始化
    Person p3{"Carol", 28};        // C++11 列表初始化

    p1.introduce();
    p2.introduce();
    p3.introduce();

    return 0;
}
```

## 成员初始化列表

成员初始化列表是在构造函数体执行之前初始化成员变量的方式：

```cpp
#include <iostream>

class Student {
public:
    // 推荐：使用成员初始化列表
    Student(std::string name, int id, double gpa)
        : name_(name),    // 在构造函数体之前初始化
          id_(id),
          gpa_(gpa)
    {
        // 构造函数体：此时成员变量已经初始化完成
        std::cout << "Student 创建: " << name_ << std::endl;
    }

    // 以下情况必须使用初始化列表：
    // 1. const 成员
    // 2. 引用成员
    // 3. 没有默认构造函数的类类型成员
    Student(int id, const std::string& label)
        : id_(id), label_(label)  // const 和引用必须用初始化列表
    {
    }

private:
    std::string name_;
    int id_;
    double gpa_;
    const std::string label_;  // const 成员
};
```

## 拷贝构造函数

拷贝构造函数用同类型的另一个对象来初始化新对象：

```cpp
#include <iostream>
#include <cstring>

class String {
public:
    // 构造函数
    String(const char* str) {
        size_ = std::strlen(str);
        data_ = new char[size_ + 1];
        std::strcpy(data_, str);
        std::cout << "构造函数: " << data_ << std::endl;
    }

    // 拷贝构造函数
    String(const String& other)
        : size_(other.size_) {
        data_ = new char[size_ + 1];
        std::strcpy(data_, other.data_);
        std::cout << "拷贝构造函数: " << data_ << std::endl;
    }

    ~String() {
        std::cout << "析构: " << data_ << std::endl;
        delete[] data_;
    }

    const char* c_str() const { return data_; }

private:
    char* data_;
    size_t size_;
};

int main() {
    String s1("Hello");
    String s2 = s1;   // 调用拷贝构造函数
    String s3(s1);    // 调用拷贝构造函数

    std::cout << "s1: " << s1.c_str() << std::endl;
    std::cout << "s2: " << s2.c_str() << std::endl;

    return 0;
}
```

### 浅拷贝 vs 深拷贝

```cpp
class BadString {
public:
    BadString(const char* str) {
        data_ = new char[std::strlen(str) + 1];
        std::strcpy(data_, str);
    }

    // 编译器自动生成的拷贝构造函数是"浅拷贝"：
    // BadString(const BadString& other) {
    //     data_ = other.data_;  // 只是复制指针，不是复制数据！
    // }
    // 这会导致两个对象的 data_ 指向同一块内存，析构时双重释放！

    ~BadString() {
        delete[] data_;
    }

private:
    char* data_;
};
```

**浅拷贝**只复制指针值，两个对象共享同一块内存。**深拷贝**分配新内存并复制内容，每个对象拥有独立的内存。

## 析构函数

析构函数在对象生命周期结束时自动调用，用于释放资源：

```cpp
#include <iostream>

class Resource {
public:
    Resource(const std::string& name) : name_(name) {
        std::cout << "获取资源: " << name_ << std::endl;
    }

    ~Resource() {
        std::cout << "释放资源: " << name_ << std::endl;
    }

private:
    std::string name_;
};

void demo() {
    Resource r1("数据库连接");
    Resource r2("文件句柄");
    // r1 和 r2 在函数结束时按创建的反序析构
}

int main() {
    demo();
    std::cout << "demo 函数已结束" << std::endl;

    // 栈对象：作用域结束自动析构
    Resource r3("临时资源");

    // 堆对象：必须手动 delete 才会析构
    Resource* r4 = new Resource("堆资源");
    delete r4;  // 手动触发析构

    return 0;
}
// r3 在这里自动析构
```

### 析构顺序

```cpp
#include <iostream>

class A {
public:
    A(const char* name) : name_(name) {
        std::cout << "构造: " << name_ << std::endl;
    }
    ~A() {
        std::cout << "析构: " << name_ << std::endl;
    }
private:
    const char* name_;
};

class Container {
public:
    Container() : b_("成员B"), a_("成员A") {
        std::cout << "Container 构造" << std::endl;
    }
    ~Container() {
        std::cout << "Container 析构" << std::endl;
    }
private:
    A a_;  // 按声明顺序构造
    A b_;
};

int main() {
    Container c;
    // 构造顺序: 成员A → 成员B → Container
    // 析构顺序: Container → 成员B → 成员A（反序）
    return 0;
}
```

## 三法则（Rule of Three）

如果一个类需要自定义的析构函数、拷贝构造函数或拷贝赋值运算符中的任何一个，那么它几乎肯定需要全部三个：

```cpp
#include <iostream>
#include <cstring>

class MyString {
public:
    // 1. 构造函数
    MyString(const char* str) {
        size_ = std::strlen(str);
        data_ = new char[size_ + 1];
        std::strcpy(data_, str);
    }

    // 2. 析构函数
    ~MyString() {
        delete[] data_;
    }

    // 3. 拷贝构造函数
    MyString(const MyString& other)
        : size_(other.size_) {
        data_ = new char[size_ + 1];
        std::strcpy(data_, other.data_);
    }

    // 4. 拷贝赋值运算符
    MyString& operator=(const MyString& other) {
        if (this != &other) {  // 防止自赋值
            delete[] data_;           // 释放旧资源
            size_ = other.size_;
            data_ = new char[size_ + 1];
            std::strcpy(data_, other.data_);
        }
        return *this;
    }

    const char* c_str() const { return data_; }

private:
    char* data_;
    size_t size_;
};

int main() {
    MyString s1("Hello");
    MyString s2 = s1;       // 拷贝构造
    MyString s3("World");
    s3 = s1;                // 拷贝赋值
    s3 = s3;                // 自赋值（被正确处理）

    std::cout << s1.c_str() << std::endl;
    std::cout << s2.c_str() << std::endl;
    std::cout << s3.c_str() << std::endl;

    return 0;
}
```

## explicit 关键字

`explicit` 防止编译器进行隐式类型转换：

```cpp
#include <iostream>

class Buffer {
public:
    explicit Buffer(int size) : size_(size) {
        std::cout << "创建大小为 " << size_ << " 的缓冲区" << std::endl;
    }

    int getSize() const { return size_; }

private:
    int size_;
};

void processBuffer(const Buffer& buf) {
    std::cout << "处理缓冲区，大小: " << buf.getSize() << std::endl;
}

int main() {
    Buffer buf1(100);       // OK
    // Buffer buf2 = 100;   // 错误！explicit 阻止隐式转换
    // processBuffer(200);  // 错误！不能隐式将 int 转为 Buffer

    processBuffer(Buffer(200));  // OK：显式构造

    return 0;
}
```

## 委托构造函数（C++11）

一个构造函数可以调用同一个类的另一个构造函数：

```cpp
#include <iostream>

class Config {
public:
    // 主构造函数
    Config(std::string name, int value, bool enabled)
        : name_(name), value_(value), enabled_(enabled) {
        std::cout << "完整构造函数" << std::endl;
    }

    // 委托构造函数：调用上面的构造函数
    Config(std::string name, int value)
        : Config(name, value, true) {  // 委托给三参数版本
        std::cout << "委托构造（默认 enabled=true）" << std::endl;
    }

    // 另一个委托构造函数
    Config(std::string name)
        : Config(name, 0, false) {  // 委托给三参数版本
        std::cout << "委托构造（默认 value=0, enabled=false）" << std::endl;
    }

private:
    std::string name_;
    int value_;
    bool enabled_;
};

int main() {
    Config c1("full", 42, true);
    Config c2("partial", 10);
    Config c3("minimal");

    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：忘记实现三法则

```cpp
class BadResource {
public:
    BadResource() { data_ = new int[100]; }
    ~BadResource() { delete[] data_; }
    // 缺少拷贝构造函数和拷贝赋值运算符！
    // 编译器生成的版本是浅拷贝，导致双重释放
private:
    int* data_;
};
```

### 陷阱 2：自赋值未处理

```cpp
MyString& operator=(const MyString& other) {
    // delete[] data_;  // 如果 this == &other，这里就释放了 other 的数据！
    // 正确做法：先检查自赋值
    if (this != &other) {
        delete[] data_;
        // ...
    }
    return *this;
}
```

### 最佳实践

1. **优先使用成员初始化列表**
2. **遵循三法则（或五法则，含移动语义）**
3. **用 `explicit` 标记单参数构造函数**
4. **析构函数中只释放资源，不做其他事情**
5. **考虑使用智能指针避免手动内存管理**

## 练习

### 练习 1：动态数组类

实现一个 `IntArray` 类，包含动态数组的构造、拷贝构造、拷贝赋值和析构。

### 练习 2：委托构造函数

为 `Rectangle` 类实现委托构造函数：支持 `Rectangle(width, height)` 和 `Rectangle(side)`（正方形）。

### 练习 3：explicit 实验

创建一个 `Temperature` 类，构造函数接受 `double` 参数。分别用和不用 `explicit` 测试隐式转换。

### 练习 4：三法则验证

创建一个管理 `int*` 的类，故意不实现拷贝构造函数，观察浅拷贝导致的问题。

### 练习 5：资源管理类

设计一个 `FileHandle` 类，在构造函数中"打开文件"（打印消息），在析构函数中"关闭文件"。

## 参考链接

- [C++ 构造函数 - cppreference](https://en.cppreference.com/w/cpp/language/constructor)
- [C++ 析构函数 - cppreference](https://en.cppreference.com/w/cpp/language/destructor)
- [C++ 拷贝构造函数 - cppreference](https://en.cppreference.com/w/cpp/language/copy_constructor)
- [C++ 拷贝赋值运算符 - cppreference](https://en.cppreference.com/w/cpp/language/copy_assignment)
- [C++ explicit 关键字 - cppreference](https://en.cppreference.com/w/cpp/language/explicit)
- [C++ Core Guidelines: C.21 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rc-special)
