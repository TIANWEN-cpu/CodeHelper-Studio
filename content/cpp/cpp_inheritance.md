# 继承与访问控制

## 课程概述

继承是面向对象编程的核心概念之一，它允许你基于已有的类创建新类，实现代码的复用和扩展。本章将学习基类与派生类的关系、不同继承方式的影响、构造/析构顺序、函数重写，以及组合与继承的选择原则。

## 基类与派生类

继承允许派生类（子类）获得基类（父类）的成员变量和成员函数：

```cpp
#include <iostream>
#include <string>

// 基类（父类）
class Animal {
public:
    Animal(std::string name) : name_(name) {
        std::cout << "Animal 构造: " << name_ << std::endl;
    }

    void eat() const {
        std::cout << name_ << " 正在吃东西" << std::endl;
    }

    void sleep() const {
        std::cout << name_ << " 正在睡觉" << std::endl;
    }

    std::string getName() const { return name_; }

protected:
    std::string name_;  // protected: 派生类可以访问
};

// 派生类（子类）
class Dog : public Animal {
public:
    Dog(std::string name, std::string breed)
        : Animal(name), breed_(breed) {  // 调用基类构造函数
        std::cout << "Dog 构造: " << name_ << " (" << breed_ << ")" << std::endl;
    }

    void bark() const {
        std::cout << name_ << " 汪汪叫！" << std::endl;
    }

    // 可以访问基类的 protected 成员
    std::string getInfo() const {
        return name_ + " 是一只 " + breed_;  // name_ 是 protected
    }

private:
    std::string breed_;
};

int main() {
    Dog dog("Buddy", "金毛");

    // 派生类对象可以使用基类的 public 成员
    dog.eat();       // 继承自 Animal
    dog.sleep();     // 继承自 Animal
    dog.bark();      // Dog 自己的方法

    std::cout << dog.getInfo() << std::endl;

    return 0;
}
```

## 三种继承方式

继承方式决定了基类成员在派生类中的访问级别：

```cpp
#include <iostream>

class Base {
public:
    int publicVar = 1;
protected:
    int protectedVar = 2;
private:
    int privateVar = 3;  // 任何派生类都无法直接访问
};

// public 继承：is-a 关系（最常用）
class PublicDerived : public Base {
public:
    void access() {
        publicVar = 10;      // OK: public → public
        protectedVar = 20;   // OK: protected → protected
        // privateVar = 30;  // 错误！无法访问基类的 private 成员
    }
};

// protected 继承：较少使用
class ProtectedDerived : protected Base {
public:
    void access() {
        publicVar = 10;      // OK: public → protected
        protectedVar = 20;   // OK: protected → protected
    }
};

// private 继承：实现细节，较少使用
class PrivateDerived : private Base {
public:
    void access() {
        publicVar = 10;      // OK: public → private
        protectedVar = 20;   // OK: protected → private
    }
};

int main() {
    PublicDerived pub;
    pub.publicVar = 100;     // OK

    ProtectedDerived prot;
    // prot.publicVar = 100; // 错误！在 ProtectedDerived 中变为 protected

    PrivateDerived priv;
    // priv.publicVar = 100; // 错误！在 PrivateDerived 中变为 private

    return 0;
}
```

### 继承方式总结

| 基类成员  | public 继承 | protected 继承 | private 继承 |
| --------- | ----------- | -------------- | ------------ |
| public    | public      | protected      | private      |
| protected | protected   | protected      | private      |
| private   | 不可访问    | 不可访问       | 不可访问     |

**实际开发中 95% 的情况使用 public 继承。**

## 构造与析构顺序

在继承体系中，构造从基类到派生类，析构从派生类到基类：

```cpp
#include <iostream>

class Base {
public:
    Base() { std::cout << "Base 构造" << std::endl; }
    ~Base() { std::cout << "Base 析构" << std::endl; }
};

class Derived : public Base {
public:
    Derived() { std::cout << "Derived 构造" << std::endl; }
    ~Derived() { std::cout << "Derived 析构" << std::endl; }
};

class MostDerived : public Derived {
public:
    MostDerived() { std::cout << "MostDerived 构造" << std::endl; }
    ~MostDerived() { std::cout << "MostDerived 析构" << std::endl; }
};

int main() {
    MostDerived obj;
    // 构造顺序: Base → Derived → MostDerived
    // 析构顺序: MostDerived → Derived → Base
    return 0;
}
```

**输出：**

```
Base 构造
Derived 构造
MostDerived 构造
MostDerived 析构
Derived 析构
Base 析构
```

## 函数重写（Overriding）

派生类可以重新定义基类的函数，这称为重写：

