# 指针与内存管理基础

## 课程概述

指针是 C++ 最强大也最容易出错的概念。指针本质上就是一个**内存地址**。理解指针、掌握内存布局（栈 vs 堆）、学会正确使用 `new` 和 `delete`，是成为合格 C++ 程序员的必经之路。

## 什么是指针

指针是一个变量，它的值是一个**内存地址**。通过指针，你可以间接访问和修改该地址上存储的数据。

```cpp
#include <iostream>

int main() {
    int x = 42;

    // 声明指针：int* 表示"指向 int 的指针"
    int* ptr = &x;  // &x 取 x 的地址，存入 ptr

    std::cout << "x 的值: " << x << std::endl;       // 42
    std::cout << "x 的地址: " << &x << std::endl;    // 0x7ffd...（某个地址）
    std::cout << "ptr 的值: " << ptr << std::endl;    // 与 &x 相同
    std::cout << "ptr 指向的值: " << *ptr << std::endl; // 42（解引用）

    // 通过指针修改值
    *ptr = 100;
    std::cout << "x 现在是: " << x << std::endl;     // 100

    return 0;
}
```

### 指针声明的三种写法

```cpp
int* ptr1;     // 推荐：* 靠近类型名，强调 ptr1 的类型是 "int*"
int *ptr2;     // 也可以：* 靠近变量名
int * ptr3;    // 也可以，但不常见

// 注意：在一行声明多个变量时，* 只修饰紧跟它的变量
int* a, b;     // a 是 int* 指针，b 是普通 int！
int* c, *d;    // c 和 d 都是 int* 指针
```

## 指针运算

指针可以进行算术运算，但运算的单位是**所指向类型的大小**，而不是字节：

```cpp
#include <iostream>

int main() {
    int arr[] = {10, 20, 30, 40, 50};
    int* ptr = arr;  // 数组名退化为指向首元素的指针

    std::cout << "*ptr = " << *ptr << std::endl;         // 10
    std::cout << "*(ptr + 1) = " << *(ptr + 1) << std::endl;  // 20
    std::cout << "*(ptr + 2) = " << *(ptr + 2) << std::endl;  // 30

    // ptr + 1 不是地址加 1，而是地址加 sizeof(int)（通常 4 字节）
    std::cout << "ptr 地址: " << ptr << std::endl;
    std::cout << "ptr + 1 地址: " << (ptr + 1) << std::endl;
    // 两个地址相差 4 字节（假设 int 为 4 字节）

    // 指针自增
    ptr++;  // 现在指向 arr[1]
    std::cout << "*ptr = " << *ptr << std::endl;  // 20

    // 指针相减
    int* p1 = &arr[0];
    int* p2 = &arr[3];
    std::cout << "p2 - p1 = " << (p2 - p1) << std::endl;  // 3（元素个数差）

    return 0;
}
```

## 指针与数组

数组名在大多数情况下会**退化**（decay）为指向首元素的指针：

```cpp
#include <iostream>

void printArray(int* arr, int size) {
    for (int i = 0; i < size; ++i) {
        std::cout << arr[i] << " ";  // 指针也可以用 [] 运算符
    }
    std::cout << std::endl;
}

int main() {
    int numbers[] = {1, 2, 3, 4, 5};

    // 数组名退化为指针
    printArray(numbers, 5);  // numbers 退化为 int*

    // 数组名等价于 &arr[0]
    std::cout << "numbers: " << numbers << std::endl;
    std::cout << "&numbers[0]: " << &numbers[0] << std::endl;
    // 两个地址相同

    // sizeof 的区别
    std::cout << "sizeof(numbers): " << sizeof(numbers) << std::endl;  // 20（5 * 4）
    std::cout << "sizeof(numbers[0]): " << sizeof(numbers[0]) << std::endl;  // 4

    return 0;
}
```

## 动态内存：new 与 delete

栈上的内存在作用域结束时自动释放。如果需要在运行时决定大小，或者需要数据在函数返回后仍然存在，就需要使用**堆内存**。

```cpp
#include <iostream>

int main() {
    // 分配单个 int
    int* single = new int(42);   // new 分配并初始化
    std::cout << "*single = " << *single << std::endl;
    delete single;               // 必须手动释放！
    single = nullptr;            // 释放后设为 nullptr，防止悬垂指针

    // 分配数组
    int size = 10;
    int* arr = new int[size];    // 分配 10 个 int 的数组

    for (int i = 0; i < size; ++i) {
        arr[i] = i * 10;
    }

    for (int i = 0; i < size; ++i) {
        std::cout << arr[i] << " ";
    }
    std::cout << std::endl;

    delete[] arr;  // 数组用 delete[] 释放！
    arr = nullptr;

    return 0;
}
```

### new 与 delete 的配对规则

```cpp
int* p1 = new int;       // 单个对象
delete p1;               // 用 delete

int* p2 = new int[100];  // 数组
delete[] p2;             // 用 delete[]

// 混用会导致未定义行为！
// delete p2;    // 错误！应该用 delete[]
// delete[] p1;  // 错误！应该用 delete
```

## 内存布局：栈 vs 堆

