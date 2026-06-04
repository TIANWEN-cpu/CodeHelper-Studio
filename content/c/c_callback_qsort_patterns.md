# 回调与 qsort 模式

## 你会学到

- 理解 qsort 比较函数签名
- 会写最小回调函数
- 知道为什么比较函数要稳定返回负零正

## 先修知识

- 函数指针
- 数组

## 为什么这节课重要

很多人学完函数指针还是觉得虚，因为没把它放进真实 API 里。qsort 就是最好的第一站。

## 核心知识

- 回调的核心是把“处理策略”当参数传入
- qsort 比较函数要能比较两个元素
- 先把签名写对，再谈排序逻辑

## 示例

```c
int cmp_int(const void *a, const void *b) {
    int lhs = *(const int *)a;
    int rhs = *(const int *)b;
    return (lhs > rhs) - (lhs < rhs);
}
```

## 继续练什么

- 写一个 int 数组升序排序的比较函数
- 尝试给结构体数组按 score 排序

## 参考资料

- [cppreference qsort](https://en.cppreference.com/w/c/algorithm/qsort)
- [GNU C Manual Function Pointers](https://www.gnu.org/software/c-intro-and-ref/manual/html_node/Function-Pointers.html)

## 推荐论文 / 经典文章

- [Engineering a Sort Function](https://fliphtml5.com/capw/ttvz/Engineering_a_Sort_Function_-_Florida_Institute_of_Technology/)
