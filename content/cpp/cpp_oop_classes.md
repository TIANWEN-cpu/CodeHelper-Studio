# 类与对象入门

## 课程概述

面向对象编程（OOP）是 C++ 的核心范式之一。类（class）是对象的蓝图，封装了数据（成员变量）和操作数据的行为（成员函数）。本章将带你学习如何定义类、控制访问权限、编写构造函数，以及理解封装的设计原则。

## 类的定义

类是一种用户自定义的数据类型，它将数据和操作数据的函数绑定在一起：

```cpp
#include <iostream>
#include <string>

// 类的定义
class Student {
public:
    // 成员变量（属性）
    std::string name;
    int age;
    double gpa;

    // 成员函数（方法）
    void introduce() {
        std::cout << "你好，我是 " << name
                  << "，今年 " << age << " 岁，"
                  << "GPA 是 " << gpa << std::endl;
    }

    bool isHonorStudent() const {
        return gpa >= 3.5;
    }
};

int main() {
    // 创建对象（实例化）
    Student s1;
    s1.name = "Alice";
    s1.age = 20;
    s1.gpa = 3.8;

    Student s2;
    s2.name = "Bob";
    s2.age = 21;
    s2.gpa = 3.2;

    // 调用成员函数
    s1.introduce();          // 你好，我是 Alice，今年 20 岁，GPA 是 3.8
    s2.introduce();          // 你好，我是 Bob，今年 21 岁，GPA 是 3.2

    std::cout << s1.name << " 是优等生: " << s1.isHonorStudent() << std::endl;
    std::cout << s2.name << " 是优等生: " << s2.isHonorStudent() << std::endl;

    return 0;
}
```

## 访问控制修饰符

C++ 提供了三种访问控制级别，用于实现**封装**——隐藏内部实现细节，只暴露必要的接口：

```cpp
#include <iostream>
#include <string>

class BankAccount {
public:
    // public: 对外公开，任何人都可以访问
    BankAccount(std::string owner, double balance)
        : owner_(owner), balance_(balance) {}

    void deposit(double amount) {
        if (amount > 0) {
            balance_ += amount;
            std::cout << "存入 " << amount << "，余额: " << balance_ << std::endl;
        }
    }

    bool withdraw(double amount) {
        if (amount > 0 && amount <= balance_) {
            balance_ -= amount;
            std::cout << "取出 " << amount << "，余额: " << balance_ << std::endl;
            return true;
        }
        std::cout << "取款失败" << std::endl;
        return false;
    }

    double getBalance() const {
        return balance_;
    }

private:
    // private: 仅类内部可以访问，外部无法直接访问
    std::string owner_;   // 账户持有人
    double balance_;      // 余额

    // 私有辅助函数
    void logTransaction(const std::string& type, double amount) {
        std::cout << "[" << type << "] " << owner_ << ": " << amount << std::endl;
    }

protected:
    // protected: 类内部和派生类可以访问（继承章节会详细讲解）
    int accountId_;
};

int main() {
    BankAccount account("Alice", 1000.0);

    // 通过 public 接口操作
    account.deposit(500);       // OK
    account.withdraw(200);      // OK
    std::cout << "余额: " << account.getBalance() << std::endl;

    // account.balance_ = 999999;  // 编译错误！private 成员无法从外部访问
    // account.owner_ = "Eve";     // 编译错误！

    return 0;
}
```

### 三种访问级别对比

| 修饰符      | 类内部 | 派生类   | 外部代码 |
| ----------- | ------ | -------- | -------- |
| `public`    | 可访问 | 可访问   | 可访问   |
| `protected` | 可访问 | 可访问   | 不可访问 |
| `private`   | 可访问 | 不可访问 | 不可访问 |

## 成员变量与成员函数

```cpp
#include <iostream>
#include <string>

class Rectangle {
public:
    // 成员函数可以访问所有成员变量
    double area() const {
        return width_ * height_;  // 直接访问成员变量
    }

    double perimeter() const {
        return 2 * (width_ + height_);
    }

    // 修改成员变量的函数（不能标记为 const）
    void resize(double newWidth, double newHeight) {
        width_ = newWidth;
        height_ = newHeight;
    }

    // 访问器（getter）
    double getWidth() const { return width_; }
    double getHeight() const { return height_; }

    // 修改器（setter）
    void setWidth(double w) {
        if (w > 0) width_ = w;
    }

private:
    double width_;
    double height_;
};

int main() {
    Rectangle rect;
    rect.resize(5.0, 3.0);
    std::cout << "面积: " << rect.area() << std::endl;         // 15
    std::cout << "周长: " << rect.perimeter() << std::endl;    // 16

    return 0;
}
```

## 构造函数

构造函数是一种特殊的成员函数，在创建对象时自动调用，用于初始化成员变量：

```cpp
#include <iostream>
#include <string>

class Person {
public:
    // 默认构造函数（无参数）
    Person() {
        name_ = "Unknown";
        age_ = 0;
        std::cout << "默认构造函数被调用" << std::endl;
    }

    // 带参数的构造函数
    Person(std::string name, int age) {
        name_ = name;
        age_ = age;
        std::cout << "参数构造函数被调用" << std::endl;
    }

    void introduce() const {
        std::cout << "我是 " << name_ << "，" << age_ << " 岁" << std::endl;
    }

private:
    std::string name_;
    int age_;
};

int main() {
    Person p1;                    // 调用默认构造函数
    Person p2("Alice", 25);       // 调用参数构造函数
    Person p3 = Person("Bob", 30); // 显式调用
    Person* p4 = new Person("Carol", 35);  // 堆上创建

    p1.introduce();
    p2.introduce();

    delete p4;  // 记得释放堆内存
    return 0;
}
```

