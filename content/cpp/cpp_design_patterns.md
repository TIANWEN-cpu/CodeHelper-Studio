# C++ 常见设计模式

## 目标

- 理解常见设计模式的价值和适用场景
- 会实现单例和工厂模式
- 能用策略模式替代大段 if/else
- 知道何时该用何时不该用设计模式

## 什么是设计模式

设计模式是软件开发中反复出现的设计问题的通用解决方案。它们不是可以直接复制粘贴的代码，而是**设计思路的模板**。

### 设计模式的核心价值

1. **通用语言**：说"用策略模式"，其他开发者立刻理解你的意图
2. **经过验证**：这些方案已经被无数项目验证过
3. **降低耦合**：让代码更容易修改和扩展

### 重要提醒

> **不要为了用模式而用模式。** 简单的问题用简单的方案解决。只有当代码开始变得难以维护时，才考虑引入设计模式。

## 单例模式（Singleton）

单例模式确保一个类只有一个实例，并提供全局访问点。

### 线程安全的单例实现（C++11）

```cpp
#include <iostream>
#include <mutex>

class Logger {
public:
    // 删除拷贝构造和拷贝赋值
    Logger(const Logger&) = delete;
    Logger& operator=(const Logger&) = delete;

    static Logger& instance() {
        // C++11 保证局部静态变量的初始化是线程安全的
        static Logger inst;
        return inst;
    }

    void log(const std::string& message) {
        std::lock_guard<std::mutex> lock(mutex_);
        std::cout << "[LOG] " << message << std::endl;
    }

private:
    Logger() = default;  // 私有构造函数
    std::mutex mutex_;
};

// 使用
int main() {
    Logger::instance().log("Application started");
    Logger::instance().log("Processing data...");
    return 0;
}
```

### 何时使用单例

- **适合**：日志器、配置管理器、数据库连接池
- **不适合**：业务逻辑类、需要多实例的组件
- **风险**：全局状态难以测试，隐藏依赖关系

## 工厂方法模式（Factory Method）

工厂方法模式定义一个创建对象的接口，让子类决定实例化哪个类。

### 简单工厂

```cpp
#include <iostream>
#include <memory>
#include <string>
#include <stdexcept>

// 产品接口
class Shape {
public:
    virtual ~Shape() = default;
    virtual void draw() const = 0;
    virtual double area() const = 0;
};

// 具体产品
class Circle : public Shape {
public:
    explicit Circle(double radius) : radius_(radius) {}
    void draw() const override {
        std::cout << "Drawing a circle with radius " << radius_ << std::endl;
    }
    double area() const override {
        return 3.14159 * radius_ * radius_;
    }
private:
    double radius_;
};

class Rectangle : public Shape {
public:
    Rectangle(double w, double h) : width_(w), height_(h) {}
    void draw() const override {
        std::cout << "Drawing a rectangle " << width_ << "x" << height_ << std::endl;
    }
    double area() const override {
        return width_ * height_;
    }
private:
    double width_, height_;
};

class Triangle : public Shape {
public:
    Triangle(double b, double h) : base_(b), height_(h) {}
    void draw() const override {
        std::cout << "Drawing a triangle with base " << base_ << " and height " << height_ << std::endl;
    }
    double area() const override {
        return 0.5 * base_ * height_;
    }
private:
    double base_, height_;
};

// 工厂
class ShapeFactory {
public:
    static std::unique_ptr<Shape> create(const std::string& type, double a, double b = 0) {
        if (type == "circle") {
            return std::make_unique<Circle>(a);
        } else if (type == "rectangle") {
            return std::make_unique<Rectangle>(a, b);
        } else if (type == "triangle") {
            return std::make_unique<Triangle>(a, b);
        }
        throw std::invalid_argument("Unknown shape type: " + type);
    }
};

// 使用
int main() {
    auto circle = ShapeFactory::create("circle", 5.0);
    auto rect = ShapeFactory::create("rectangle", 4.0, 6.0);

    circle->draw();
    std::cout << "Area: " << circle->area() << std::endl;

    rect->draw();
    std::cout << "Area: " << rect->area() << std::endl;

    return 0;
}
```

### 何时使用工厂

- **适合**：对象创建逻辑复杂、需要根据运行时条件决定创建哪个类
- **不适合**：只有一种产品类型、创建逻辑简单

## 观察者模式（Observer）

观察者模式定义对象间的一对多依赖关系，当一个对象状态改变时，所有依赖它的对象都会收到通知。

