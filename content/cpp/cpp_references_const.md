# 引用与 const 的正确使用

## 课程概述

引用（reference）和 const 是 C++ 中极其重要的概念。引用提供了更安全、更直观的"别名"机制，而 const 则是 C++ 类型系统的守护者，帮助你写出更安全、更易维护的代码。正确理解和使用它们，是区分 C++ 初学者和中级程序员的关键。

## 什么是引用

引用是变量的**别名**。一旦引用被初始化为某个变量，它就永远代表那个变量，不能再绑定到其他对象。

```cpp
#include <iostream>

int main() {
    int x = 10;
    int& ref = x;  // ref 是 x 的引用（别名）

    std::cout << "x = " << x << std::endl;       // 输出: 10
    std::cout << "ref = " << ref << std::endl;   // 输出: 10

    ref = 20;  // 通过引用修改值
    std::cout << "x = " << x << std::endl;       // 输出: 20！x 也被修改了

    // 引用必须在声明时初始化
    // int& badRef;  // 编译错误！引用必须初始化

    return 0;
}
```

引用的核心特性：

- 引用必须在声明时初始化
- 引用一旦绑定，就不能再绑定到其他对象
- 引用本身不占用额外内存（编译器通常用指针实现，但语义上不是指针）

## 引用 vs 指针

引用和指针都能间接访问对象，但它们在语义和使用上有重要区别：

```cpp
#include <iostream>

int main() {
    int x = 10;

    // 引用
    int& ref = x;     // 必须初始化，之后不能改变绑定
    ref = 20;         // 修改的是 x 的值

    // 指针
    int* ptr = &x;    // 可以初始化
    ptr = nullptr;    // 可以改变指向
    *ptr = 30;        // 解引用后修改

    // 关键区别：
    // 1. 引用不能为空（必须绑定到有效对象），指针可以为 nullptr
    // 2. 引用不能重新绑定，指针可以改变指向
    // 3. 引用使用语法更简洁（不需要 * 和 &），指针需要显式解引用
    // 4. 引用更安全（不会空指针解引用），指针更灵活

    return 0;
}
```

### 何时使用引用 vs 指针

```cpp
// 使用引用的场景：函数参数、返回值、范围 for
void modifyValue(int& val) {  // 明确 val 不能为空
    val *= 2;
}

// 使用指针的场景：可选参数、动态数组、需要重新指向
void optionalParam(int* ptr) {  // ptr 可以为 nullptr
    if (ptr != nullptr) {
        *ptr *= 2;
    }
}
```

## const 变量

`const` 修饰的变量在初始化后不能被修改：

```cpp
const int MAX_SIZE = 100;  // 常量，编译期确定
// MAX_SIZE = 200;         // 编译错误！不能修改 const 变量

const double PI = 3.14159265;
// PI = 3.0;               // 编译错误！

// const 变量必须在声明时初始化
// const int uninitialized;  // 编译错误！
const int initialized = 42;  // 正确
```

## const 指针

const 与指针的组合是 C++ 中最容易混淆的部分之一。理解的关键是**从右向左读**：

```cpp
#include <iostream>

int main() {
    int x = 10;
    int y = 20;

    // 1. const int* ptr — 指向 const int 的指针
    //    读法："ptr 是一个指针，指向 const int"
    //    含义：不能通过 ptr 修改它所指向的值，但 ptr 可以指向其他地址
    const int* ptr1 = &x;
    // *ptr1 = 30;   // 错误！不能通过 ptr1 修改值
    ptr1 = &y;       // OK：ptr1 可以指向其他地址

    // 2. int* const ptr — const 指针（指针本身是常量）
    //    读法："ptr 是一个 const 指针，指向 int"
    //    含义：ptr 不能指向其他地址，但可以通过 ptr 修改值
    int* const ptr2 = &x;
    *ptr2 = 30;      // OK：可以通过 ptr2 修改值
    // ptr2 = &y;    // 错误！ptr2 不能指向其他地址

    // 3. const int* const ptr — 指向 const int 的 const 指针
    //    读法："ptr 是一个 const 指针，指向 const int"
    //    含义：既不能修改指向，也不能通过它修改值
    const int* const ptr3 = &x;
    // *ptr3 = 30;   // 错误！
    // ptr3 = &y;    // 错误！

    return 0;
}
```

### 记忆技巧

```cpp
// 看 const 在 * 的哪边：
const int* p;   // const 在 * 左边 → 值不能改（指向的内容是 const）
int* const p;   // const 在 * 右边 → 指针不能改（指针本身是 const）
```

## const 引用作为函数参数

这是 C++ 中最常见的用法之一：既避免了拷贝开销，又保证了不会修改传入的数据。

```cpp
#include <iostream>
#include <string>
#include <vector>

// 值传递：会拷贝整个 vector（昂贵！）
void printByValue(std::vector<int> vec) {
    for (int n : vec) std::cout << n << " ";
}

// const 引用传递：无拷贝，且保证不修改
void printByConstRef(const std::vector<int>& vec) {
    for (int n : vec) std::cout << n << " ";
    // vec.push_back(99);  // 编译错误！const 引用不能修改
}

// 对于小类型（int, double 等），值传递和 const 引用传递差别不大
void printInt(int x) {  // OK，int 拷贝成本极低
    std::cout << x << std::endl;
}

// 对于大对象（string, vector, 自定义类），优先 const 引用
void printString(const std::string& str) {
    std::cout << str << std::endl;
}

int main() {
    std::vector<int> nums = {1, 2, 3, 4, 5};
    printByValue(nums);      // 拷贝整个 vector
    printByConstRef(nums);   // 无拷贝，更高效

    std::string name = "DevLearner";
    printString(name);       // const 引用传递

    return 0;
}
```

