# 动态规划的第一层直觉

## 你会学到

- 知道什么叫重叠子问题
- 会写最小一维 DP
- 知道先从递归改记忆化再改表格法

## 先修知识

- 递归
- 复杂度

## 为什么这节课重要

DP 往往不是难在代码，而是难在你不知道“状态到底是什么”。这节课先把那层抽象练出来。

## 核心知识

- 先定义 dp[i] 代表什么
- 转移式描述“当前答案怎么由更小问题得到”
- 先保证状态定义清楚，再优化空间

## 示例

```python
def climb_stairs(n):
    if n <= 2:
        return n
    a, b = 1, 2
    for _ in range(3, n + 1):
        a, b = b, a + b
    return b
```

## 继续练什么

- 写爬楼梯
- 写打家劫舍的一维 DP 版

## 参考资料

- [CP-Algorithms DP intro](https://cp-algorithms.com/dynamic_programming/intro-to-dp.html)
- [LeetCode DP](https://leetcode.com/tag/dynamic-programming/)

## 推荐论文 / 经典文章

- [Bellman on the theory of dynamic programming](https://www.rand.org/content/dam/rand/pubs/papers/2008/P550.pdf)
