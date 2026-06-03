# 预处理器与宏：在编译前先发生的那一层

## 学习目标

- 理解 `#define` 和 `#include` 属于预处理阶段
- 会写最小常量宏和头文件保护
- 知道宏的便利和风险

## 先修知识

- 头文件
- 函数与模块拆分

## 为什么这节课重要

很多 C 初学者看到 `#define` 时只觉得它像“高级常量”。  
但它更准确的身份是“文本层替换工具”。

## 最小例子

```c
#define MAX_ITEMS 128
```

这表示在真正编译前，预处理器会先处理这类指令。

## 头文件保护

```c
#ifndef TASKS_H
#define TASKS_H

/* declarations */

#endif
```

这能避免重复包含带来的问题。

## 宏的风险

宏很方便，但也要小心：

- 不是类型安全的
- 只是文本替换
- 写复杂表达式时容易出坑

## 小练习

- 写一个 `#define APP_NAME "DevTool"`
- 写一个最小头文件保护

## 课后总结

- 宏发生在编译前
- 它适合常量和简单模板，但别滥用

## 参考文献

- cppreference preprocessing directives: https://en.cppreference.com/w/c/preprocessor

## 推荐阅读

- GNU C manual on preprocessor
