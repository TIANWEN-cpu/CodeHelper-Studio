# C++ 学习地图与环境准备

## 课程概述

欢迎来到 C++ 编程世界！本章将帮助你理解 C++ 的编译流程、搭建开发环境、编写第一个程序，并了解 C++ 与 Python 等语言的核心差异。这是你 C++ 学习之旅的起点。

## C++ 编译过程详解

C++ 是一种**编译型语言**，源代码需要经过四个阶段才能变成可执行程序。理解这个过程对于排查编译错误和优化构建速度至关重要。

### 1. 预处理（Preprocessing）

预处理器处理所有以 `#` 开头的指令。它会做三件主要的事情：将 `#include` 的头文件内容直接插入源文件、展开 `#define` 宏定义、根据 `#ifdef`/`#ifndef` 等条件编译指令决定保留哪些代码。

```cpp
// hello.cpp - 预处理前的源代码
#include <iostream>     // 预处理器会将 iostream 的全部内容复制到这里
#define PI 3.14159      // 所有 PI 会被替换为 3.14159
#define SQUARE(x) ((x) * (x))  // 宏函数也会被展开

int main() {
    std::cout << "Hello, DevLearner AI!" << std::endl;
    double area = PI * 5.0 * 5.0;  // 预处理后变为 3.14159 * 5.0 * 5.0
    return 0;
}
```

运行 `g++ -E hello.cpp` 可以查看预处理后的输出（内容会非常长，因为 iostream 引入了大量代码）。预处理后的文件通常以 `.i` 为扩展名。

### 2. 编译（Compilation）

编译器将预处理后的 C++ 代码翻译成**汇编语言**。在这个阶段，编译器会进行词法分析、语法分析、语义分析、类型检查，以及代码优化。如果代码有语法错误（如缺少分号、类型不匹配），就会在这一步报错。

```bash
# 生成汇编代码文件
g++ -S hello.cpp
# 会生成 hello.s 文件，里面是汇编指令
```

汇编代码示例（简化版）：

```asm
    .text
    .globl main
    .type main, @function
main:
    pushq %rbp
    movq %rsp, %rbp
    # ... 更多汇编指令
    movl $0, %eax
    popq %rbp
    ret
```

### 3. 汇编（Assembly）

汇编器将汇编代码翻译成**机器码**（目标文件）。在 Windows 上是 `.obj` 文件，在 Linux/macOS 上是 `.o` 文件。这个阶段基本是一对一的翻译，每条汇编指令对应一条机器指令。

```bash
# 只编译不链接，生成目标文件
g++ -c hello.cpp
# 会生成 hello.o（Linux/macOS）或 hello.obj（Windows）
```

目标文件包含机器码，但其中的外部引用（如 `std::cout`）还没有被解析。

### 4. 链接（Linking）

链接器将一个或多个目标文件与库文件合并，生成最终的可执行文件。它会解析所有未定义的符号引用——比如你调用了 `std::cout`，链接器会在标准库中找到它的实现并连接起来。

```bash
# 将目标文件链接成可执行文件
g++ hello.o -o hello
# 在 Windows 上生成 hello.exe，在 Linux/macOS 上生成 hello
```

### 一键编译

实际开发中，我们通常用一条命令完成所有步骤：

```bash
g++ hello.cpp -o hello
```

## 安装 g++ 编译器

### Windows

推荐使用 **MinGW-w64** 或 **MSYS2**：

**方法一：使用 MSYS2（推荐）**

```bash
# 1. 从 https://www.msys2.org/ 下载安装 MSYS2
# 2. 打开 MSYS2 终端，运行：
pacman -S mingw-w64-x86_64-gcc
# 3. 将 C:\msys64\mingw64\bin 添加到系统 PATH 环境变量
# 4. 打开新的命令提示符，验证安装：
g++ --version
```

**方法二：使用 MinGW-w64 独立安装**

```bash
# 1. 从 https://winlibs.com/ 下载预编译版本
# 2. 解压到 C:\mingw64
# 3. 将 C:\mingw64\bin 添加到系统 PATH
# 4. 打开新的命令提示符，验证：
g++ --version
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update
sudo apt install g++
g++ --version  # 验证安装
```

### Linux (CentOS/RHEL/Fedora)

