# C 语言学习地图与编译入门

## 学习目标

- 理解源码、编译器、目标文件和可执行文件之间的关系
- 会用 `gcc` 编译一个最小 C 程序
- 建立“C 更贴近机器，也更需要你负责细节”的第一印象

## C 和脚本语言最大的不同

在 Python 里，你更常直接运行脚本。  
在 C 里，你通常先写 `.c` 文件，再交给编译器生成可执行文件。

## 一个最小程序

```c
#include <stdio.h>

int main(void) {
    printf("Hello, C!\n");
    return 0;
}
```

编译方式通常像这样：

```bash
gcc main.c -o hello
```

## 你真正该理解什么

- 源代码不会自己变成程序
- 编译器会检查很多语法和类型问题
- C 更显式，所以你会更早接触“机器到底怎么理解程序”

## 参考文献

- [GNU C Language Manual](https://www.gnu.org/software/c-intro-and-ref/manual/c-intro-and-ref.html)
- [cppreference C language](https://www.cppreference.com/w/c/language.html)

## 推荐论文 / 文章

- [Go To Statement Considered Harmful](https://www.cs.cornell.edu/courses/JavaAndDS/files/DijkstraHarmful68.pdf)
  它很适合作为开始学底层语言时的“编程风格提醒”。
