# 算法模式参考

## 1. 双指针

**适用场景**: 有序数组查找、链表操作、字符串处理

**模板（对撞指针）**:

```python
def two_pointer(nums, target):
    left, right = 0, len(nums) - 1
    while left < right:
        s = nums[left] + nums[right]
        if s == target:
            return [left, right]
        elif s < target:
            left += 1
        else:
            right -= 1
    return []
```

**典型题目**: 两数之和(有序)、三数之和、接雨水、回文判断

---

## 2. 滑动窗口

**适用场景**: 子数组/子字符串问题（最大/最小/计数）

**模板**:

```python
def sliding_window(s):
    window = {}       # 窗口内元素计数
    left = 0
    result = 0

    for right in range(len(s)):
        # 扩大窗口
        c = s[right]
        window[c] = window.get(c, 0) + 1

        # 收缩条件
        while need_shrink(window):
            d = s[left]
            window[d] -= 1
            left += 1

        # 更新结果
        result = max(result, right - left + 1)

    return result
```

**典型题目**: 无重复字符最长子串、最小覆盖子串、长度最小子数组

---

## 3. 二分查找

**适用场景**: 有序数组查找、搜索答案空间

**模板**:

```python
def binary_search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1

# 搜索左边界
def search_left(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = left + (right - left) // 2
        if nums[mid] >= target:
            right = mid - 1
        else:
            left = mid + 1
    return left
```

**典型题目**: 二分查找、搜索旋转数组、寻找峰值

---

## 4. 动态规划（DP）

**适用场景**: 最优解问题、计数问题、区间问题

**基本步骤**:

1. 定义状态（dp[i] 的含义）
2. 写出状态转移方程
3. 确定初始条件
4. 确定遍历顺序

**常见模式**:

### 线性 DP

```python
# 爬楼梯: dp[i] = dp[i-1] + dp[i-2]
def climb_stairs(n):
    if n <= 2: return n
    dp = [0] * (n + 1)
    dp[1], dp[2] = 1, 2
    for i in range(3, n + 1):
        dp[i] = dp[i-1] + dp[i-2]
    return dp[n]
```

### 0-1 背包

```python
# dp[i][j] = 前 i 个物品，容量 j 的最大价值
def knapsack(weights, values, capacity):
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(capacity + 1):
            dp[i][j] = dp[i-1][j]  # 不选
            if j >= weights[i-1]:
                dp[i][j] = max(dp[i][j],
                    dp[i-1][j-weights[i-1]] + values[i-1])  # 选
    return dp[n][capacity]
```

### 完全背包

```python
# 零钱兑换
def coin_change(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for i in range(1, amount + 1):
        for coin in coins:
            if coin <= i:
                dp[i] = min(dp[i], dp[i - coin] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1
```

**典型题目**: 爬楼梯、打家劫舍、零钱兑换、最长递增子序列、最大子数组和

---

## 5. BFS（广度优先搜索）

**适用场景**: 最短路径、层序遍历、连通分量

**模板**:

```python
from collections import deque

def bfs(graph, start):
    visited = {start}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        for neighbor in graph[node]:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
```

**典型题目**: 二叉树层序遍历、最短路径、腐烂的橘子

---

## 6. DFS（深度优先搜索）

**适用场景**: 全排列、组合、路径搜索、连通分量

**模板**:

```python
def dfs(path, choices):
    if 满足结束条件:
        result.append(path[:])
        return
    for choice in choices:
        if 合法(choice):
            path.append(choice)
            dfs(path, 剩余choices)
            path.pop()  # 回溯
```

**典型题目**: 全排列、组合总和、岛屿数量

---

## 7. 贪心算法

**适用场景**: 局部最优可推导全局最优

**思路**: 每一步都选择当前看起来最优的方案

```python
# 区间调度: 选择最多不重叠区间
def max_intervals(intervals):
    intervals.sort(key=lambda x: x[1])  # 按结束时间排序
    count = 0
    end = float('-inf')
    for start, finish in intervals:
        if start >= end:
            count += 1
            end = finish
    return count
```

**典型题目**: 买卖股票最佳时机、跳跃游戏、分发糖果

---

## 8. 栈与队列

**栈的典型应用**:

```python
# 括号匹配
def is_valid(s):
    stack = []
    mapping = {')': '(', ']': '[', '}': '{'}
    for c in s:
        if c in mapping:
            if not stack or stack[-1] != mapping[c]:
                return False
            stack.pop()
        else:
            stack.append(c)
    return len(stack) == 0
```

**单调栈**: 维护递增/递减序列，用于解决"下一个更大元素"类问题

```python
def next_greater(nums):
    n = len(nums)
    result = [-1] * n
    stack = []  # 存下标
    for i in range(n):
        while stack and nums[i] > nums[stack[-1]]:
            result[stack.pop()] = nums[i]
        stack.append(i)
    return result
```

---

## 9. 哈希表

**核心思想**: 用空间换时间，将查找从 O(n) 降到 O(1)

```python
# 计数
from collections import Counter
count = Counter(nums)

# 分组
from collections import defaultdict
groups = defaultdict(list)
for item in items:
    groups[key(item)].append(item)
```

**典型题目**: 两数之和、字母异位词、单词计数

---

## 10. 链表技巧

```python
# 快慢指针找中点
slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
# slow 就是中点

# 反转链表
def reverse(head):
    prev = None
    curr = head
    while curr:
        next_node = curr.next
        curr.next = prev
        prev = curr
        curr = next_node
    return prev
```

---

## 算法复杂度参考

| 复杂度     | 名称     | 可处理规模 | 典型算法           |
| ---------- | -------- | ---------- | ------------------ |
| O(1)       | 常数     | 任意       | 哈希查找           |
| O(log n)   | 对数     | 10^18      | 二分查找           |
| O(n)       | 线性     | 10^7       | 遍历、滑动窗口     |
| O(n log n) | 线性对数 | 10^6       | 排序、分治         |
| O(n^2)     | 平方     | 10^4       | 暴力枚举、冒泡排序 |
| O(n^3)     | 立方     | 500        | Floyd、三层循环    |
| O(2^n)     | 指数     | 20         | 子集枚举           |
| O(n!)      | 阶乘     | 10         | 全排列             |
