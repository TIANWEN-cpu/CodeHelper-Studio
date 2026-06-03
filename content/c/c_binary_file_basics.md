# 二进制文件基础：从文本走向更底层的存储

## 学习目标

- 理解文本文件和二进制文件的直观区别
- 会使用 `fread` / `fwrite`
- 知道什么时候该优先用文本，什么时候可以考虑二进制

## 先修知识

- 文件读写
- 结构体

## 为什么这节课重要

文本文件更容易调试，但有些场景下：

- 数据更固定
- 不需要人类直接阅读
- 更关心写入和读取效率

这时就会接触二进制文件。

## 最小写入例子

```c
#include <stdio.h>

int main(void) {
    int values[3] = {10, 20, 30};
    FILE *fp = fopen("data.bin", "wb");
    if (fp == NULL) return 1;

    fwrite(values, sizeof(int), 3, fp);
    fclose(fp);
    return 0;
}
```

## 最小读取例子

```c
int values[3] = {0};
FILE *fp = fopen("data.bin", "rb");
if (fp == NULL) return 1;

fread(values, sizeof(int), 3, fp);
fclose(fp);
```

## 什么时候别急着用二进制

- 你还在调试结构
- 你希望文件能直接打开查看
- 你更看重跨语言和跨平台的可读性

很多时候，第一版项目还是文本更合适。

## 常见错误

- 打开模式写错，忘了 `rb` / `wb`
- 不检查 `fread` / `fwrite` 返回值
- 把“内存布局”当成“长期稳定的存储格式”

## 小练习

- 把 5 个整数写入二进制文件
- 再读出来并打印

## 课后总结

- 二进制文件更贴近内存表示
- 它不一定更高级，只是更适合某些场景
- 第一版工具先文本，确实需要再上二进制

## 参考文献

- cppreference `fread`: https://en.cppreference.com/w/c/io/fread
- cppreference `fwrite`: https://en.cppreference.com/w/c/io/fwrite

## 推荐阅读

- The Practice of Programming, file formats discussion
