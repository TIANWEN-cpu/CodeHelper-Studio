# Make、编译选项与 GDB 初见

## 你会学到

- 知道 `-Wall -Wextra -g` 为什么重要
- 会用 GDB 设置断点并运行程序
- 建立“先看警告，再继续”的习惯

## 为什么这节课重要

C 的学习体验很大一部分来自工具链。会编译、会看警告、会打断点，往往比死记更多语法更能让你变强。

## 核心知识

- 编译警告不是噪音，而是提前告诉你哪可能出事。
- GDB 最小闭环是 `break`、`run`、`next`、`print`。
- Make 的价值是让重复编译有固定入口。

## 示例

```makefile
app: main.c
	gcc -Wall -Wextra -g main.c -o app
```

## 常见误区

- 看到 warning 也照样运行
- 调试时不先构造最小复现场景
- Makefile 一开始就写得过于复杂

## 继续练什么

- 为一个单文件 C 程序写最小 Makefile
- 用 GDB 在 `main` 处打断点并查看变量

## 参考资料

- [GDB Documentation](https://sourceware.org/gdb/current/onlinedocs/gdb/)
- [GNU make Manual](https://www.gnu.org/software/make/manual/make.html)

## 推荐论文 / 经典文章

- [The Mythical Man-Month](https://archive.org/details/mythicalmanmonth00fred)
  工具和流程的价值，在大多数项目里都被低估。
