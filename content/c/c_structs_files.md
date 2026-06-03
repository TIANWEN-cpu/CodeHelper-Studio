# 结构体、文件与小型数据程序

## 学习目标

- 会定义结构体
- 会用文件保存简单数据
- 能写出最小的记录型程序

## 为什么结构体很关键

当一条数据不再只是一个整数，而是“名字 + 分数 + 状态”时，结构体就登场了。

```c
struct Student {
    char name[20];
    int score;
};
```

## 文件读写为什么值得早学

一旦程序能把数据保存到文件里，它就开始像一个真正的工具，而不是课堂上的瞬时演示。

## 常见误区

- 结构体和数组边界处理不清楚
- 写文件时忘记检查是否打开成功
- 只关心“写进去”，不关心“还能不能再读出来”

## 参考文献

- [cppreference Struct and Union](https://www.cppreference.com/w/c/language/struct.html)
- [GNU C Manual - File I/O](https://www.gnu.org/software/c-intro-and-ref/manual/c-intro-and-ref.html)

## 推荐论文 / 文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  这篇文章会帮助你把“数据结构设计”和“程序拆分”连起来看。