### 成员初始化列表（推荐写法）

```cpp
class Student {
public:
    // 推荐：使用成员初始化列表
    Student(std::string name, int id, double gpa)
        : name_(name), id_(id), gpa_(gpa)  // 初始化列表
    {
        // 构造函数体（此时成员变量已经初始化完成）
    }

    // 不推荐：在构造函数体内赋值
    // Student(std::string name, int id, double gpa) {
    //     name_ = name;   // 这是赋值，不是初始化
    //     id_ = id;
    //     gpa_ = gpa;
    // }

private:
    std::string name_;
    int id_;
    double gpa_;
};
```

**为什么推荐初始化列表？** 对于某些类型（如 `const` 成员、引用成员），必须使用初始化列表。而且初始化列表比赋值更高效，避免了先默认构造再赋值的两步操作。

## this 指针

每个成员函数都有一个隐含的参数 `this`，它是指向当前对象的指针：

```cpp
#include <iostream>

class Counter {
public:
    Counter(int count) : count_(count) {}

    // this 指向当前对象
    void print() const {
        std::cout << "count = " << this->count_ << std::endl;
        // 等价于 std::cout << "count = " << count_ << std::endl;
    }

    // 链式调用：返回 *this
    Counter& increment() {
        ++count_;
        return *this;  // 返回当前对象的引用
    }

    Counter& add(int n) {
        count_ += n;
        return *this;
    }

private:
    int count_;
};

int main() {
    Counter c(0);
    c.increment().increment().add(5).increment();  // 链式调用
    c.print();  // count = 8

    return 0;
}
```

## 封装原则

封装是 OOP 的三大基本原则之一（另外两个是继承和多态）。良好的封装意味着：

1. **将数据设为 private**：防止外部代码直接修改内部状态
2. **通过 public 接口访问**：提供受控的访问方式
3. **在接口中验证数据**：确保对象始终处于有效状态

```cpp
// 糟糕的封装：所有成员都是 public
class BadStudent {
public:
    std::string name;
    int age;     // 可以被设为负数！
    double gpa;  // 可以被设为 10.0！
};

// 良好的封装：数据私有，通过接口控制
class GoodStudent {
public:
    GoodStudent(std::string name, int age, double gpa)
        : name_(name) {
        setAge(age);
        setGpa(gpa);
    }

    void setAge(int age) {
        if (age >= 0 && age <= 150) {
            age_ = age;
        }
    }

    void setGpa(double gpa) {
        if (gpa >= 0.0 && gpa <= 4.0) {
            gpa_ = gpa;
        }
    }

    int getAge() const { return age_; }
    double getGpa() const { return gpa_; }

private:
    std::string name_;
    int age_;
    double gpa_;
};
```

## 分离声明与定义

在实际项目中，通常将类的声明放在头文件（`.h`），定义放在源文件（`.cpp`）：

```cpp
// student.h - 头文件：类的声明
#ifndef STUDENT_H
#define STUDENT_H

#include <string>

class Student {
public:
    Student(std::string name, int id);
    void introduce() const;
    std::string getName() const;
    int getId() const;

private:
    std::string name_;
    int id_;
};

#endif  // STUDENT_H
```

```cpp
// student.cpp - 源文件：成员函数的定义
#include "student.h"
#include <iostream>

Student::Student(std::string name, int id)
    : name_(name), id_(id) {}

void Student::introduce() const {
    std::cout << "我是 " << name_ << "，学号 " << id_ << std::endl;
}

std::string Student::getName() const {
    return name_;
}

int Student::getId() const {
    return id_;
}
```

```cpp
// main.cpp - 主程序
#include "student.h"

int main() {
    Student s("Alice", 1001);
    s.introduce();
    return 0;
}
```

编译：

```bash
g++ -std=c++17 -Wall main.cpp student.cpp -o main
```

## 常见陷阱与最佳实践

### 陷阱 1：类定义末尾忘记分号

```cpp
class MyClass {
public:
    int x;
}  // 编译错误！缺少分号
```

### 陷阱 2：在头文件中定义函数导致重复定义

```cpp
// bad.h
class Bad {
public:
    void foo() {  // 在头文件中定义（非模板）会导致链接错误
        // ...
    }
};
```

### 最佳实践

1. **成员变量用下划线后缀命名**：`name_`、`age_`，避免与参数名冲突
2. **优先使用成员初始化列表**
3. **数据成员设为 private**
4. **只提供必要的 public 接口**
5. **使用 `#ifndef` 守卫防止头文件重复包含**

## 练习

### 练习 1：Book 类

设计一个 `Book` 类，包含书名、作者、页数、价格。提供 getter/setter，确保页数和价格为正数。

### 练习 2：Counter 类

设计一个 `Counter` 类，支持 `increment()`、`decrement()`、`reset()` 和 `getValue()`，支持链式调用。

### 练习 3：Date 类

设计一个 `Date` 类，包含年、月、日。验证日期的合法性（月份 1-12，日期根据月份和闰年判断）。

### 练习 4：分离编译

将练习 1 的 `Book` 类拆分为 `book.h` 和 `book.cpp`，编写 `main.cpp` 使用它。

### 练习 5：this 指针

为一个 `Calculator` 类实现链式调用：`calc.add(5).subtract(2).multiply(3).getResult()`。

## 参考链接

- [C++ 类 - cppreference](https://en.cppreference.com/w/cpp/language/classes)
- [C++ 访问控制 - cppreference](https://en.cppreference.com/w/cpp/language/access)
- [C++ 构造函数 - cppreference](https://en.cppreference.com/w/cpp/language/constructor)
- [C++ this 指针 - cppreference](https://en.cppreference.com/w/cpp/language/this)
- [C++ 封装原则](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rc-private)
