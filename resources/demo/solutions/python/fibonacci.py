# 斐波那契数列 - Python 题解

## 题目
求斐波那契数列第 n 项。F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)。

## 解法一：递归（有重复计算，仅供理解）

```python
n = int(input())

def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(n))
```

时间复杂度: O(2^n)，不推荐用于大 n

## 解法二：动态规划（推荐）

```python
n = int(input())

if n <= 1:
    print(n)
else:
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    print(b)
```

时间复杂度: O(n)，空间复杂度: O(1)

## 解法三：带备忘录的递归

```python
import sys
sys.setrecursionlimit(100000)

n = int(input())
memo = {}

def fib(n):
    if n in memo:
        return memo[n]
    if n <= 1:
        return n
    memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]

print(fib(n))
```

## 核心思路
- 递归展示问题分解，但有大量重复计算
- 动态规划用两个变量滚动计算，空间最优
- 备忘录递归是自顶向下的动态规划
