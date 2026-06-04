# RAII 与智能指针

## 概述

RAII（Resource Acquisition Is Initialization，资源获取即初始化）是 C++ 最重要的编程范式之一。其核心思想是：**将资源的生命周期与对象的生命周期绑定**——在构造函数中获取资源，在析构函数中释放资源。智能指针是 RAII 在内存管理上的典型应用，它们让你告别手动 `new/delete`，从根本上消除内存泄漏和悬空指针。

## RAII 哲学

### 问题：手动资源管理的脆弱性

```cpp
#include <iostream>

void badFunction() {
    int* data = new int[1000];

    // 如果中间发生异常或提前返回...
    if (true) {
        return;  // 内存泄漏！delete[] 永远不会执行
    }

    // 使用 data...
    delete[] data;
}
```

### 解决方案：RAII 封装

```cpp
#include <iostream>
#include <stdexcept>

// RAII 包装器示例
class IntArray {
public:
    // 构造时获取资源
    explicit IntArray(size_t size)
        : size_(size), data_(new int[size]()) {
        std::cout << "分配 " << size_ << " 个 int" << std::endl;
    }

    // 析构时释放资源（保证执行）
    ~IntArray() {
        std::cout << "释放 " << size_ << " 个 int" << std::endl;
        delete[] data_;
    }

    // 禁止拷贝（避免双重释放）
    IntArray(const IntArray&) = delete;
    IntArray& operator=(const IntArray&) = delete;

    int& operator[](size_t index) { return data_[index]; }
    const int& operator[](size_t index) const { return data_[index]; }
    size_t size() const { return size_; }

private:
    size_t size_;
    int* data_;
};

void safeFunction() {
    IntArray arr(1000);
    arr[0] = 42;

    if (true) {
        return;  // 安全！arr 的析构函数自动调用
    }

    // 即使抛出异常，arr 也会被正确析构
    // throw std::runtime_error("error");
}  // arr 在此处自动析构

int main() {
    safeFunction();
    std::cout << "函数返回后资源已安全释放" << std::endl;
    return 0;
}
```

**RAII 的关键保证**：C++ 保证局部对象的析构函数在以下情况一定会被调用：

- 离开作用域（正常返回）
- 抛出异常（栈展开）
- 遇到 `return`、`break`、`continue`

## std::unique_ptr：独占所有权

`unique_ptr` 表示对资源的独占所有权。同一时刻只能有一个 `unique_ptr` 指向某个对象。

### 基本用法

```cpp
#include <iostream>
#include <memory>
#include <string>

class Widget {
public:
    Widget(const std::string& name) : name_(name) {
        std::cout << "Widget 构造: " << name_ << std::endl;
    }
    ~Widget() {
        std::cout << "Widget 析构: " << name_ << std::endl;
    }
    void doSomething() const {
        std::cout << name_ << " 正在工作" << std::endl;
    }
private:
    std::string name_;
};

int main() {
    // 推荐：使用 make_unique（C++14）
    auto w1 = std::make_unique<Widget>("Widget1");
    w1->doSomething();

    // 传统方式（C++11）
    std::unique_ptr<Widget> w2(new Widget("Widget2"));
    w2->doSomething();

    // 独占所有权：不能拷贝
    // auto w3 = w1;  // 编译错误！unique_ptr 不可拷贝

    // 但可以移动（转移所有权）
    std::unique_ptr<Widget> w3 = std::move(w1);
    // w1 现在为空，w3 拥有 Widget1

    if (!w1) {
        std::cout << "w1 现在是空的" << std::endl;
    }
    w3->doSomething();  // 通过 w3 访问

    // unique_ptr 也可以用于数组
    auto arr = std::make_unique<int[]>(10);
    arr[0] = 100;
    arr[1] = 200;
    std::cout << "arr[0] = " << arr[0] << std::endl;

    return 0;
}  // w2, w3, arr 自动析构
```

### unique_ptr 作为函数返回值

