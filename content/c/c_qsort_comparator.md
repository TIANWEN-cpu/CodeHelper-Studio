# qsort 与比较函数：让排序真正可复用

## 学习目标

- 知道 `qsort` 为什么需要比较函数
- 会读懂最小比较器签名
- 理解“把规则传进去”这件事

## 先修知识

- 数组
- 函数指针更有帮助

## 为什么这节课重要

排序不是只有“会不会写冒泡”。  
很多工程代码会直接使用标准库排序，再把比较规则传进去。

## 最小例子

```c
int compare_ints(const void *a, const void *b) {
    int x = *(const int *)a;
    int y = *(const int *)b;
    return x - y;
}
```

然后：

```c
qsort(arr, n, sizeof(int), compare_ints);
```

## 这里最重要的直觉

- `qsort` 不关心你排序什么
- 比较函数负责告诉它“谁更大、谁更小”

## 常见错误

- 比较器返回值含义不清
- 指针类型转换看不懂
- 只会调用，不理解为什么需要回调

## 小练习

- 给整数数组写一个最小比较器
- 说出比较器返回负数、0、正数分别表示什么

## 课后总结

- `qsort` 是“通用排序 + 传入规则”
- 比较器是回调思想的经典练习

## 参考文献

- cppreference qsort: https://en.cppreference.com/w/c/algorithm/qsort

## 推荐阅读

- Standard library sorting examples from cppreference
