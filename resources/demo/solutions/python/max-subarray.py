# 最大子数组和 - Python 题解

## 题目
给定一个整数数组 nums，找出具有最大和的连续子数组，返回其最大和。

## 解法：Kadane 算法（动态规划）

```python
nums = list(map(int, input().split()))

max_sum = nums[0]
current_sum = nums[0]

for i in range(1, len(nums)):
    current_sum = max(nums[i], current_sum + nums[i])
    max_sum = max(max_sum, current_sum)

print(max_sum)
```

时间复杂度: O(n)，空间复杂度: O(1)

## 核心思路
- 维护 `current_sum`：以当前位置结尾的最大子数组和
- 如果 `current_sum + nums[i] < nums[i]`，说明之前的和是负贡献，重新开始
- 每步更新全局最大值 `max_sum`

## 示例推演
输入: `-2 1 -3 4 -1 2 1 -5 4`

| i | nums[i] | current_sum | max_sum |
|---|---------|-------------|---------|
| 0 | -2      | -2          | -2      |
| 1 | 1       | 1           | 1       |
| 2 | -3      | -2          | 1       |
| 3 | 4       | 4           | 4       |
| 4 | -1      | 3           | 4       |
| 5 | 2       | 5           | 5       |
| 6 | 1       | 6           | 6       |
| 7 | -5      | 1           | 6       |
| 8 | 4       | 5           | 6       |

答案: 6（子数组 [4, -1, 2, 1]）
