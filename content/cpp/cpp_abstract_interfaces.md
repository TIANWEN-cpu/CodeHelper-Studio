# 抽象类与设计原则

## 课程概述

抽象类是 C++ 中定义接口的主要方式。本章将学习如何使用纯虚函数设计接口、理解 SOLID 设计原则在 C++ 中的应用、掌握依赖注入和里氏替换原则，以及学会在继承和组合之间做出正确选择。

## 接口设计：纯虚函数

在 C++ 中，接口通常通过只包含纯虚函数的抽象类来实现：

```cpp
#include <iostream>
#include <string>
#include <vector>

// 接口：只包含纯虚函数的抽象类
class Drawable {
public:
    virtual void draw() const = 0;
    virtual void resize(double factor) = 0;
    virtual ~Drawable() = default;  // 虚析构函数
};

class Serializable {
public:
    virtual std::string serialize() const = 0;
    virtual void deserialize(const std::string& data) = 0;
    virtual ~Serializable() = default;
};

// 实现类：可以实现多个接口（C++ 的多重继承）
class Circle : public Drawable, public Serializable {
public:
    Circle(double radius) : radius_(radius) {}

    void draw() const override {
        std::cout << "绘制圆形，半径: " << radius_ << std::endl;
    }

    void resize(double factor) override {
        radius_ *= factor;
    }

    std::string serialize() const override {
        return "Circle:" + std::to_string(radius_);
    }

    void deserialize(const std::string& data) override {
        // 解析 "Circle:5.000000" 格式
        size_t pos = data.find(':');
        if (pos != std::string::npos) {
            radius_ = std::stod(data.substr(pos + 1));
        }
    }

private:
    double radius_;
};

int main() {
    // 通过接口指针使用对象
    Drawable* d = new Circle(5.0);
    d->draw();
    d->resize(2.0);
    d->draw();
    delete d;

    Serializable* s = new Circle(3.0);
    std::string data = s->serialize();
    std::cout << "序列化: " << data << std::endl;
    delete s;

    return 0;
}
```

### 接口 vs 抽象基类

```cpp
// 接口：只定义契约，不包含实现
class ILogger {
public:
    virtual void log(const std::string& message) = 0;
    virtual ~ILogger() = default;
};

// 抽象基类：包含部分实现
class Shape {
public:
    virtual double area() const = 0;           // 纯虚
    virtual double perimeter() const = 0;      // 纯虚
    virtual void printInfo() const {           // 有默认实现
        std::cout << "面积: " << area() << std::endl;
    }
    virtual ~Shape() = default;
};
```

## SOLID 原则在 C++ 中的应用

### S - 单一职责原则（Single Responsibility）

每个类只负责一件事：

```cpp
// 糟糕：一个类做了太多事
class BadUserManager {
public:
    void createUser(const std::string& name) { /* ... */ }
    void saveToDatabase() { /* ... */ }
    void sendEmail() { /* ... */ }
    void generateReport() { /* ... */ }
};

// 良好：职责分离
class User {
public:
    void setName(const std::string& name) { name_ = name; }
    std::string getName() const { return name_; }
private:
    std::string name_;
};

class UserRepository {
public:
    void save(const User& user) { /* 保存到数据库 */ }
    User findById(int id) { /* 从数据库查询 */ }
};

class EmailService {
public:
    void sendWelcomeEmail(const User& user) { /* 发送邮件 */ }
};
```

### O - 开闭原则（Open-Closed）

对扩展开放，对修改关闭：

```cpp
#include <iostream>
#include <vector>
#include <memory>

class PaymentMethod {
public:
    virtual void pay(double amount) const = 0;
    virtual ~PaymentMethod() = default;
};

class CreditCard : public PaymentMethod {
public:
    void pay(double amount) const override {
        std::cout << "信用卡支付: ¥" << amount << std::endl;
    }
};

class PayPal : public PaymentMethod {
public:
    void pay(double amount) const override {
        std::cout << "PayPal 支付: ¥" << amount << std::endl;
    }
};

// 新增支付方式不需要修改 PaymentProcessor
class PaymentProcessor {
public:
    void process(const PaymentMethod& method, double amount) {
        method.pay(amount);  // 通过接口调用，不依赖具体类型
    }
};

int main() {
    PaymentProcessor processor;
    processor.process(CreditCard(), 100.0);
    processor.process(PayPal(), 50.0);
    return 0;
}
```

### L - 里氏替换原则（Liskov Substitution）

派生类对象应该能替换基类对象而不影响程序正确性：

```cpp
// 违反 LSP 的例子
class Rectangle {
public:
    virtual void setWidth(double w) { width_ = w; }
    virtual void setHeight(double h) { height_ = h; }
    double area() const { return width_ * height_; }
protected:
    double width_, height_;
};

// Square 不应该继承 Rectangle！
// 因为 setWidth 不应该同时改变 height
class Square : public Rectangle {
public:
    void setWidth(double w) override {
        width_ = height_ = w;  // 破坏了 Rectangle 的行为约定
    }
    void setHeight(double h) override {
        width_ = height_ = h;
    }
};

void testRectangle(Rectangle& r) {
    r.setWidth(5);
    r.setHeight(4);
    // 期望面积为 20，但如果传入 Square，面积是 16！
    std::cout << "期望面积 20, 实际: " << r.area() << std::endl;
}
```

### I - 接口隔离原则（Interface Segregation）

客户端不应被迫依赖它不使用的接口：

