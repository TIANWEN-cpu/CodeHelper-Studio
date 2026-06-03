# 虚函数与多态

## 课程概述

多态是面向对象编程的三大支柱之一，它允许你通过基类指针或引用来调用派生类的实现。虚函数是实现多态的核心机制。本章将深入讲解虚函数的工作原理、动态绑定、纯虚函数、抽象类、虚析构函数的重要性，以及 C++11 引入的 `override` 和 `final` 关键字。

## 虚函数与动态绑定

虚函数允许派生类重写基类的函数，并通过基类指针/引用调用时，实际执行的是派生类的版本。这种行为称为**动态绑定**（运行时多态）。

```cpp
#include <iostream>
#include <vector>
#include <memory>

// 基类
class Animal {
public:
    Animal(std::string name) : name_(name) {}

    // virtual 关键字：声明虚函数，允许派生类重写
    virtual void speak() const {
        std::cout << name_ << " 发出声音" << std::endl;
    }

    // 非虚函数：不会发生动态绑定
    void breathe() const {
        std::cout << name_ << " 在呼吸" << std::endl;
    }

    virtual ~Animal() = default;

protected:
    std::string name_;
};

// 派生类
class Dog : public Animal {
public:
    Dog(std::string name) : Animal(name) {}

    // override 关键字（C++11）：显式标记重写，编译器会检查
    void speak() const override {
        std::cout << name_ << " 汪汪叫！" << std::endl;
    }
};

class Cat : public Animal {
public:
    Cat(std::string name) : Animal(name) {}

    void speak() const override {
        std::cout << name_ << " 喵喵叫！" << std::endl;
    }
};

int main() {
    // 通过基类指针调用虚函数
    Animal* animals[] = {
        new Dog("旺财"),
        new Cat("咪咪"),
        new Dog("大黄")
    };

    for (Animal* a : animals) {
        a->speak();     // 动态绑定：调用实际对象的 speak()
        a->breathe();   // 静态绑定：始终调用 Animal::breathe()
    }

    // 清理内存
    for (Animal* a : animals) {
        delete a;
    }

    return 0;
}
```

### 静态绑定 vs 动态绑定

```cpp
#include <iostream>

class Base {
public:
    virtual void virtualFunc() { std::cout << "Base::virtualFunc" << std::endl; }
    void normalFunc() { std::cout << "Base::normalFunc" << std::endl; }
};

class Derived : public Base {
public:
    void virtualFunc() override { std::cout << "Derived::virtualFunc" << std::endl; }
    void normalFunc() { std::cout << "Derived::normalFunc" << std::endl; }
};

int main() {
    Derived d;
    Base* ptr = &d;

    ptr->virtualFunc();  // 动态绑定：输出 "Derived::virtualFunc"
    ptr->normalFunc();   // 静态绑定：输出 "Base::normalFunc"

    return 0;
}
```

## vtable 概念

虚函数是如何实现的？编译器为每个包含虚函数的类生成一个**虚函数表**（vtable），这是一个函数指针数组。每个对象包含一个隐藏的指针（vptr），指向其类的 vtable。

```
Animal 的 vtable:
  [0] -> Animal::speak()
  [1] -> Animal::breathe()  (非虚，不在 vtable 中)

Dog 的 vtable:
  [0] -> Dog::speak()       (重写了 Animal::speak)
  [1] -> Animal::breathe()  (继承，未重写)

当调用 animalPtr->speak() 时：
  1. 通过对象的 vptr 找到 vtable
  2. 在 vtable 中找到 speak 的函数指针
  3. 调用该函数
```

```cpp
#include <iostream>

// 没有虚函数的类
class NoVirtual {
public:
    void foo() { std::cout << "NoVirtual::foo" << std::endl; }
};

// 有虚函数的类
class HasVirtual {
public:
    virtual void foo() { std::cout << "HasVirtual::foo" << std::endl; }
};

int main() {
    std::cout << "NoVirtual 大小: " << sizeof(NoVirtual) << " 字节" << std::endl;
    std::cout << "HasVirtual 大小: " << sizeof(HasVirtual) << " 字节" << std::endl;
    // HasVirtual 多了 8 字节（64位系统上的 vptr 指针）

    return 0;
}
```

## 纯虚函数与抽象类

纯虚函数是没有实现的虚函数，声明纯虚函数的类称为**抽象类**，不能被实例化：

```cpp
#include <iostream>
#include <cmath>
#include <vector>

// 抽象类：包含纯虚函数
class Shape {
public:
    // 纯虚函数 = 0：派生类必须实现
    virtual double area() const = 0;
    virtual double perimeter() const = 0;

    // 抽象类也可以有普通虚函数（带默认实现）
    virtual void printInfo() const {
        std::cout << "面积: " << area() << ", 周长: " << perimeter() << std::endl;
    }

    // 虚析构函数（重要！）
    virtual ~Shape() = default;
};

// Shape 是抽象类，不能实例化：
// Shape s;  // 编译错误！

class Circle : public Shape {
public:
    Circle(double radius) : radius_(radius) {}

    double area() const override {
        return 3.14159 * radius_ * radius_;
    }

    double perimeter() const override {
        return 2 * 3.14159 * radius_;
    }

private:
    double radius_;
};

class Rectangle : public Shape {
public:
    Rectangle(double w, double h) : width_(w), height_(h) {}

    double area() const override {
        return width_ * height_;
    }

    double perimeter() const override {
        return 2 * (width_ + height_);
    }

private:
    double width_, height_;
};

int main() {
    // 通过基类指针使用多态
    std::vector<Shape*> shapes;
    shapes.push_back(new Circle(5.0));
    shapes.push_back(new Rectangle(4.0, 6.0));
    shapes.push_back(new Circle(3.0));

    for (const Shape* s : shapes) {
        s->printInfo();  // 动态绑定：调用实际类型的实现
    }

    for (Shape* s : shapes) {
        delete s;
    }

    return 0;
}
```