```cpp
#include <iostream>
#include <memory>

class Resource {
public:
    Resource(int id) : id_(id) {
        std::cout << "Resource " << id_ << " 创建" << std::endl;
    }
    ~Resource() {
        std::cout << "Resource " << id_ << " 销毁" << std::endl;
    }
    int getId() const { return id_; }
private:
    int id_;
};

// 工厂函数：返回 unique_ptr
std::unique_ptr<Resource> createResource(int id) {
    return std::make_unique<Resource>(id);
}

// 接收 unique_ptr 作为参数（转移所有权）
void consumeResource(std::unique_ptr<Resource> res) {
    std::cout << "消费 Resource " << res->getId() << std::endl;
}  // res 在此处自动销毁

// 借用 unique_ptr（不转移所有权，用引用）
void useResource(const std::unique_ptr<Resource>& res) {
    std::cout << "使用 Resource " << res->getId() << std::endl;
    // 也可以直接传裸指针：void useResource(const Resource* res)
}

int main() {
    // 从工厂函数获取
    auto res = createResource(1);

    // 借用（不转移所有权）
    useResource(res);

    // 转移所有权
    consumeResource(std::move(res));
    // res 现在为空

    return 0;
}
```

### unique_ptr 与多态

```cpp
#include <iostream>
#include <memory>
#include <vector>

class Shape {
public:
    virtual double area() const = 0;
    virtual ~Shape() = default;
};

class Circle : public Shape {
public:
    Circle(double r) : radius_(r) {}
    double area() const override {
        return 3.14159 * radius_ * radius_;
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
private:
    double width_, height_;
};

int main() {
    // 多态 + 智能指针：完美的组合
    std::vector<std::unique_ptr<Shape>> shapes;
    shapes.push_back(std::make_unique<Circle>(5.0));
    shapes.push_back(std::make_unique<Rectangle>(4.0, 6.0));
    shapes.push_back(std::make_unique<Circle>(3.0));

    double totalArea = 0;
    for (const auto& shape : shapes) {
        totalArea += shape->area();
    }
    std::cout << "总面积: " << totalArea << std::endl;

    return 0;
}  // 所有 shapes 自动正确析构
```

## std::shared_ptr：共享所有权

`shared_ptr` 允许多个指针共享同一个对象的所有权。它内部使用引用计数来跟踪有多少个 `shared_ptr` 指向同一个对象。当最后一个 `shared_ptr` 被销毁时，对象才会被释放。

### 基本用法

```cpp
#include <iostream>
#include <memory>
#include <string>

class Document {
public:
    Document(const std::string& title) : title_(title) {
        std::cout << "Document 创建: " << title_ << std::endl;
    }
    ~Document() {
        std::cout << "Document 销毁: " << title_ << std::endl;
    }
    std::string getTitle() const { return title_; }
private:
    std::string title_;
};

int main() {
    // 创建 shared_ptr
    auto doc1 = std::make_shared<Document>("报告.pdf");
    std::cout << "引用计数: " << doc1.use_count() << std::endl;  // 1

    {
        // 共享所有权
        auto doc2 = doc1;  // 拷贝：引用计数 +1
        std::cout << "引用计数: " << doc1.use_count() << std::endl;  // 2

        auto doc3 = doc2;
        std::cout << "引用计数: " << doc1.use_count() << std::endl;  // 3

        std::cout << "标题: " << doc3->getTitle() << std::endl;
    }  // doc2 和 doc3 离开作用域，引用计数 -2

    std::cout << "引用计数: " << doc1.use_count() << std::endl;  // 1

    return 0;
}  // doc1 离开作用域，引用计数为 0，Document 被销毁
```

### make_shared 的优势

```cpp
#include <memory>

class BigObject {
public:
    BigObject(int x, double y) : x_(x), y_(y) {}
private:
    int x_;
    double y_;
    char buffer[1024];  // 大对象
};

int main() {
    // 推荐：make_shared 只分配一次内存（控制块 + 对象）
    auto p1 = std::make_shared<BigObject>(42, 3.14);

    // 不推荐：new 分配两次（对象 + 控制块）
    auto p2 = std::shared_ptr<BigObject>(new BigObject(42, 3.14));

    // make_shared 更高效、更安全（异常安全）
    return 0;
}
```

### shared_ptr 的陷阱：循环引用

```cpp
#include <iostream>
#include <memory>

class Node;  // 前向声明

class Node {
public:
    Node(const std::string& name) : name_(name) {
        std::cout << "Node 创建: " << name_ << std::endl;
    }
    ~Node() {
        std::cout << "Node 销毁: " << name_ << std::endl;
    }

    // 问题：循环引用导致内存泄漏
    std::shared_ptr<Node> next;  // 两个节点互相指向对方

private:
    std::string name_;
};

int main() {
    auto a = std::make_shared<Node>("A");
    auto b = std::make_shared<Node>("B");

    a->next = b;  // a 引用 b
    b->next = a;  // b 引用 a → 循环引用！

    // 即使 a 和 b 离开作用域，引用计数都不为 0
    // 两个 Node 都不会被销毁 → 内存泄漏
    // 解决方法：使用 weak_ptr 打破循环（见下文）

    return 0;
}
```

