# 栈、队列与单调结构入门

## 你会学到

- 知道后进先出和先进先出的典型应用
- 会用栈做括号匹配
- 对单调栈建立第一层直觉

## 先修知识

- 列表
- 循环

## 为什么这节课重要

很多题一开始看不出来要用栈或队列，但只要抓住“最近还没处理完的东西”这个感觉，很多题会突然通。

## 核心知识

- 栈适合处理嵌套、配对、回退
- 队列适合层序和按到达顺序处理
- 单调栈常用于“下一个更大元素”一类题

## 示例

```python
def valid_parentheses(s):
    stack = []
    pairs = {): (, ]: [, }: {}
    for ch in s:
        if ch in pairs.values():
            stack.append(ch)
        elif not stack or stack.pop() != pairs[ch]:
            return False
    return not stack
```

## 继续练什么

- 写有效括号
- 用队列做二叉树层序遍历

## 参考资料

- [collections.deque](https://docs.python.org/3/library/collections.html#collections.deque)
- [CP-Algorithms data structures](https://cp-algorithms.com/data_structures/)

## 推荐论文 / 经典文章

- [Depth-First Search and Linear Graph Algorithms](https://epubs.siam.org/doi/10.1137/0201010)
