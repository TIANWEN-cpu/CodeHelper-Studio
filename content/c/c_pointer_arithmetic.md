# 指针运算与边界意识

## 你会学到

- 知道 p+1 为什么不是加 1 字节
- 会用 begin/end 写遍历
- 知道什么情况下指针比较是安全的

## 先修知识

- 数组与内存布局
- 指针基础

## 为什么这节课重要

一旦你能把指针运算想成“按元素尺寸跳格子”，很多难看的 C 代码都会变清楚。

## 核心知识

- 指针偏移按目标类型大小计算
- 用 begin / end 范围遍历比手写魔法数字更稳
- 跨数组做指针比较是未定义风险

## 示例

```c
int nums[] = {3, 5, 8};
int *p = nums;
printf("%d\n", *(p + 1));
```

## 继续练什么

- 用指针遍历一个整型数组
- 把下标版求和函数改写成 begin/end 版

## 参考资料

- [cppreference pointer arithmetic](https://en.cppreference.com/w/c/language/operator_arithmetic)
- [GNU C Manual Pointers](https://www.gnu.org/software/c-intro-and-ref/manual/html_node/Pointers.html)

## 推荐论文 / 经典文章

- [Programming as an Experience](https://worrydream.com/EarlyHistoryOfSmalltalk/)