```bash
# CentOS/RHEL
sudo yum install gcc-c++

# Fedora
sudo dnf install gcc-c++
```

### macOS

```bash
# 安装 Xcode Command Line Tools（包含 clang++）
xcode-select --install

# 或使用 Homebrew 安装 g++
brew install gcc
# 使用 g++-13 或类似名称（取决于版本）
```

## 第一个 C++ 程序

创建文件 `hello.cpp`：

```cpp
#include <iostream>  // 引入标准输入输出流库

int main() {  // 程序入口点，每个 C++ 程序必须有且仅有一个 main 函数
    std::cout << "Hello, DevLearner AI!" << std::endl;
    return 0;  // 返回 0 表示程序正常结束
}
```

编译并运行：

```bash
# 编译
g++ hello.cpp -o hello

# 运行
# Windows:
hello.exe
# Linux/macOS:
./hello

# 输出:
# Hello, DevLearner AI!
```

### 代码逐行解释

- `#include <iostream>`：引入标准输入输出库，让我们能使用 `std::cout` 和 `std::cin`
- `int main()`：C++ 程序的入口函数，必须存在且只能有一个。返回类型为 `int`
- `std::cout`：标准输出流对象，用于向控制台打印内容
- `<<`：流插入运算符，将右侧内容送入左侧的输出流
- `std::endl`：输出换行符并刷新输出缓冲区
- `return 0`：向操作系统返回 0，表示程序成功执行。在 `main` 函数中可以省略（编译器会自动添加）

## 常用编译标志详解

| 标志      | 作用                     | 示例                          |
| --------- | ------------------------ | ----------------------------- |
| `-o`      | 指定输出文件名           | `g++ hello.cpp -o myprogram`  |
| `-std`    | 指定 C++ 标准版本        | `g++ -std=c++17 hello.cpp`    |
| `-Wall`   | 开启大部分常见警告       | `g++ -Wall hello.cpp`         |
| `-Wextra` | 开启额外警告             | `g++ -Wall -Wextra hello.cpp` |
| `-g`      | 生成调试信息（用于 gdb） | `g++ -g hello.cpp`            |
| `-O2`     | 二级优化，提升运行速度   | `g++ -O2 hello.cpp`           |
| `-O0`     | 关闭优化（默认，调试用） | `g++ -O0 hello.cpp`           |
| `-I`      | 添加头文件搜索路径       | `g++ -I./include hello.cpp`   |
| `-L`      | 添加库文件搜索路径       | `g++ -L./lib hello.cpp`       |
| `-l`      | 链接指定库               | `g++ hello.cpp -lm`           |
| `-c`      | 只编译不链接             | `g++ -c hello.cpp`            |
| `-D`      | 定义宏                   | `g++ -DDEBUG hello.cpp`       |

### 推荐的编译命令组合

```bash
# 开发阶段：开启所有警告和调试信息
g++ -std=c++17 -Wall -Wextra -g hello.cpp -o hello

# 发布阶段：开启优化，关闭调试信息
g++ -std=c++17 -O2 hello.cpp -o hello

# 严格模式：将警告视为错误
g++ -std=c++17 -Wall -Wextra -Werror hello.cpp -o hello
```

### C++ 标准版本

| 标准  | 年份 | 关键特性                                                 |
| ----- | ---- | -------------------------------------------------------- |
| C++98 | 1998 | 第一个 ISO 标准，STL 引入                                |
| C++11 | 2011 | auto、lambda、智能指针、移动语义、范围 for               |
| C++14 | 2014 | 泛型 lambda、变量模板、二进制字面量                      |
| C++17 | 2017 | 结构化绑定、std::optional、std::filesystem、if constexpr |
| C++20 | 2020 | Concepts、Ranges、Coroutines、Modules、三路运算符        |
| C++23 | 2023 | std::expected、mdspan、std::print                        |

**建议**：新项目使用 `-std=c++17` 或更高版本。C++11 是最低要求。

## C++ 与 Python 的核心差异

### 1. 编译 vs 解释

```cpp
// C++：需要先编译再运行
// hello.cpp → (预处理) → (.i) → (编译) → (.s) → (汇编) → (.o) → (链接) → hello.exe → 运行
```

```python
# Python：直接解释执行
# python hello.py → 直接输出
```

### 2. 类型系统