```cpp
#include <iostream>

// 全局/静态区
int globalVar = 100;

int main() {
    // 栈（stack）：自动管理，速度快，大小有限（通常几 MB）
    int stackVar = 42;              // 局部变量在栈上
    double stackArr[100];           // 固定大小数组在栈上

    // 堆（heap）：手动管理，空间大，速度稍慢
    int* heapVar = new int(42);     // new 分配的在堆上
    double* heapArr = new double[1000000];  // 大数组必须在堆上

    std::cout << "栈变量地址: " << &stackVar << std::endl;
    std::cout << "堆变量地址: " << heapVar << std::endl;
    std::cout << "全局变量地址: " << &globalVar << std::endl;

    // 清理堆内存
    delete heapVar;
    delete[] heapArr;

    return 0;
}
// 栈变量 stackVar 和 stackArr 在这里自动释放
```

### 栈 vs 堆对比

| 特性     | 栈（Stack）         | 堆（Heap）         |
| -------- | ------------------- | ------------------ |
| 分配方式 | 自动                | 手动（new/delete） |
| 释放方式 | 作用域结束自动释放  | 必须手动 delete    |
| 速度     | 快                  | 稍慢               |
| 大小限制 | 有限（通常 1-8 MB） | 受系统内存限制     |
| 碎片     | 无                  | 可能有             |
| 生命周期 | 作用域决定          | 程序员决定         |

## 常见指针错误

### 1. 悬垂指针（Dangling Pointer）

指向已被释放的内存：

```cpp
int* ptr = new int(42);
delete ptr;
// ptr 现在是悬垂指针，指向已释放的内存
// *ptr = 10;  // 未定义行为！可能崩溃，可能静默出错

// 正确做法：释放后立即设为 nullptr
ptr = nullptr;
```

### 2. 内存泄漏（Memory Leak）

分配了内存但忘记释放：

```cpp
void leakyFunction() {
    int* data = new int[1000];
    // ... 做一些事情
    // 忘记 delete[] data！
    // 函数返回后，这块内存永远无法释放
}

void safeFunction() {
    int* data = new int[1000];
    // ... 做一些事情
    delete[] data;  // 正确释放
}
```

### 3. 双重释放（Double Free）

```cpp
int* ptr = new int(42);
delete ptr;
// delete ptr;  // 未定义行为！双重释放

// 正确做法
ptr = nullptr;
delete ptr;  // delete nullptr 是安全的（什么都不做）
```

### 4. 未初始化指针

```cpp
int* ptr;  // 未初始化，指向随机地址
// *ptr = 10;  // 未定义行为！可能覆盖重要数据

// 正确做法
int* ptr = nullptr;  // 或者 int* ptr = new int;
```

## nullptr（C++11）

`nullptr` 是 C++11 引入的空指针常量，比 `NULL`（即 0）更安全：

```cpp
int* ptr1 = nullptr;  // C++11 推荐
int* ptr2 = NULL;     // 旧式写法，NULL 本质上是 0
int* ptr3 = 0;        // 也可以，但不推荐

// nullptr 的优势：类型安全
void foo(int x) { std::cout << "int" << std::endl; }
void foo(int* p) { std::cout << "int*" << std::endl; }

foo(nullptr);  // 调用 foo(int*)
// foo(NULL);  // 调用 foo(int)！因为 NULL 是 0
```

## 常见陷阱与最佳实践

### 陷阱 1：返回局部变量的指针

```cpp
int* badFunction() {
    int x = 42;
    return &x;  // 错误！x 在函数返回后被销毁
}

int* goodFunction() {
    int* x = new int(42);
    return x;  // OK：堆内存在函数返回后仍然存在
}
```

### 陷阱 2：数组越界

```cpp
int* arr = new int[5];
arr[5] = 100;  // 越界！有效索引是 0-4
// 这不会立即报错，但会导致未定义行为
```

### 最佳实践

1. **总是初始化指针**：`int* ptr = nullptr;`
2. **释放后立即设为 nullptr**：`delete ptr; ptr = nullptr;`
3. **配对使用 new/delete 和 new[]/delete[]**
4. **优先使用智能指针**（后续章节会讲）而非裸指针
5. **使用 valgrind 或 AddressSanitizer 检测内存错误**

## 练习

### 练习 1：指针基础

声明一个 int 变量和一个指向它的指针，通过指针修改变量的值并打印。

### 练习 2：动态数组

编写函数 `createArray(int size, int value)`，返回一个大小为 `size`、所有元素为 `value` 的动态数组。在 `main` 中使用后正确释放。

### 练习 3：指针遍历

用指针（而非索引）遍历并打印数组 `{1, 2, 3, 4, 5}` 的所有元素。

### 练习 4：内存泄漏检测

编写一个有内存泄漏的函数，然后用 valgrind 或 AddressSanitizer 检测它。

### 练习 5：指针交换

编写 `swap(int* a, int* b)` 函数，用指针交换两个整数的值。

## 参考链接

- [C++ 指针 - cppreference](https://en.cppreference.com/w/cpp/language/pointer)
- [C++ new 表达式 - cppreference](https://en.cppreference.com/w/cpp/language/new)
- [C++ delete 表达式 - cppreference](https://en.cppreference.com/w/cpp/language/delete)
- [C++ nullptr - cppreference](https://en.cppreference.com/w/cpp/language/nullptr)
- [C++ 内存管理 - cppreference](https://en.cppreference.com/w/cpp/memory)
