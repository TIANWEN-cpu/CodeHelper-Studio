# C 文件读写与记录结构：开始做真正可保存的小工具

## 学习目标

- 会用 `FILE *` 打开、读取、写入和关闭文件
- 理解结构体和文件存储之间的关系
- 能写出最小“本地保存记录”的 C 小程序骨架

## 先修知识

- 结构体
- 字符串与数组
- 函数拆分

## 为什么这节课重要

如果 C 代码永远只在内存里跑一圈就结束，它会很像课堂练习。  
一旦你开始把数据写入文件，程序就会更像真正的工具。

## 最小写文件例子

```c
#include <stdio.h>

int main(void) {
    FILE *fp = fopen("items.txt", "w");
    if (fp == NULL) {
        return 1;
    }

    fprintf(fp, "apple,3\n");
    fprintf(fp, "book,5\n");
    fclose(fp);
    return 0;
}
```

这里的顺序很重要：

1. `fopen`
2. 判空
3. 写入
4. `fclose`

## 结构体记录的最小思路

```c
typedef struct {
    char name[32];
    int count;
} Item;
```

你可以先用“文本格式”保存：

```text
apple,3
book,5
pen,9
```

这比一上来就处理二进制文件更容易调试。

## 常见错误

- 打开失败却继续写
- 写完忘记关闭
- 读字符串时不考虑长度边界
- 把“结构体的内存布局”和“文本格式存储”混为一谈

## 一个很实用的建议

刚开始做 C 小项目时，优先选：

- 文本文件
- 一行一条记录
- 清晰的字段分隔符

别急着一口气上复杂二进制格式。

## 小练习

- 写一个程序，把三条商品记录写进文本文件
- 再写一个函数，把文件内容按行读出来打印

## 课后总结

- `FILE *` 是 C 文件操作的入口
- 稳定的文件流程一定包含失败判断和关闭
- 结构体负责内存里的组织，文件负责持久化

## 参考文献

- cppreference `fopen`: https://en.cppreference.com/w/c/io/fopen
- cppreference `fprintf`: https://en.cppreference.com/w/c/io/fprintf
- cppreference `fgets`: https://en.cppreference.com/w/c/io/fgets

## 推荐阅读

- The C Programming Language, 2nd Edition, Chapter 7