## std::weak_ptr：打破循环引用

`weak_ptr` 是 `shared_ptr` 的观察者，它不增加引用计数。用于打破循环引用和缓存场景。

```cpp
#include <iostream>
#include <memory>

class Node;

class Node {
public:
    Node(const std::string& name) : name_(name) {
        std::cout << "Node 创建: " << name_ << std::endl;
    }
    ~Node() {
        std::cout << "Node 销毁: " << name_ << std::endl;
    }

    // 使用 weak_ptr 打破循环
    std::weak_ptr<Node> next;  // 不增加引用计数

    std::shared_ptr<Node> getNext() const {
        return next.lock();  // lock() 返回 shared_ptr（如果对象还存在）
    }

    bool hasNext() const {
        return !next.expired();  // 检查对象是否还存在
    }

private:
    std::string name_;
};

int main() {
    auto a = std::make_shared<Node>("A");
    auto b = std::make_shared<Node>("B");

    a->next = b;  // weak_ptr，引用计数不增加
    b->next = a;  // weak_ptr，引用计数不增加

    std::cout << "a 的引用计数: " << a.use_count() << std::endl;  // 1
    std::cout << "b 的引用计数: " << b.use_count() << std::endl;  // 1

    // 安全访问
    if (auto nextNode = a->getNext()) {
        std::cout << "A 的下一个节点存在" << std::endl;
    }

    return 0;
}  // a 和 b 正常销毁！没有内存泄漏
```

### weak_ptr 的典型用途

```cpp
#include <iostream>
#include <memory>
#include <vector>

class Cache {
public:
    // 缓存对象（不拥有所有权）
    void add(std::weak_ptr<int> item) {
        items_.push_back(item);
    }

    // 清理过期的缓存条目
    void cleanup() {
        items_.erase(
            std::remove_if(items_.begin(), items_.end(),
                [](const std::weak_ptr<int>& wp) {
                    return wp.expired();  // 移除已失效的 weak_ptr
                }),
            items_.end()
        );
    }

    size_t size() const { return items_.size(); }

private:
    std::vector<std::weak_ptr<int>> items_;
};

int main() {
    Cache cache;

    {
        auto obj = std::make_shared<int>(42);
        cache.add(obj);
        std::cout << "缓存大小: " << cache.size() << std::endl;  // 1
    }  // obj 销毁

    cache.cleanup();
    std::cout << "清理后缓存大小: " << cache.size() << std::endl;  // 0

    return 0;
}
```

## 自定义删除器

智能指针允许你指定自定义的删除逻辑，适用于非内存资源的管理。

```cpp
#include <iostream>
#include <memory>
#include <cstdio>

// 自定义删除器：用于 FILE*
struct FileDeleter {
    void operator()(FILE* fp) const {
        if (fp) {
            std::cout << "关闭文件" << std::endl;
            fclose(fp);
        }
    }
};

int main() {
    // unique_ptr 带自定义删除器
    std::unique_ptr<FILE, FileDeleter> file(fopen("test.txt", "w"));
    if (file) {
        fprintf(file.get(), "Hello, RAII!\n");
    }
    // 文件在 file 离开作用域时自动关闭

    // shared_ptr 带自定义删除器（Lambda）
    int* raw = new int[100];
    std::shared_ptr<int> shared(raw, [](int* p) {
        std::cout << "自定义删除器：释放数组" << std::endl;
        delete[] p;  // 注意：必须用 delete[]
    });

    // 管理其他资源
    auto socket = std::unique_ptr<int, void(*)(int*)>(
        new int(123),
        [](int* s) {
            std::cout << "关闭 socket" << std::endl;
            delete s;
        }
    );

    return 0;
}
```

### RAII 封装其他资源

```cpp
#include <iostream>
#include <mutex>

// RAII 锁守卫（std::lock_guard 就是这样的例子）
class LockGuard {
public:
    explicit LockGuard(std::mutex& mtx) : mutex_(mtx) {
        mutex_.lock();
        std::cout << "锁已获取" << std::endl;
    }
    ~LockGuard() {
        mutex_.unlock();
        std::cout << "锁已释放" << std::endl;
    }
    // 禁止拷贝和移动
    LockGuard(const LockGuard&) = delete;
    LockGuard& operator=(const LockGuard&) = delete;
private:
    std::mutex& mutex_;
};

std::mutex g_mtx;

void threadSafeFunction() {
    LockGuard lock(g_mtx);
    // 临界区：即使抛出异常，锁也会被释放
    std::cout << "安全访问共享资源" << std::endl;
}  // 锁自动释放
```