```cpp
// C++：静态类型，编译时检查类型
int x = 10;       // x 的类型固定为 int，不能再改变
double y = 3.14;  // 类型不匹配会在编译时报错
// x = "hello";   // 编译错误！不能把字符串赋给 int 变量
```

```python
# Python：动态类型，运行时检查
x = 10          # x 是 int
x = "hello"     # 没问题，x 现在是 str
```

### 3. 内存管理

```cpp
// C++：手动管理或使用 RAII/智能指针
int* arr = new int[100];  // 手动在堆上分配
delete[] arr;             // 必须手动释放，否则内存泄漏
```

```python
# Python：自动垃圾回收
arr = [0] * 100  # 自动管理内存，不需要手动释放
```

### 4. 性能对比

```cpp
// C++：直接编译为机器码，无运行时解释开销
// 数值计算通常比 Python 快 10-100 倍
#include <vector>
std::vector<int> nums(1000000);
for (int i = 0; i < 1000000; ++i) {
    nums[i] = i * 2;
}
```

### 5. 标准库设计哲学

```cpp
// C++：零成本抽象，模板在编译期展开，不产生运行时开销
#include <algorithm>
#include <vector>
std::vector<int> v = {3, 1, 4, 1, 5};
std::sort(v.begin(), v.end());  // 编译期生成最优排序代码
```

## 常见陷阱与最佳实践

### 陷阱 1：忘记分号

```cpp
// 错误：缺少分号
int x = 10  // 编译错误：expected ';' before...

// 正确
int x = 10;
```

### 陷阱 2：混淆 `=` 和 `==`

```cpp
int x = 5;
if (x = 10) {  // 这是赋值，不是比较！条件永远为 true
    // 这段代码会执行，但逻辑是错的
}
// 正确写法：if (x == 10)
// 建议写法：if (10 == x) —— 如果写成 if (10 = x) 会编译报错
```

### 陷阱 3：未初始化变量

```cpp
int x;  // 未初始化，值是随机的垃圾值
std::cout << x;  // 输出不可预测的值
// 正确：int x = 0;
```

### 陷阱 4：整数除法

```cpp
double result = 5 / 2;  // 结果是 2.0，不是 2.5！
// 因为 5 和 2 都是整数，先做整数除法，再转换为 double
// 正确：double result = 5.0 / 2.0;
```

### 最佳实践

1. **始终开启警告**：使用 `-Wall -Wextra`，把警告当错误对待（加 `-Werror`）
2. **使用现代 C++ 标准**：至少 `-std=c++17`
3. **使用有意义的变量名**：`studentCount` 优于 `sc`
4. **保持一致的缩进风格**：推荐 4 个空格
5. **每个函数只做好一件事**：保持函数简短清晰
6. **初始化所有变量**：避免使用未初始化的变量

## 练习

### 练习 1：环境验证

在你的系统上安装 g++，运行 `g++ --version` 并记录版本号。

### 练习 2：编译实验

编写一个打印你姓名和年龄的程序，分别用以下命令编译：

```bash
g++ hello.cpp -o hello
g++ -Wall -Wextra hello.cpp -o hello
g++ -std=c++17 -Wall -Wextra -g hello.cpp -o hello
```

比较不同命令的输出差异。

### 练习 3：观察编译过程

对同一个文件分别运行：

```bash
g++ -E hello.cpp > preprocessed.txt
g++ -S hello.cpp
g++ -c hello.cpp
g++ hello.cpp -o hello
```

查看每个阶段生成的文件内容。

### 练习 4：故意制造错误

编写有语法错误的代码（如缺少分号、拼错关键字），观察编译器的错误信息。尝试理解错误信息的含义。

### 练习 5：C++ 标准对比

编写使用 `auto` 关键字的代码，分别用 `-std=c++98` 和 `-std=c++11` 编译，观察差异。

## 参考链接

- [GCC 编译选项文档](https://gcc.gnu.org/onlinedocs/gcc/Option-Summary.html)
- [C++ 编译器支持情况 - cppreference](https://en.cppreference.com/w/cpp/compiler_support)
- [MinGW-w64 官方站点](https://www.mingw-w64.org/)
- [CMake 入门教程](https://cmake.org/cmake/help/latest/guide/tutorial/index.html)
- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- [C++ 标准文档](https://isocpp.org/std/the-standard)