### 规则总结

| 参数类型   | 是否拷贝 | 能否修改 | 适用场景                           |
| ---------- | -------- | -------- | ---------------------------------- |
| `T`        | 是       | 能       | 小类型（int, double, bool, char）  |
| `T&`       | 否       | 能       | 需要修改参数                       |
| `const T&` | 否       | 否       | 大类型（string, vector, 自定义类） |

## const 成员函数

在类中，`const` 可以修饰成员函数，表示该函数不会修改对象的任何成员变量：

```cpp
#include <iostream>
#include <string>

class Student {
public:
    Student(std::string name, int score)
        : name_(name), score_(score) {}

    // const 成员函数：承诺不修改任何成员变量
    std::string getName() const {
        return name_;  // OK：只读访问
    }

    int getScore() const {
        return score_;  // OK：只读访问
    }

    // 非 const 成员函数：可以修改成员变量
    void setScore(int score) {
        score_ = score;  // OK：修改成员变量
    }

    // void badFunction() const {
    //     score_ = 100;  // 编译错误！const 函数不能修改成员
    // }

private:
    std::string name_;
    int score_;
};

int main() {
    Student s("Alice", 95);

    // const 对象只能调用 const 成员函数
    const Student constStudent("Bob", 88);
    std::cout << constStudent.getName() << std::endl;   // OK
    // constStudent.setScore(100);  // 错误！const 对象不能调用非 const 函数

    // 非 const 对象可以调用 const 和非 const 函数
    std::cout << s.getName() << std::endl;   // OK
    s.setScore(100);                          // OK

    return 0;
}
```

## constexpr 基础

`constexpr` 表示"在编译期可求值"。与 `const` 不同，`constexpr` 要求值在编译时就能确定：

```cpp
#include <iostream>

// constexpr 变量：编译期常量
constexpr int MAX_SIZE = 100;
constexpr double PI = 3.14159265;

// constexpr 函数：如果参数是编译期常量，结果也在编译期计算
constexpr int square(int x) {
    return x * x;
}

int main() {
    // 编译期计算
    constexpr int result = square(5);  // 25，在编译时就已计算好
    int arr[result];                   // OK：result 是编译期常量，可用作数组大小

    // 运行时调用 constexpr 函数也是允许的
    int x = 10;
    int runtimeResult = square(x);     // OK：在运行时计算

    std::cout << "Compile-time: " << result << std::endl;
    std::cout << "Runtime: " << runtimeResult << std::endl;

    return 0;
}
```

### const vs constexpr

```cpp
const int runtime_const = std::rand();     // OK：运行时确定
// constexpr int compile_const = std::rand();  // 错误！rand() 不是编译期可求值的

constexpr int compile_const = 42;          // OK：编译期可确定
```

## 常见陷阱与最佳实践

### 陷阱 1：引用绑定到临时对象

```cpp
// 错误：引用绑定到临时对象（临时对象在语句结束后就销毁了）
// int& ref = 10 + 20;  // 编译错误！

// 正确：const 引用可以绑定到临时对象（延长其生命周期）
const int& constRef = 10 + 20;  // OK
```

### 陷阱 2：const 指针的混淆

```cpp
int x = 10;
const int* p1 = &x;   // 不能通过 p1 修改 x
int* const p2 = &x;   // p2 不能指向其他地址
// 记住：const 在 * 左边修饰值，在 * 右边修饰指针
```

### 陷阱 3：const 成员函数调用非 const 函数

```cpp
class Example {
public:
    void readOnly() const {
        // modify();  // 错误！const 函数不能调用非 const 函数
    }
    void modify() {}
};
```

### 最佳实践

1. **优先使用引用而非指针**：除非需要 nullptr 或重新指向
2. **函数参数优先使用 const 引用**：对于非内置类型
3. **只读函数标记为 const**：让编译器帮你检查
4. **能用 constexpr 就用 constexpr**：把计算移到编译期
5. **const 放在类型名前面**：`const int*` 比 `int const*` 更易读

## 练习

### 练习 1：引用交换

编写 `swap` 函数，使用引用交换两个整数的值。

### 练习 2：const 正确性

为一个 `Circle` 类编写 `getRadius()`（const）、`getArea()`（const）和 `setRadius()`（非 const）成员函数。

### 练习 3：const 指针练习

声明并演示以下三种指针的区别：

- `const int*`
- `int* const`
- `const int* const`

### 练习 4：constexpr 函数

编写一个 `constexpr` 函数 `factorial(int n)`，计算 n 的阶乘。在 `main` 中用 `constexpr` 变量接收结果。

### 练习 5：const 引用参数

编写函数 `printVector(const std::vector<int>& vec)` 和 `findMax(const std::vector<int>& vec)`，体会 const 引用参数的优势。

## 参考链接

- [C++ 引用 - cppreference](https://en.cppreference.com/w/cpp/language/reference)
- [C++ const 限定符 - cppreference](https://en.cppreference.com/w/cpp/language/cv)
- [C++ const 成员函数 - cppreference](https://en.cppreference.com/w/cpp/language/member_functions)
- [C++ constexpr - cppreference](https://en.cppreference.com/w/cpp/language/constexpr)
- [C++ Core Guidelines: F.16 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rf-in)
