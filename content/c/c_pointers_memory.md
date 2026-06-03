# 指针、地址与内存模型

## 学习目标

- 理解“值”和“地址”是两回事
- 会声明最基本的指针
- 知道野指针、空指针和悬空指针为什么危险

## 别急着背符号

很多人一看到 `*` 和 `&` 就开始慌。  
其实先记住一句话就够了：  
指针保存的是地址，不是普通值。

```c
int score = 90;
int *p = &score;
```

这里：

- `score` 是一个整数
- `&score` 是它的地址
- `p` 保存这个地址

## 为什么它重要

因为 C 很多高级一点的能力，最后都会绕回地址和内存。

## 常见误区

- 还没初始化就使用指针
- 不清楚自己操作的是“地址”还是“地址里的值”
- 以为指针只是为了“考试题”

## 参考文献

- [cppreference Pointers](https://www.cppreference.com/w/c/language/pointer.html)
- [GNU C Manual - Pointers](https://www.gnu.org/software/c-intro-and-ref/manual/c-intro-and-ref.html)

## 推荐论文 / 文章

- [An Axiomatic Basis for Computer Programming](https://research.cs.queensu.ca/home/cordy/cisc860/Biblio/drb/GS/hoare69.pdf)
  它会让你更认真地看待“程序状态”和“程序正确性”。