```cpp
#include <iostream>
#include <string>

class Shape {
public:
    Shape(std::string name) : name_(name) {}

    // 虚函数：允许派生类重写（下一章会详细讲解）
    virtual double area() const {
        std::cout << "Shape::area() 被调用" << std::endl;
        return 0.0;
    }

    // 非虚函数
    void printName() const {
        std::cout << "形状名称: " << name_ << std::endl;
    }

    virtual ~Shape() = default;

protected:
    std::string name_;
};

class Circle : public Shape {
public:
    Circle(double radius)
        : Shape("圆形"), radius_(radius) {}

    // 重写基类的 area 函数
    double area() const override {
        return 3.14159 * radius_ * radius_;
    }

private:
    double radius_;
};

class Rectangle : public Shape {
public:
    Rectangle(double width, double height)
        : Shape("矩形"), width_(width), height_(height) {}

    double area() const override {
        return width_ * height_;
    }

private:
    double width_, height_;
};

int main() {
    Circle circle(5.0);
    Rectangle rect(4.0, 6.0);

    std::cout << "圆面积: " << circle.area() << std::endl;
    std::cout << "矩形面积: " << rect.area() << std::endl;

    circle.printName();  // 继承自基类的非虚函数
    rect.printName();

    return 0;
}
```

## 访问基类成员

派生类可以通过作用域解析运算符 `::` 显式调用基类版本：

```cpp
#include <iostream>

class Base {
public:
    void show() const {
        std::cout << "Base::show()" << std::endl;
    }
    int value = 10;
};

class Derived : public Base {
public:
    void show() const {
        std::cout << "Derived::show()" << std::endl;
    }

    void showBoth() const {
        show();           // 调用 Derived::show()
        Base::show();     // 显式调用 Base::show()
    }

    void showValues() const {
        std::cout << "Derived value: " << value << std::endl;
        std::cout << "Base value: " << Base::value << std::endl;
    }
};

int main() {
    Derived d;
    d.showBoth();
    d.showValues();
    return 0;
}
```

## 组合 vs 继承

**组合**（has-a）和**继承**（is-a）是两种不同的代码复用方式：

```cpp
#include <iostream>
#include <string>

// 组合示例：Engine 是 Car 的一部分
class Engine {
public:
    void start() { std::cout << "引擎启动" << std::endl; }
    void stop() { std::cout << "引擎停止" << std::endl; }
};

class Car {
public:
    void drive() {
        engine_.start();
        std::cout << "汽车行驶中..." << std::endl;
    }

private:
    Engine engine_;  // 组合：Car "有一个" Engine
};

// 继承示例：ElectricCar "是一种" Car
class ElectricCar : public Car {
public:
    void charge() {
        std::cout << "正在充电..." << std::endl;
    }
};

int main() {
    Car car;
    car.drive();

    ElectricCar ecar;
    ecar.drive();
    ecar.charge();

    return 0;
}
```

### 何时使用继承 vs 组合

| 场景            | 推荐方式 | 理由                       |
| --------------- | -------- | -------------------------- |
| "是一种" 关系   | 继承     | ElectricCar 是一种 Car     |
| "有一部分" 关系 | 组合     | Car 有一个 Engine          |
| 需要多态        | 继承     | 通过基类指针调用派生类方法 |
| 只需要复用实现  | 组合     | 更灵活，耦合度更低         |
| 基类可能被修改  | 组合     | 避免脆弱的基类问题         |

**经验法则**：优先使用组合，只有在确实需要"is-a"关系和多态时才使用继承。

## 常见陷阱与最佳实践

### 陷阱 1：忘记调用基类构造函数

```cpp
class Derived : public Base {
public:
    Derived(int x) {
        // 如果没有显式调用 Base 构造函数，会调用 Base 的默认构造函数
        // 如果 Base 没有默认构造函数，编译错误！
    }
};
```

### 陷阱 2：同名函数隐藏基类函数

```cpp
class Base {
public:
    void foo(int x) { std::cout << "Base::foo(int)" << std::endl; }
};

class Derived : public Base {
public:
    void foo(double x) { std::cout << "Derived::foo(double)" << std::endl; }
    // 这会隐藏 Base::foo(int)！
};

int main() {
    Derived d;
    d.foo(5);       // 调用 Derived::foo(double)，5 被转为 5.0
    d.Base::foo(5); // 显式调用 Base 版本
}
```

### 最佳实践

1. **优先使用 public 继承**
2. **优先使用组合而非继承**
3. **在派生类构造函数中显式调用基类构造函数**
4. **使用 `override` 关键字标记重写的函数**
5. **基类析构函数设为 virtual（下一章详述）**

## 练习

### 练习 1：形状继承体系

创建 `Shape` 基类，派生出 `Triangle` 和 `Square`，每个类实现自己的 `area()` 方法。

### 练习 2：员工管理系统

创建 `Employee` 基类，派生出 `Manager` 和 `Engineer`，各自有不同的薪资计算方式。

### 练习 3：构造/析构顺序

创建一个三层继承体系，观察并记录构造和析构的顺序。

### 练习 4：组合 vs 继承

用组合方式重写练习 1，将面积计算逻辑放在独立的 `AreaCalculator` 类中。

### 练习 5：访问控制实验

分别用 public、protected、private 继承同一个基类，观察成员访问的变化。

## 参考链接

- [C++ 继承 - cppreference](https://en.cppreference.com/w/cpp/language/derived_class)
- [C++ 访问控制 - cppreference](https://en.cppreference.com/w/cpp/language/access)
- [C++ 虚函数 - cppreference](https://en.cppreference.com/w/cpp/language/virtual)
- [C++ Core Guidelines: C.35 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rh-public)
- [组合 vs 继承](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rc-composition)
