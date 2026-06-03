# 字符串库函数的安全用法

## 你会学到

- 知道常见字符串函数的输入输出约定
- 会给目标缓冲区留空间
- 知道为什么 fgets 通常比 gets 稳

## 先修知识

- 数组与内存布局
- 文件与缓冲区基础

## 为什么这节课重要

C 的字符串问题很少是“不会拼接”，更多是边界、结束符和缓冲区管理没想透。

## 核心知识

- 字符串以 \0 结尾
- 复制和拼接时要先算容量
- 读一行文本时优先考虑带长度的 API

## 示例

```c
char dest[16];
strncpy(dest, source, sizeof(dest) - 1);
dest[sizeof(dest) - 1] = \0;
```

## 继续练什么

- 写一个安全复制用户名的函数
- 比较 strlen 和 sizeof 在字符数组上的差异

## 参考资料

- [cppreference string handling](https://en.cppreference.com/w/c/string/byte)
- [CERT C String Rules](https://wiki.sei.cmu.edu/confluence/display/c/STR00-C.+Represent+characters+using+an+appropriate+type)

## 推荐论文 / 经典文章

- [Why Johnny Cant Code](https://www.eecs.qmul.ac.uk/~mmh/ItP/why_johnny_cant_code.pdf)
