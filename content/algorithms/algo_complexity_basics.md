# 时间复杂度与空间复杂度入门

## 你会学到

- 会判断常见循环的复杂度
- 知道哈希和排序常见复杂度
- 能比较两个方案的大致成本

## 先修知识

- 循环
- 函数

## 为什么这节课重要

复杂度不是面试八股，它直接决定你能不能在题海里快速筛掉明显不合适的方案。

## 核心知识

- 单层遍历常见 O(n)，双层嵌套常见 O(n^2)
- 哈希换时间，排序常见 O(n log n)
- 空间复杂度要看额外开销，不是把输入也算进去

## 示例

```python
def has_duplicate(nums):
    seen = set()
    for value in nums:
        if value in seen:
            return True
        seen.add(value)
    return False
```

## 继续练什么

- 比较排序解法和哈希解法的复杂度
- 给双指针模板估一遍时间和空间复杂度

## 参考资料

- [CP-Algorithms](https://cp-algorithms.com/)
- [Big-O Cheat Sheet](https://www.bigocheatsheet.com/)

## 推荐论文 / 经典文章

- [An Axiomatic Basis for Computer Programming](https://bitfragment.net/notes/proglang-src-hoare-axiomatic-1969/)