```cpp
// 糟糕：大而全的接口
class BadWorker {
public:
    virtual void work() = 0;
    virtual void eat() = 0;
    virtual void sleep() = 0;
};

// 良好：小而精的接口
class IWorker {
public:
    virtual void work() = 0;
    virtual ~IWorker() = default;
};

class IEatable {
public:
    virtual void eat() = 0;
    virtual ~IEatable() = default;
};

class Human : public IWorker, public IEatable {
public:
    void work() override { std::cout << "人类工作" << std::endl; }
    void eat() override { std::cout << "人类吃饭" << std::endl; }
};

class Robot : public IWorker {
public:
    void work() override { std::cout << "机器人工作" << std::endl; }
    // 机器人不需要 eat()
};
```

### D - 依赖倒置原则（Dependency Inversion）

高层模块不应依赖低层模块，两者都应依赖抽象：

```cpp
#include <iostream>
#include <memory>

// 抽象：不依赖具体实现
class IDatabase {
public:
    virtual void save(const std::string& data) = 0;
    virtual std::string load() = 0;
    virtual ~IDatabase() = default;
};

// 低层模块：具体实现
class MySQLDatabase : public IDatabase {
public:
    void save(const std::string& data) override {
        std::cout << "MySQL 保存: " << data << std::endl;
    }
    std::string load() override { return "MySQL data"; }
};

class RedisDatabase : public IDatabase {
public:
    void save(const std::string& data) override {
        std::cout << "Redis 保存: " << data << std::endl;
    }
    std::string load() override { return "Redis data"; }
};

// 高层模块：依赖抽象接口
class UserService {
public:
    // 依赖注入：通过构造函数传入具体实现
    explicit UserService(std::shared_ptr<IDatabase> db)
        : database_(db) {}

    void saveUser(const std::string& name) {
        database_->save("user:" + name);
    }

private:
    std::shared_ptr<IDatabase> database_;
};

int main() {
    // 可以轻松切换数据库实现，无需修改 UserService
    auto mysql = std::make_shared<MySQLDatabase>();
    auto redis = std::make_shared<RedisDatabase>();

    UserService service1(mysql);
    service1.saveUser("Alice");

    UserService service2(redis);
    service2.saveUser("Bob");

    return 0;
}
```

## 组合优于继承

"优先使用组合而非继承"是 C++ 设计中最重要的经验法则之一：

```cpp
#include <iostream>
#include <string>

// 继承方式（不推荐）
class Engine {
public:
    void start() { std::cout << "引擎启动" << std::endl; }
    void stop() { std::cout << "引擎停止" << std::endl; }
};

// 继承：Car "是一种" Engine？不合理
// class Car : public Engine { ... };

// 组合方式（推荐）
class Car {
public:
    void drive() {
        engine_.start();
        std::cout << "汽车行驶中..." << std::endl;
    }

    void park() {
        engine_.stop();
        std::cout << "汽车已停放" << std::endl;
    }

private:
    Engine engine_;  // Car "有一个" Engine
};

// 另一个组合示例
class Logger {
public:
    void log(const std::string& msg) {
        std::cout << "[LOG] " << msg << std::endl;
    }
};

class Application {
public:
    void run() {
        logger_.log("应用启动");
        // ... 业务逻辑
        logger_.log("应用结束");
    }
private:
    Logger logger_;  // 组合
};
```

### 何时不使用继承

1. **只是需要复用代码**：使用组合或自由函数
2. **不是真正的"is-a"关系**：使用组合
3. **基类不是为继承设计的**（没有虚析构函数）
4. **只需要部分接口**：使用组合而非继承整个接口
5. **多重继承导致菱形继承**：使用虚继承或组合

## 常见陷阱与最佳实践

### 陷阱 1：菱形继承问题

```cpp
class A { public: int value; };
class B : public A {};
class C : public A {};
class D : public B, public C {};

// D 中有两个 A::value，产生歧义
// d.value;  // 错误！不明确

// 解决：使用虚继承
class B : virtual public A {};
class C : virtual public A {};
// D 中只有一个 A::value
```

### 陷阱 2：接口中包含非纯虚函数

```cpp
// 接口中的函数应该有默认实现或纯虚
class IInterface {
public:
    virtual void required() = 0;              // 纯虚：必须实现
    virtual void optional() {}                // 有默认实现：可选
    virtual ~IInterface() = default;
};
```

### 最佳实践

1. **接口只包含纯虚函数和虚析构函数**
2. **优先组合，谨慎继承**
3. **用依赖注入降低耦合**
4. **遵循 SOLID 原则**
5. **为继承设计类（文档化、虚析构函数）或不设计继承（final）**

## 练习

### 练习 1：日志接口

设计 `ILogger` 接口，实现 `ConsoleLogger`、`FileLogger` 和 `NullLogger`。

### 练习 2：策略模式

使用接口设计排序策略：`ISortStrategy`，实现 `BubbleSortStrategy` 和 `QuickSortStrategy`。

### 练习 3：依赖注入

为 `NotificationService` 设计依赖注入，支持 `EmailNotifier` 和 `SMSNotifier`。

### 练习 4：LSP 验证

设计一个违反和遵循里氏替换原则的例子，说明差异。

### 练习 5：组合重构

将一个使用继承的类层次重构为组合方式。

## 参考链接

- [C++ 抽象类 - cppreference](https://en.cppreference.com/w/cpp/language/abstract_class)
- [SOLID 原则](https://en.wikipedia.org/wiki/SOLID)
- [C++ Core Guidelines: C.35 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-class)
- [依赖注入模式](https://en.wikipedia.org/wiki/Dependency_injection)
- [组合优于继承](https://en.wikipedia.org/wiki/Composition_over_inheritance)
