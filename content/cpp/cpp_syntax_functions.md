# 基础语法与函数入门

## 课程概述

本章将带你学习 C++ 的基础语法，包括变量与数据类型、运算符、控制流语句、函数的定义与使用、函数重载以及变量的作用域。掌握这些内容是编写任何 C++ 程序的基础。

## 变量与数据类型

C++ 是一种静态类型语言，每个变量在声明时必须指定其类型，且类型在程序运行期间不能改变。

### 基本数据类型

```cpp
#include <iostream>

int main() {
    // 整数类型 - 用于存储整数值
    int age = 25;               // 通常 4 字节，范围约 -21亿 到 +21亿
    short count = 100;          // 通常 2 字节，范围 -32768 到 32767
    long bigNum = 1000000L;     // 至少 4 字节，后缀 L 表示 long
    long long hugeNum = 10000000000LL;  // 至少 8 字节

    // 浮点类型 - 用于存储带小数的数值
    double price = 19.99;       // 通常 8 字节，双精度浮点数
    float ratio = 3.14f;        // 通常 4 字节，单精度浮点数，后缀 f 表示 float

    // 字符类型 - 存储单个字符
    char grade = 'A';           // 1 字节，使用单引号
    char newline = '\n';        // 转义字符

    // 布尔类型 - 只有 true 或 false 两个值
    bool isActive = true;       // true 或 false（不是 1 或 0，虽然底层如此）
    bool isEmpty = false;

    // 输出所有变量
    std::cout << "Age: " << age << std::endl;
    std::cout << "Price: " << price << std::endl;
    std::cout << "Grade: " << grade << std::endl;
    std::cout << "Active: " << isActive << std::endl;  // 输出 1 或 0

    return 0;
}
```

### auto 关键字（C++11）

当编译器可以从初始化表达式推断类型时，可以使用 `auto` 让编译器自动推导类型：

```cpp
auto x = 10;        // x 的类型推导为 int
auto y = 3.14;      // y 的类型推导为 double
auto name = "hello"; // name 的类型推导为 const char*
auto flag = true;   // flag 的类型推导为 bool

// auto 在复杂类型中特别有用
#include <vector>
std::vector<std::pair<int, std::string>> students;
auto it = students.begin();  // 比写全类型名简洁得多
```

**注意**：`auto` 不是动态类型，类型在编译时就已确定。过度使用 `auto` 会降低代码可读性。

### 类型大小查询

```cpp
#include <iostream>

int main() {
    std::cout << "sizeof(int): " << sizeof(int) << " bytes" << std::endl;
    std::cout << "sizeof(double): " << sizeof(double) << " bytes" << std::endl;
    std::cout << "sizeof(char): " << sizeof(char) << " bytes" << std::endl;
    std::cout << "sizeof(bool): " << sizeof(bool) << " bytes" << std::endl;
    std::cout << "sizeof(long): " << sizeof(long) << " bytes" << std::endl;
    return 0;
}
```

## 运算符

### 算术运算符

```cpp
int a = 10, b = 3;

int sum = a + b;       // 加法：13
int diff = a - b;      // 减法：7
int product = a * b;   // 乘法：30
int quotient = a / b;  // 整数除法：3（不是 3.333！）
int remainder = a % b; // 取模（余数）：1

// 浮点除法
double precise = 10.0 / 3.0;  // 3.3333...

// 自增/自减
int x = 5;
x++;   // x 变为 6（后置：先使用再加）
++x;   // x 变为 7（前置：先加再使用）
x--;   // x 变为 6
--x;   // x 变为 5
```

### 比较与逻辑运算符

```cpp
int a = 10, b = 20;

// 比较运算符 - 返回 bool 值
bool eq = (a == b);   // false - 等于
bool ne = (a != b);   // true  - 不等于
bool lt = (a < b);    // true  - 小于
bool gt = (a > b);    // false - 大于
bool le = (a <= b);   // true  - 小于等于
bool ge = (a >= b);   // false - 大于等于

// 逻辑运算符
bool andResult = (a > 5) && (b < 30);   // true && true = true
bool orResult  = (a > 15) || (b < 30);  // false || true = true
bool notResult = !(a > 5);              // !true = false
```

### 赋值运算符

