# 数组与哈希表的第一批模式

## 你会学到

- 会识别“边扫边记”的哈希模式
- 知道计数表和去重表的区别
- 能把暴力双循环优化成单次遍历

## 先修知识

- 复杂度基础
- 字典 / set

## 为什么这节课重要

很多初级算法题并不复杂，关键是敢不敢想到“用空间换时间”。数组 + 哈希是第一批最值钱的模式。

## 核心知识

- Two Sum 类问题常用 value -> index 哈希
- 计数题要先想 key 是谁、value 是什么
- 先把题目翻成查找 / 去重 / 计数这几类需求

## 示例

```python
def two_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        need = target - value
        if need in seen:
            return [seen[need], index]
        seen[value] = index
    return []
```

## 继续练什么

- 写一个统计每个单词出现次数的函数
- 把 contains duplicate 从排序解法改成哈希解法

## 参考资料

- [LeetCode Programming Skills](https://leetcode.com/studyplan/programming-skills/)
- [CP-Algorithms data structures](https://cp-algorithms.com/data_structures/)

## 推荐论文 / 经典文章

- [Dynamic Hash Tables](https://dl.acm.org/doi/10.1145/358728.358745)
