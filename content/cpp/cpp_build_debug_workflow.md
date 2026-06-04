# 构建与调试工作流

## 目标

- 会写 CMakeLists.txt 构建多文件项目
- 能读懂编译 warning 并逐一修复
- 会用 gdb 进行断点调试
- 了解 Valgrind 检测内存泄漏

## 从单文件到多文件项目

### 单文件编译的局限

当项目只有一个 `.cpp` 文件时，一条 `g++` 命令就够了。但真实项目通常有几十甚至上百个源文件：

```
myproject/
├── src/
│   ├── main.cpp
│   ├── student.cpp
│   └── course.cpp
├── include/
│   ├── student.h
│   └── course.h
└── tests/
    └── test_student.cpp
```

手动编译多个文件：

```bash
g++ -std=c++17 -Wall -Wextra \
    -I./include \
    src/main.cpp src/student.cpp src/course.cpp \
    -o myproject
```

每次修改一个文件都要重新编译全部文件，效率极低。

### 分步编译

```bash
# 分别编译每个源文件为目标文件
g++ -std=c++17 -Wall -Wextra -I./include -c src/main.cpp -o build/main.o
g++ -std=c++17 -Wall -Wextra -I./include -c src/student.cpp -o build/student.o
g++ -std=c++17 -Wall -Wextra -I./include -c src/course.cpp -o build/course.o

# 链接所有目标文件
g++ build/main.o build/student.o build/course.o -o myproject
```

这样修改 `student.cpp` 后只需重新编译它，再链接即可。

## Make 构建系统

### Makefile 基础

```makefile
# Makefile
CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -g
INCLUDES = -I./include
SRCDIR = src
BUILDDIR = build
TARGET = myproject

SOURCES = $(SRCDIR)/main.cpp $(SRCDIR)/student.cpp $(SRCDIR)/course.cpp
OBJECTS = $(BUILDDIR)/main.o $(BUILDDIR)/student.o $(BUILDDIR)/course.o

$(TARGET): $(OBJECTS)
	$(CXX) $(OBJECTS) -o $(TARGET)

$(BUILDDIR)/%.o: $(SRCDIR)/%.cpp
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

clean:
	rm -rf $(BUILDDIR)/*.o $(TARGET)

.PHONY: clean
```

使用：

```bash
make          # 编译
make clean    # 清理
make -j4      # 并行编译（4个线程）
```

## CMake 构建系统（推荐）

### 为什么用 CMake

- **跨平台**：同一份 CMakeLists.txt 可在 Windows/Linux/macOS 上生成对应构建系统
- **依赖管理**：自动处理头文件路径、库链接
- **生态成熟**：绝大多数 C++ 开源项目使用 CMake

### CMakeLists.txt 基础

```cmake
# 最低 CMake 版本要求
cmake_minimum_required(VERSION 3.15)

# 项目名称和语言
project(MyProject LANGUAGES CXX)

# 设置 C++ 标准
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# 添加可执行文件
add_executable(myproject
    src/main.cpp
    src/student.cpp
    src/course.cpp
)

# 添加头文件搜索路径
target_include_directories(myproject PRIVATE include)

# 链接库
# target_link_libraries(myproject PRIVATE pthread)
```

### CMake 构建流程

```bash
# 1. 创建构建目录（推荐 out-of-source build）
mkdir build && cd build

# 2. 配置（生成 Makefile 或 Visual Studio 项目）
cmake ..

# 3. 编译
cmake --build .

# 等价于：
# mkdir build && cd build && cmake .. && make
```

### 多目标项目

```cmake
cmake_minimum_required(VERSION 3.15)
project(StudentSystem LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 主程序
add_executable(student_app
    src/main.cpp
    src/student.cpp
    src/course.cpp
)
target_include_directories(student_app PRIVATE include)

# 单元测试
add_executable(test_student
    tests/test_student.cpp
    src/student.cpp
)
target_include_directories(test_student PRIVATE include)

# 安装规则
install(TARGETS student_app DESTINATION bin)
```

## 编译警告详解

### 常见警告及修复

```cpp
// 警告 1：未使用的变量
int unused = 42;  // warning: unused variable 'unused'
// 修复：删除或加上 [[maybe_unused]]
[[maybe_unused]] int unused = 42;

// 警告 2：控制流到达非 void 函数末尾
int max(int a, int b) {
    if (a > b) return a;
    // 缺少 else 分支的 return
}
// 修复：确保所有路径都有 return

// 警告 3：比较符号不匹配
unsigned int count = 0;
if (count < -1) {}  // warning: comparison of unsigned expression < 0
// 修复：注意有符号/无符号比较

// 警告 4：隐式类型转换
double d = 3.14;
int i = d;  // warning: implicit conversion from 'double' to 'int'
// 修复：显式转换 int i = static_cast<int>(d);
```

### 严格模式

```bash
# 将警告视为错误，强制修复所有警告
g++ -std=c++17 -Wall -Wextra -Werror -pedantic main.cpp

# -pedantic：严格遵守 ISO C++ 标准，禁用编译器扩展
```

## GDB 调试器

### 编译调试版本

```bash
g++ -std=c++17 -Wall -Wextra -g main.cpp -o debug_app
# -g 是必须的，它包含调试信息（变量名、行号等）
```