```cpp
#include <iostream>
#include <vector>
#include <memory>
#include <algorithm>
#include <string>

// 观察者接口
class Observer {
public:
    virtual ~Observer() = default;
    virtual void onNotify(const std::string& event, int value) = 0;
};

// 主题（被观察者）
class Subject {
public:
    void addObserver(Observer* observer) {
        observers_.push_back(observer);
    }

    void removeObserver(Observer* observer) {
        observers_.erase(
            std::remove(observers_.begin(), observers_.end(), observer),
            observers_.end()
        );
    }

protected:
    void notify(const std::string& event, int value) {
        for (auto* observer : observers_) {
            observer->onNotify(event, value);
        }
    }

private:
    std::vector<Observer*> observers_;
};

// 具体主题
class StockMarket : public Subject {
public:
    void setPrice(const std::string& stock, int price) {
        stock_ = stock;
        price_ = price;
        notify("price_change", price_);
    }

    const std::string& getStock() const { return stock_; }

private:
    std::string stock_;
    int price_;
};

// 具体观察者
class PhoneDisplay : public Observer {
public:
    void onNotify(const std::string& event, int value) override {
        std::cout << "[手机] 股价变动: " << value << " 元" << std::endl;
    }
};

class WebDisplay : public Observer {
public:
    void onNotify(const std::string& event, int value) override {
        std::cout << "[网页] 最新报价: " << value << " 元" << std::endl;
    }
};

// 使用
int main() {
    StockMarket market;
    PhoneDisplay phone;
    WebDisplay web;

    market.addObserver(&phone);
    market.addObserver(&web);

    market.setPrice("AAPL", 185);
    market.setPrice("AAPL", 190);

    market.removeObserver(&web);
    market.setPrice("AAPL", 195);

    return 0;
}
```

### 何时使用观察者

- **适合**：事件驱动系统、GUI 组件、发布/订阅系统
- **不适合**：简单的函数调用能解决的问题

## 策略模式（Strategy）

策略模式定义一系列算法，将它们封装起来，使它们可以互相替换。

### 用策略模式替代 if/else

```cpp
#include <iostream>
#include <memory>
#include <vector>
#include <string>

// 策略接口
class SortStrategy {
public:
    virtual ~SortStrategy() = default;
    virtual void sort(std::vector<int>& data) const = 0;
    virtual std::string name() const = 0;
};

// 具体策略
class BubbleSort : public SortStrategy {
public:
    void sort(std::vector<int>& data) const override {
        for (size_t i = 0; i < data.size(); ++i) {
            for (size_t j = 0; j < data.size() - 1 - i; ++j) {
                if (data[j] > data[j + 1]) {
                    std::swap(data[j], data[j + 1]);
                }
            }
        }
    }
    std::string name() const override { return "冒泡排序"; }
};

class QuickSort : public SortStrategy {
public:
    void sort(std::vector<int>& data) const override {
        quickSort(data, 0, static_cast<int>(data.size()) - 1);
    }
    std::string name() const override { return "快速排序"; }

private:
    void quickSort(std::vector<int>& data, int low, int high) const {
        if (low < high) {
            int pi = partition(data, low, high);
            quickSort(data, low, pi - 1);
            quickSort(data, pi + 1, high);
        }
    }

    int partition(std::vector<int>& data, int low, int high) const {
        int pivot = data[high];
        int i = low - 1;
        for (int j = low; j < high; ++j) {
            if (data[j] <= pivot) {
                ++i;
                std::swap(data[i], data[j]);
            }
        }
        std::swap(data[i + 1], data[high]);
        return i + 1;
    }
};

// 上下文
class Sorter {
public:
    void setStrategy(std::unique_ptr<SortStrategy> strategy) {
        strategy_ = std::move(strategy);
    }

    void sort(std::vector<int>& data) const {
        if (!strategy_) {
            std::cerr << "未设置排序策略" << std::endl;
            return;
        }
        std::cout << "使用 " << strategy_->name() << " 排序..." << std::endl;
        strategy_->sort(data);
    }

private:
    std::unique_ptr<SortStrategy> strategy_;
};

// 使用
int main() {
    std::vector<int> data = {64, 34, 25, 12, 22, 11, 90};

    Sorter sorter;

    // 小数据集用冒泡排序
    sorter.setStrategy(std::make_unique<BubbleSort>());
    auto data1 = data;
    sorter.sort(data1);

    // 大数据集用快速排序
    sorter.setStrategy(std::make_unique<QuickSort>());
    auto data2 = data;
    sorter.sort(data2);

    return 0;
}
```

### 何时使用策略

- **适合**：同一操作有多种实现方式、需要在运行时切换算法
- **不适合**：只有一种实现方式、算法固定不变

## 装饰器模式（Decorator）

装饰器模式在不改变原对象的基础上，动态地给对象添加新功能。

