# 二分查找与贪心直觉

## 你会学到

- 知道什么时候可以二分答案
- 知道贪心为什么依赖局部决策结构
- 能把一类题归到“找边界”或“做选择”

## 先修知识

- 复杂度
- 数组

## 为什么这节课重要

很多题你差的不是代码，而是那一步“能不能看出这里有单调性 / 这里能不能贪”。这个专题就是补这层感觉。

## 核心知识

- 二分的关键不是 mid，而是区间不变式
- 贪心通常要先证明局部选择不会破坏全局最优
- 先找模式，再写模板

## 示例

```python
def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
```

## 继续练什么

- 写标准二分
- 找最小可行值的边界二分题

## 参考资料

- [CP-Algorithms binary search](https://cp-algorithms.com/num_methods/binary_search.html)
- [CP-Algorithms](https://cp-algorithms.com/)

## 推荐论文 / 经典文章

- [Extra, Extra - Nearly All Binary Searches and Mergesorts are Broken](https://ai.googleblog.com/2006/06/extra-extra-read-all-about-it-nearly.html)