```cpp
int x = 10;
x += 5;   // 等价于 x = x + 5，x 变为 15
x -= 3;   // 等价于 x = x - 3，x 变为 12
x *= 2;   // 等价于 x = x * 2，x 变为 24
x /= 4;   // 等价于 x = x / 4，x 变为 6
x %= 4;   // 等价于 x = x % 4，x 变为 2
```

## 控制流语句

### if / else if / else

```cpp
#include <iostream>

int main() {
    int score = 85;

    if (score >= 90) {
        std::cout << "优秀" << std::endl;
    } else if (score >= 80) {
        std::cout << "良好" << std::endl;
    } else if (score >= 60) {
        std::cout << "及格" << std::endl;
    } else {
        std::cout << "不及格" << std::endl;
    }

    // 三元运算符 - 简洁的条件表达式
    std::string result = (score >= 60) ? "通过" : "未通过";
    std::cout << result << std::endl;

    return 0;
}
```

### for 循环

```cpp
// 标准 for 循环：初始化; 条件; 更新
for (int i = 0; i < 5; ++i) {
    std::cout << "i = " << i << std::endl;
}
// 输出: 0, 1, 2, 3, 4

// 倒序循环
for (int i = 10; i > 0; --i) {
    std::cout << i << " ";
}
std::cout << "发射！" << std::endl;

// 多变量循环
for (int i = 0, j = 10; i < j; ++i, --j) {
    std::cout << "i=" << i << ", j=" << j << std::endl;
}

// 范围 for 循环（C++11）- 遍历容器
int arr[] = {10, 20, 30, 40, 50};
for (int num : arr) {
    std::cout << num << " ";
}
```

### while 循环

```cpp
// while 循环：先判断条件，再执行循环体
int count = 0;
while (count < 5) {
    std::cout << "Count: " << count << std::endl;
    count++;
}

// 读取用户输入直到输入 0
int input;
std::cout << "输入数字（0 退出）: ";
std::cin >> input;
while (input != 0) {
    std::cout << "你输入了: " << input << std::endl;
    std::cout << "输入数字（0 退出）: ";
    std::cin >> input;
}
```

### do-while 循环

```cpp
// do-while 循环：先执行一次循环体，再判断条件
// 适用于至少需要执行一次的场景
int password;
do {
    std::cout << "请输入密码: ";
    std::cin >> password;
} while (password != 1234);  // 密码正确才退出

std::cout << "密码正确，欢迎！" << std::endl;
```

### switch 语句

```cpp
#include <iostream>

int main() {
    int day = 3;

    switch (day) {
        case 1:
            std::cout << "星期一" << std::endl;
            break;  // 不要忘记 break，否则会"穿透"到下一个 case
        case 2:
            std::cout << "星期二" << std::endl;
            break;
        case 3:
            std::cout << "星期三" << std::endl;
            break;
        case 4:
            std::cout << "星期四" << std::endl;
            break;
        case 5:
            std::cout << "星期五" << std::endl;
            break;
        case 6:
        case 7:  // 多个 case 共享同一段代码
            std::cout << "周末" << std::endl;
            break;
        default:  // 所有 case 都不匹配时执行
            std::cout << "无效的天数" << std::endl;
            break;
    }

    return 0;
}
```

## 函数

### 函数定义与声明

```cpp
#include <iostream>

// 函数声明（原型）- 告诉编译器函数的存在，可以在 main 之前声明
int add(int a, int b);

int main() {
    int result = add(3, 5);
    std::cout << "3 + 5 = " << result << std::endl;
    return 0;
}

// 函数定义 - 实际的函数实现
int add(int a, int b) {
    return a + b;
}
```

### 参数传递：按值传递

```cpp
#include <iostream>

// 按值传递：函数收到的是参数的副本，修改不影响原变量
void tryToModify(int x) {
    x = 100;  // 只修改了副本
    std::cout << "函数内 x = " << x << std::endl;
}

int main() {
    int num = 10;
    tryToModify(num);
    std::cout << "函数外 num = " << num << std::endl;  // 仍然是 10
    return 0;
}
```

### 返回值

```cpp
// 返回单个值
int square(int x) {
    return x * x;
}

// 无返回值（void 函数）
void printMessage(const std::string& msg) {
    std::cout << msg << std::endl;
    // void 函数可以没有 return，或者有 return;（不返回值）
}

// 提前返回
bool isPositive(int x) {
    if (x <= 0) {
        return false;  // 提前返回
    }
    return true;
}
```

### 函数重载

