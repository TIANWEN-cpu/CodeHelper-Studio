# Algorithm Patterns for Coding Interviews

Mastering these patterns will help you solve the vast majority of coding interview problems.

## 1. Two Pointers (双指针)

**When to use:** Sorted arrays, linked lists, palindrome checking.

**Variants:**

- **Opposite ends:** Start from both ends, move inward
- **Same direction (fast/slow):** Detect cycles, find middle
- **Sliding window:** Maintain a window that satisfies conditions

```python
# Two Sum II (sorted array)
def two_sum_sorted(numbers, target):
    left, right = 0, len(numbers) - 1
    while left < right:
        total = numbers[left] + numbers[right]
        if total == target:
            return [left + 1, right + 1]
        elif total < target:
            left += 1
        else:
            right -= 1
```

## 2. Sliding Window (滑动窗口)

**When to use:** Subarray/substring problems, finding max/min in a window.

```python
# Longest substring without repeating characters
def length_of_longest_substring(s):
    char_index = {}
    left = max_len = 0
    for right, char in enumerate(s):
        if char in char_index and char_index[char] >= left:
            left = char_index[char] + 1
        char_index[char] = right
        max_len = max(max_len, right - left + 1)
    return max_len
```

## 3. Binary Search (二分搜索)

**When to use:** Sorted arrays, search space reduction, finding boundaries.

```python
# Search in rotated sorted array
def search(nums, target):
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        # Determine which half is sorted
        if nums[left] <= nums[mid]:  # left half is sorted
            if nums[left] <= target < nums[mid]:
                right = mid - 1
            else:
                left = mid + 1
        else:  # right half is sorted
            if nums[mid] < target <= nums[right]:
                left = mid + 1
            else:
                right = mid - 1
    return -1
```

## 4. BFS / DFS (广度优先 / 深度优先)

**When to use:** Trees, graphs, matrices, finding shortest paths (BFS).

```python
# BFS - Level order traversal
from collections import deque

def level_order(root):
    if not root:
        return []
    result, queue = [], deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left: queue.append(node.left)
            if node.right: queue.append(node.right)
        result.append(level)
    return result

# DFS - Recursive
def max_depth(root):
    if not root:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))
```

## 5. Dynamic Programming (动态规划)

**When to use:** Optimization problems, counting problems, overlapping subproblems.

**Steps:**

1. Define state
2. Write recurrence relation
3. Determine base case
4. Decide top-down (memoization) or bottom-up (tabulation)

```python
# 0/1 Knapsack
def knapsack(weights, values, capacity):
    n = len(weights)
    dp = [[0] * (capacity + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for w in range(capacity + 1):
            dp[i][w] = dp[i-1][w]  # don't take item i
            if weights[i-1] <= w:
                dp[i][w] = max(dp[i][w], dp[i-1][w-weights[i-1]] + values[i-1])
    return dp[n][capacity]
```

## 6. Backtracking (回溯)

**When to use:** Generating combinations, permutations, subsets, constraint satisfaction.

```python
# Generate all subsets
def subsets(nums):
    result = []
    def backtrack(start, current):
        result.append(current[:])
        for i in range(start, len(nums)):
            current.append(nums[i])
            backtrack(i + 1, current)
            current.pop()
    backtrack(0, [])
    return result
```

## 7. Greedy (贪心)

**When to use:** Local optimal choice leads to global optimum (activity selection, Huffman coding).

```python
# Jump Game
def can_jump(nums):
    max_reach = 0
    for i, jump in enumerate(nums):
        if i > max_reach:
            return False
        max_reach = max(max_reach, i + jump)
    return True
```

## 8. Topological Sort (拓扑排序)

**When to use:** Dependency resolution, course scheduling, build systems.

```python
# Course Schedule (Kahn's algorithm)
from collections import deque, defaultdict

def can_finish(num_courses, prerequisites):
    graph = defaultdict(list)
    in_degree = [0] * num_courses
    for dest, src in prerequisites:
        graph[src].append(dest)
        in_degree[dest] += 1

    queue = deque(i for i in range(num_courses) if in_degree[i] == 0)
    count = 0
    while queue:
        node = queue.popleft()
        count += 1
        for neighbor in graph[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    return count == num_courses
```

## 9. Union Find (并查集)

**When to use:** Connected components, cycle detection, grouping.

```python
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n

    def find(self, x):
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])  # path compression
        return self.parent[x]

    def union(self, x, y):
        px, py = self.find(x), self.find(y)
        if px == py:
            return False
        if self.rank[px] < self.rank[py]:
            px, py = py, px
        self.parent[py] = px
        if self.rank[px] == self.rank[py]:
            self.rank[px] += 1
        return True
```

## 10. Monotonic Stack (单调栈)

**When to use:** Next greater/smaller element, stock span, histogram problems.

```python
# Daily Temperatures
def daily_temperatures(temps):
    result = [0] * len(temps)
    stack = []  # indices
    for i, temp in enumerate(temps):
        while stack and temps[stack[-1]] < temp:
            prev = stack.pop()
            result[prev] = i - prev
        stack.append(i)
    return result
```

## 11. Merge Intervals (合并区间)

**When to use:** Overlapping intervals, scheduling.

```python
def merge(intervals):
    intervals.sort(key=lambda x: x[0])
    merged = [intervals[0]]
    for start, end in intervals[1:]:
        if start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged
```

## 12. Prefix Sum (前缀和)

**When to use:** Range sum queries, subarray sum problems.

```python
# Subarray sum equals K
def subarray_sum(nums, k):
    count = 0
    prefix_sum = 0
    seen = {0: 1}
    for num in nums:
        prefix_sum += num
        count += seen.get(prefix_sum - k, 0)
        seen[prefix_sum] = seen.get(prefix_sum, 0) + 1
    return count
```

---

## Pattern Recognition Guide

| Problem Clue           | Likely Pattern                        |
| ---------------------- | ------------------------------------- |
| "Sorted array"         | Two pointers or Binary search         |
| "Subarray/substring"   | Sliding window                        |
| "Shortest path"        | BFS (unweighted), Dijkstra (weighted) |
| "All combinations"     | Backtracking                          |
| "Minimum/Maximum"      | DP or Greedy                          |
| "Top K"                | Heap                                  |
| "Dependencies"         | Topological sort                      |
| "Connected components" | Union Find or DFS                     |
| "Next greater element" | Monotonic stack                       |
| "Range query"          | Prefix sum or Segment tree            |
