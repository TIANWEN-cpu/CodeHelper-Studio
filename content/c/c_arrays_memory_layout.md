# 数组与内存布局

## 你会学到

- 理解数组为什么是连续内存
- 知道数组名和指针的联系与差别
- 会根据内存布局推断下标访问

## 先修知识

- 变量、类型与函数
- 指针入门

## 为什么这节课重要

很多 C 代码问题，根上都不是语法，而是你脑子里没有“内存布局”的画面。

## 核心知识

- 数组元素在内存中连续排列
- 下标访问本质上是基地址加偏移
- 数组名在很多场景会退化为指针，但不是处处等价

## 示例

```c
int nums[4] = {10, 20, 30, 40};
printf("%d\n", nums[2]);
```

## 继续练什么

- 手算 int 数组第 3 个元素的偏移量
- 比较 sizeof(nums) 和 sizeof(ptr) 的结果

## 参考资料

- [cppreference arrays](https://en.cppreference.com/w/c/language/array)
- [GNU C Manual Arrays](https://www.gnu.org/software/c-intro-and-ref/manual/html_node/Arrays.html)

## 推荐论文 / 经典文章

- [Go To Statement Considered Harmful](https://www.cs.utexas.edu/users/EWD/transcriptions/EWD02xx/EWD215.html)