C++ 允许同一个函数名有多个版本，只要参数列表不同（参数数量或类型不同）：

```cpp
#include <iostream>

// 重载 1：两个 int 相加
int add(int a, int b) {
    return a + b;
}

// 重载 2：两个 double 相加
double add(double a, double b) {
    return a + b;
}

// 重载 3：三个 int 相加
int add(int a, int b, int c) {
    return a + b + c;
}

int main() {
    std::cout << add(3, 5) << std::endl;        // 调用重载 1
    std::cout << add(3.14, 2.72) << std::endl;  // 调用重载 2
    std::cout << add(1, 2, 3) << std::endl;     // 调用重载 3
    return 0;
}
```

**注意**：仅返回值不同不足以构成重载。`int foo()` 和 `double foo()` 不能共存。

## 作用域与生命周期

### 块作用域

```cpp
#include <iostream>

int globalVar = 100;  // 全局变量：整个程序都可访问

int main() {
    int localVar = 200;  // 局部变量：只在 main 函数内可用

    if (true) {
        int blockVar = 300;  // 块作用域：只在这个 if 块内可用
        std::cout << blockVar << std::endl;   // OK
        std::cout << localVar << std::endl;   // OK - 可以访问外层作用域
        std::cout << globalVar << std::endl;  // OK - 可以访问全局变量
    }
    // std::cout << blockVar << std::endl;  // 错误！blockVar 已超出作用域

    // 变量遮蔽（shadowing）
    int localVar = 999;  // 遮蔽了外层的 localVar（编译器会警告）
    std::cout << localVar << std::endl;  // 输出 999

    return 0;
}
```

### 变量的生命周期

```cpp
// 静态局部变量 - 只初始化一次，生命周期贯穿整个程序运行期
void counter() {
    static int count = 0;  // 只执行一次初始化
    count++;
    std::cout << "调用次数: " << count << std::endl;
}

int main() {
    counter();  // 输出: 调用次数: 1
    counter();  // 输出: 调用次数: 2
    counter();  // 输出: 调用次数: 3
    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：整数除法丢失精度

```cpp
double result = 5 / 2;     // 结果是 2.0，不是 2.5！
double correct = 5.0 / 2;  // 结果是 2.5
```

### 陷阱 2：switch 忘记 break

```cpp
switch (x) {
    case 1:
        std::cout << "One";
        // 忘记 break！会继续执行 case 2
    case 2:
        std::cout << "Two";
        break;
}
```

### 陷阱 3：未初始化变量

```cpp
int x;  // 值是随机的垃圾值
// 总是初始化：int x = 0;
```

### 最佳实践

1. **使用 `++i` 而非 `i++`**：前置自增避免了创建临时副本，虽然现代编译器会优化掉差异
2. **函数名用动词开头**：`calculateSum()`、`printReport()`
3. **保持函数简短**：一个函数最好不超过 30 行
4. **使用 `const` 修饰不修改的参数**
5. **为函数添加注释说明用途、参数和返回值**

## 练习

### 练习 1：温度转换器

编写函数 `celsiusToFahrenheit(double c)` 和 `fahrenheitToCelsius(double f)`，实现摄氏度和华氏度的互相转换。公式：F = C _ 9/5 + 32，C = (F - 32) _ 5/9。

### 练习 2：FizzBuzz

编写程序打印 1 到 100，但：能被 3 整除打印 "Fizz"，能被 5 整除打印 "Buzz"，同时被 3 和 5 整除打印 "FizzBuzz"。

### 练习 3：函数重载

编写一个 `max` 函数，分别支持两个 int、三个 int、两个 double 的比较，返回最大值。

### 练习 4：统计数字位数

编写函数 `countDigits(int n)`，返回一个整数的位数。例如 `countDigits(12345)` 返回 5。

### 练习 5：打印图案

使用嵌套循环打印以下图案：

```
*
**
***
****
*****
```

## 参考链接

- [C++ 基本类型 - cppreference](https://en.cppreference.com/w/cpp/language/types)
- [C++ 运算符 - cppreference](https://en.cppreference.com/w/cpp/language/expressions)
- [C++ 函数 - cppreference](https://en.cppreference.com/w/cpp/language/functions)
- [C++ 作用域 - cppreference](https://en.cppreference.com/w/cpp/language/scope)
- [C++ 控制流 - cppreference](https://en.cppreference.com/w/cpp/language/statements)
