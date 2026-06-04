# 双指针：从相向走到快慢指针

## 你会学到

- 会区分左右夹逼和快慢指针
- 知道排序后双指针的优势
- 能识别回文、去重、环检测的双指针味道

## 先修知识

- 数组
- 复杂度

## 为什么这节课重要

双指针是把 O(n^2) 暴力解法拉回 O(n) 或 O(n log n) 的常见手段，学会了能立刻感觉题变简单。

## 核心知识

- 左右夹逼常用于有序数组
- 快慢指针常用于链表或原地覆盖
- 先写循环不变式，再决定谁移动

## 示例

```python
def is_palindrome(s):
    left, right = 0, len(s) - 1
    while left < right:
        if s[left] != s[right]:
            return False
        left += 1
        right -= 1
    return True
```

## 继续练什么

- 写一个有效回文判断
- 写一个原地去重后的新长度函数

## 参考资料

- [LeetCode 75](https://leetcode.com/studyplan/leetcode-75/)
- [CP-Algorithms](https://cp-algorithms.com/)

## 推荐论文 / 经典文章

- [Algorithm Design Techniques and Data Structures](https://dl.acm.org/doi/book/10.5555/644132)