### GDB 基本操作

```bash
gdb ./debug_app
```

```gdb
# 启动后常用命令
(gdb) break main          # 在 main 函数入口设置断点
(gdb) break 42            # 在第 42 行设置断点
(gdb) break student.cpp:15 # 在指定文件指定行设置断点
(gdb) break Student::getName  # 在成员函数设置断点

(gdb) run                 # 运行程序
(gdb) run arg1 arg2       # 带参数运行

(gdb) next                # 执行下一行（不进入函数）
(gdb) step                # 执行下一行（进入函数）
(gdb) continue            # 继续执行到下一个断点
(gdb) finish              # 执行完当前函数并返回

(gdb) print x             # 打印变量 x 的值
(gdb) print students.size()  # 打印表达式
(gdb) print *this         # 打印当前对象
(gdb) display x           # 每次暂停时自动显示 x

(gdb) backtrace           # 查看调用栈
(gdb) frame 2             # 切换到第 2 层栈帧

(gdb) info breakpoints    # 查看所有断点
(gdb) delete 1            # 删除 1 号断点
(gdb) disable 2           # 禁用 2 号断点

(gdb) quit                # 退出
```

### 条件断点

```gdb
(gdb) break 42 if i == 100   # 只有 i == 100 时才中断
(gdb) break main if name == "Alice"
```

### 观察点（Watchpoint）

```gdb
(gdb) watch x          # 当 x 的值改变时中断
(gdb) rwatch x         # 当 x 被读取时中断
(gdb) awatch x         # 当 x 被读取或写入时中断
```

## Valgrind 内存检测

### 安装

```bash
# Linux
sudo apt install valgrind

# macOS（使用 Homebrew）
brew install valgrind
```

### 使用

```bash
valgrind --leak-check=full --show-leak-kinds=all ./myprogram
```

### 典型输出

```
==12345== HEAP SUMMARY:
==12345==     in use at exit: 100 bytes in 1 blocks
==12345==   total heap usage: 5 allocs, 4 frees, 1,200 bytes allocated
==12345==
==12345== 100 bytes in 1 blocks are definitely lost
==12345==    at 0x4C2FB0F: malloc (vg_replace_malloc.c:309)
==12345==    by 0x1091B3: main (main.cpp:15)
```

这说明在 `main.cpp:15` 处分配的 100 字节没有被释放。

## AddressSanitizer（现代替代方案）

Valgrind 较慢，GCC/Clang 内置的 AddressSanitizer 更快：

```bash
g++ -std=c++17 -fsanitize=address -g main.cpp -o app
./app
```

能检测：

- 内存泄漏
- 缓冲区溢出
- 释放后使用（use-after-free）
- 栈溢出

## 性能分析

### gprof

```bash
g++ -std=c++17 -pg main.cpp -o app
./app           # 运行生成 gmon.out
gprof app gmon.out > profile.txt
```

### perf（Linux）

```bash
perf record ./app
perf report
```

## IDE 集成

### VS Code 配置

`.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "build",
      "type": "shell",
      "command": "cmake",
      "args": ["--build", "build"],
      "group": "build"
    }
  ]
}
```

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug",
      "type": "cppdbg",
      "request": "launch",
      "program": "${workspaceFolder}/build/myproject",
      "args": [],
      "stopAtEntry": false,
      "cwd": "${workspaceFolder}",
      "environment": [],
      "externalConsole": false,
      "MIMode": "gdb",
      "setupCommands": [
        {
          "description": "Enable pretty-printing",
          "text": "-enable-pretty-printing",
          "ignoreFailures": true
        }
      ]
    }
  ]
}
```

## 最佳实践

1. **始终使用 out-of-source build**：不要污染源码目录
2. **开启所有警告**：`-Wall -Wextra -Werror`
3. **调试版本用 `-g`**：发布版本用 `-O2`
4. **用 CMake 管理项目**：不要手写 Makefile（除非简单项目）
5. **定期用 Valgrind/ASan 检查**：不要等到上线才发现内存泄漏
6. **版本控制忽略构建产物**：在 `.gitignore` 中添加 `build/`

## 练习

### 练习 1：CMake 项目

创建一个包含 3 个源文件的 C++ 项目，编写 CMakeLists.txt 并成功构建。

### 练习 2：GDB 调试

编写一个有 bug 的程序（如数组越界），用 gdb 定位问题。

### 练习 3：内存泄漏检测

编写一个有内存泄漏的程序，用 Valgrind 或 AddressSanitizer 检测并修复。

### 练习 4：条件断点

编写一个循环 1000 次的程序，用条件断点在第 500 次循环时中断。

## 参考资料

- [CMake 官方教程](https://cmake.org/cmake/help/latest/guide/tutorial/index.html)
- [GDB 用户手册](https://sourceware.org/gdb/current/onlinedocs/gdb/)
- [Valgrind 用户手册](https://valgrind.org/docs/manual/manual.html)
- [AddressSanitizer](https://github.com/google/sanitizers/wiki/AddressSanitizer)
- [GCC Warning Options](https://gcc.gnu.org/onlinedocs/gcc/Warning-Options.html)
