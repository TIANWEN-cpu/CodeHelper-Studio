# 头文件、声明与模块拆分

## 你会学到

- 理解声明和定义为什么要分开
- 会写 `include guard`
- 知道一个最小 C 项目如何拆成 `.h` 和 `.c`

## 为什么这节课重要

C 一旦超过一个文件，模块边界就不再是可选项。学会头文件和实现文件的分工，代码才开始像项目，而不只是练习题。

## 核心知识

- 头文件放声明，源文件放实现。
- `include guard` 用来避免重复包含。
- 不要在头文件里放无必要的实现细节。

## 示例

```c
#ifndef TASKS_H
#define TASKS_H

void add_task(const char *title);

#endif
```

## 常见误区

- 把函数实现直接写进头文件
- 多个头文件使用了同名 guard 宏
- 模块依赖关系越写越乱

## 继续练什么

- 把一个 `calc.c` 程序拆成 `calc.h` 和 `calc.c`
- 自己命名一个规范的 include guard

## 参考资料

- [cppreference: preprocessor](https://en.cppreference.com/w/c/preprocessor)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  这是学习“如何拆文件、拆模块”的最经典起点之一。
