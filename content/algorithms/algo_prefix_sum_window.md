# 前缀和与滑动窗口

## 你会学到

- 知道什么时候用前缀和处理静态区间
- 知道什么时候用窗口维护动态区间
- 能识别固定窗口和可变窗口

## 先修知识

- 数组与哈希
- 复杂度基础

## 为什么这节课重要

很多题表面不同，本质都在问你：区间信息怎么快速拿到，窗口状态怎么低成本维护。

## 核心知识

- 前缀和适合快速求连续区间和
- 固定窗口适合固定长度子数组
- 可变窗口常用于“满足条件的最短/最长子串”

## 示例

```python
def max_sum_k(nums, k):
    window = sum(nums[:k])
    best = window
    for i in range(k, len(nums)):
        window += nums[i] - nums[i-k]
        best = max(best, window)
    return best
```

## 继续练什么

- 写固定长度窗口最大和
- 写最短长度满足和至少为 target 的子数组

## 参考资料

- [CP-Algorithms](https://cp-algorithms.com/)
- [LeetCode 75](https://leetcode.com/studyplan/leetcode-75/)

## 推荐论文 / 经典文章

- [Programming Pearls](https://www.cs.virginia.edu/~robins/YouAndYourResearch.html)