```cpp
#include <iostream>
#include <string>
#include <memory>

// 组件接口
class Coffee {
public:
    virtual ~Coffee() = default;
    virtual std::string description() const = 0;
    virtual double cost() const = 0;
};

// 具体组件
class SimpleCoffee : public Coffee {
public:
    std::string description() const override { return "黑咖啡"; }
    double cost() const override { return 10.0; }
};

// 装饰器基类
class CoffeeDecorator : public Coffee {
public:
    explicit CoffeeDecorator(std::unique_ptr<Coffee> coffee)
        : coffee_(std::move(coffee)) {}

    std::string description() const override {
        return coffee_->description();
    }

    double cost() const override {
        return coffee_->cost();
    }

protected:
    const std::unique_ptr<Coffee>& getCoffee() const { return coffee_; }

private:
    std::unique_ptr<Coffee> coffee_;
};

// 具体装饰器
class MilkDecorator : public CoffeeDecorator {
public:
    explicit MilkDecorator(std::unique_ptr<Coffee> coffee)
        : CoffeeDecorator(std::move(coffee)) {}

    std::string description() const override {
        return getCoffee()->description() + " + 牛奶";
    }

    double cost() const override {
        return getCoffee()->cost() + 3.0;
    }
};

class SugarDecorator : public CoffeeDecorator {
public:
    explicit SugarDecorator(std::unique_ptr<Coffee> coffee)
        : CoffeeDecorator(std::move(coffee)) {}

    std::string description() const override {
        return getCoffee()->description() + " + 糖";
    }

    double cost() const override {
        return getCoffee()->cost() + 1.0;
    }
};

// 使用
int main() {
    auto coffee = std::make_unique<SimpleCoffee>();
    std::cout << coffee->description() << ": " << coffee->cost() << "元" << std::endl;

    auto milkCoffee = std::make_unique<MilkDecorator>(std::move(coffee));
    std::cout << milkCoffee->description() << ": " << milkCoffee->cost() << "元" << std::endl;

    auto sweetMilkCoffee = std::make_unique<SugarDecorator>(std::move(milkCoffee));
    std::cout << sweetMilkCoffee->description() << ": " << sweetMilkCoffee->cost() << "元" << std::endl;

    return 0;
}
```

## RAII 作为设计模式

RAII 本身就是一种设计模式，它将资源管理和对象生命周期绑定在一起：

```cpp
// 文件锁 RAII
class FileLock {
public:
    explicit FileLock(const std::string& filename) : filename_(filename) {
        // 获取锁
        std::cout << "锁定文件: " << filename_ << std::endl;
    }

    ~FileLock() {
        // 释放锁
        std::cout << "释放文件锁: " << filename_ << std::endl;
    }

    FileLock(const FileLock&) = delete;
    FileLock& operator=(const FileLock&) = delete;

private:
    std::string filename_;
};

void processFile() {
    FileLock lock("data.txt");  // 构造函数获取锁
    // ... 处理文件 ...
    // 函数退出时，lock 的析构函数自动释放锁
    // 即使抛出异常也能正确释放
}
```

## 设计模式选择指南

| 问题                     | 推荐模式 |
| ------------------------ | -------- |
| 全局唯一实例             | 单例     |
| 根据条件创建不同对象     | 工厂方法 |
| 对象状态变化通知多个组件 | 观察者   |
| 同一操作多种实现         | 策略     |
| 动态添加功能             | 装饰器   |
| 构建复杂对象             | 建造者   |
| 对象间解耦通信           | 中介者   |

## 最佳实践

1. **先写简单代码**：不要一开始就用模式
2. **识别代码坏味道**：大量 if/else、重复代码、紧耦合
3. **模式是工具不是目标**：用最简单的方式解决问题
4. **理解优于记忆**：理解模式解决的问题，而不是死记结构
5. **C++ 特有模式**：RAII、Pimpl、CRTP 等是 C++ 特有的惯用法

## 练习

### 练习 1：单例日志器

实现一个线程安全的日志类，支持不同日志级别（INFO/WARN/ERROR）。

### 练习 2：工厂模式计算器

用工厂模式实现一个计算器，支持加减乘除四种运算。

### 练习 3：策略模式支付

实现一个支付系统，支持支付宝、微信、银行卡三种支付方式，可在运行时切换。

### 练习 4：观察者模式天气

实现一个天气观测站，当温度变化时通知手机和网页两个显示器。

## 参考资料

- [Design Patterns - Gang of Four](https://en.wikipedia.org/wiki/Design_Patterns)
- [Refactoring Guru - Design Patterns](https://refactoring.guru/design-patterns)
- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- [cppreference: unique_ptr](https://en.cppreference.com/w/cpp/memory/unique_ptr)