## 虚析构函数的重要性

如果通过基类指针删除派生类对象，而基类析构函数不是虚函数，会导致**派生类的析构函数不被调用**，造成资源泄漏：

```cpp
#include <iostream>

class BadBase {
public:
    BadBase() { std::cout << "BadBase 构造" << std::endl; }
    ~BadBase() { std::cout << "BadBase 析构" << std::endl; }
    // 析构函数不是 virtual！
};

class BadDerived : public BadBase {
public:
    BadDerived() {
        data_ = new int[1000];  // 分配资源
        std::cout << "BadDerived 构造" << std::endl;
    }
    ~BadDerived() {
        delete[] data_;  // 释放资源
        std::cout << "BadDerived 析构" << std::endl;
    }
private:
    int* data_;
};

class GoodBase {
public:
    GoodBase() { std::cout << "GoodBase 构造" << std::endl; }
    virtual ~GoodBase() { std::cout << "GoodBase 析构" << std::endl; }
    // 虚析构函数！
};

class GoodDerived : public GoodBase {
public:
    GoodDerived() {
        data_ = new int[1000];
        std::cout << "GoodDerived 构造" << std::endl;
    }
    ~GoodDerived() {
        delete[] data_;
        std::cout << "GoodDerived 析构" << std::endl;
    }
private:
    int* data_;
};

int main() {
    std::cout << "=== 错误示例 ===" << std::endl;
    BadBase* bad = new BadDerived();
    delete bad;  // 只调用 BadBase 的析构函数！BadDerived 的析构函数不会被调用
                 // data_ 内存泄漏！

    std::cout << "\n=== 正确示例 ===" << std::endl;
    GoodBase* good = new GoodDerived();
    delete good;  // 先调用 GoodDerived 析构，再调用 GoodBase 析构

    return 0;
}
```

**规则**：如果一个类有虚函数，它的析构函数也应该是虚函数。

## override 和 final 关键字

### override

`override` 显式标记一个函数是重写基类的虚函数。如果函数签名不匹配，编译器会报错：

```cpp
#include <iostream>

class Base {
public:
    virtual void foo(int x) { std::cout << "Base::foo(" << x << ")" << std::endl; }
};

class Derived : public Base {
public:
    // void foo(double x) override { ... }
    // 编译错误！参数类型不匹配，这不是重写

    void foo(int x) override {  // 正确：签名完全匹配
        std::cout << "Derived::foo(" << x << ")" << std::endl;
    }
};
```

### final

`final` 阻止派生类进一步重写虚函数或继承类：

```cpp
#include <iostream>

class Base {
public:
    virtual void foo() { std::cout << "Base::foo" << std::endl; }
};

class Derived : public Base {
public:
    void foo() final { std::cout << "Derived::foo" << std::endl; }
    // final 阻止进一步重写
};

// class MostDerived : public Derived {
// public:
//     void foo() override { }  // 编译错误！foo 被标记为 final
// };

// final 也可以用于类
class FinalClass final {
    // 这个类不能被继承
};

// class CannotInherit : public FinalClass { };  // 编译错误！
```

## 常见陷阱与最佳实践

### 陷阱 1：忘记虚析构函数

```cpp
class Base {
public:
    virtual void doSomething() = 0;
    // ~Base() {}  // 不是虚析构函数！通过基类指针删除派生类对象会泄漏
    virtual ~Base() = default;  // 正确
};
```

### 陷阱 2：函数签名不匹配导致"隐藏"而非"重写"

```cpp
class Base {
public:
    virtual void foo(int x) {}
};

class Derived : public Base {
public:
    void foo(int x, int y) {}  // 这不是重写，这是隐藏！
    // Base::foo(int) 被隐藏了
};
```

### 陷阱 3：在构造函数/析构函数中调用虚函数

```cpp
class Base {
public:
    Base() {
        virtualFunc();  // 调用的是 Base::virtualFunc，不是派生类的！
    }
    virtual void virtualFunc() { std::cout << "Base" << std::endl; }
};
```

### 最佳实践

1. **有虚函数就有虚析构函数**
2. **始终使用 `override` 标记重写函数**
3. **用 `final` 阻止不必要的重写**
4. **避免在构造/析构函数中调用虚函数**
5. **优先使用智能指针管理多态对象**

## 练习

### 练习 1：多态计算器

创建抽象基类 `Operation`，派生出 `Add`、`Subtract`、`Multiply`，通过基类指针调用 `execute(a, b)`。

### 练习 2：虚析构函数实验

创建一个没有虚析构函数的基类，通过基类指针删除派生类对象，观察问题。然后修复它。

### 练习 3：override 验证

故意写错函数签名（如改参数类型），使用 `override` 让编译器捕获错误。

### 练习 4：形状工厂

使用多态和 `std::vector<std::unique_ptr<Shape>>` 管理一组形状对象，计算总面积。

### 练习 5：final 实验

创建一个类层次，在某一层使用 `final`，验证派生类无法继续重写。

## 参考链接

- [C++ 虚函数 - cppreference](https://en.cppreference.com/w/cpp/language/virtual)
- [C++ 抽象类 - cppreference](https://en.cppreference.com/w/cpp/language/abstract_class)
- [C++ override 说明符 - cppreference](https://en.cppreference.com/w/cpp/language/override)
- [C++ final 说明符 - cppreference](https://en.cppreference.com/w/cpp/language/final)
- [C++ Core Guidelines: C.35 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rh-dtor-virtual)
