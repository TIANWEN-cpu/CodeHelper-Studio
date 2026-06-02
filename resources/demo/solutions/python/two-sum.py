# 两数之和 - Python 题解

## 题目
给定一个整数数组 nums 和一个目标值 target，找出数组中和为目标值的两个整数，返回它们的下标。

## 解法一：暴力枚举（简单但慢）

```python
n = int(input())
nums = list(map(int, input().split()))
target = int(input())

for i in range(n):
    for j in range(i + 1, n):
        if nums[i] + nums[j] == target:
            print(i, j)
            break
    else:
        continue
    break
```

时间复杂度: O(n^2)，空间复杂度: O(1)

## 解法二：哈希表（推荐）

```python
n = int(input())
nums = list(map(int, input().split()))
target = int(input())

hash_map = {}
for i, num in enumerate(nums):
    complement = target - num
    if complement in hash_map:
        print(hash_map[complement], i)
        break
    hash_map[num] = i
```

时间复杂度: O(n)，空间复杂度: O(n)

## 核心思路
- 暴力法：双重循环遍历所有两数组合
- 哈希法：用字典存储已遍历的数值和下标，查找补数只需 O(1)