## 智能指针选择指南

| 场景             | 推荐                         | 理由                      |
| ---------------- | ---------------------------- | ------------------------- |
| 单一所有者       | `unique_ptr`                 | 零开销，语义清晰          |
| 多个所有者       | `shared_ptr`                 | 引用计数自动管理          |
| 观察者/缓存      | `weak_ptr`                   | 不阻止对象销毁            |
| 打破循环         | `weak_ptr`                   | 替代循环中的 `shared_ptr` |
| 工厂函数返回     | `unique_ptr`                 | 调用者决定所有权          |
| 容器中的多态对象 | `unique_ptr` 或 `shared_ptr` | 自动管理生命周期          |

## 常见陷阱与最佳实践

### 陷阱 1：从裸指针多次构造 shared_ptr

```cpp
int* raw = new int(42);
std::shared_ptr<int> p1(raw);
std::shared_ptr<int> p2(raw);  // 错误！两个独立的控制块
// 会导致双重释放！

// 正确做法
auto p1 = std::make_shared<int>(42);
auto p2 = p1;  // 共享同一个控制块
```

### 陷阱 2：在同一个表达式中 new 和多个 shared_ptr

```cpp
// 危险：如果第二个 make_shared 抛异常，第一个 new 泄漏
void risky(std::shared_ptr<int> a, std::shared_ptr<int> b);
// risky(std::shared_ptr<int>(new int(1)), std::shared_ptr<int>(new int(2)));

// 安全：先创建好 shared_ptr
auto a = std::make_shared<int>(1);
auto b = std::make_shared<int>(2);
risky(a, b);
```

### 陷阱 3：this 指针传给 shared_ptr

```cpp
class BadWidget : public std::enable_shared_from_this<BadWidget> {
public:
    std::shared_ptr<BadWidget> getShared() {
        // return std::shared_ptr<BadWidget>(this);  // 错误！创建新的控制块
        return shared_from_this();  // 正确：复用已有的控制块
    }
};

// 使用方式
auto w = std::make_shared<BadWidget>();
auto w2 = w->getShared();  // w 和 w2 共享引用计数
```

### 最佳实践

1. **永远不要混用裸指针和智能指针管理同一个对象**
2. **优先使用 `make_unique` 和 `make_shared`**
3. **函数参数优先传引用/裸指针（借用），而非 shared_ptr（共享）**
4. **返回值优先用 `unique_ptr`（转移所有权）**
5. **需要 this 的 shared_ptr 时继承 `enable_shared_from_this`**
6. **用 `weak_ptr` 打破循环引用**
7. **避免 `shared_ptr` 指向数组（C++17 前）**

## 练习

1. 实现一个 RAII 的 `Timer` 类，构造时开始计时，析构时打印经过的时间。

2. 用 `unique_ptr` 实现一个动态数组类 `DynamicArray`，支持 push_back 和自动扩容。

3. 设计一个双向链表，使用 `shared_ptr` 和 `weak_ptr` 避免循环引用导致的内存泄漏。

4. 用 `unique_ptr` 和自定义删除器封装 `fopen/fclose`，实现安全的文件操作类。

5. 创建一个对象池，用 `shared_ptr` + 自定义删除器实现对象的自动回收。

## 参考链接

- [RAII - cppreference](https://en.cppreference.com/w/cpp/language/raii)
- [std::unique_ptr - cppreference](https://en.cppreference.com/w/cpp/memory/unique_ptr)
- [std::shared_ptr - cppreference](https://en.cppreference.com/w/cpp/memory/shared_ptr)
- [std::weak_ptr - cppreference](https://en.cppreference.com/w/cpp/memory/weak_ptr)
- [std::make_unique - cppreference](https://en.cppreference.com/w/cpp/memory/unique_ptr/make_unique)
- [std::make_shared - cppreference](https://en.cppreference.com/w/cpp/memory/shared_ptr/make_shared)
- [std::enable_shared_from_this - cppreference](https://en.cppreference.com/w/cpp/memory/enable_shared_from_this)
- [C++ Core Guidelines: R.20 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rr-smartptr)
