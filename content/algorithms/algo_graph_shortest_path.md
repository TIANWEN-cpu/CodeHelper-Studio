# 图与最短路第一眼

## 你会学到

- 会把节点和边从题目里抽出来
- 知道无权图最短路为什么常用 BFS
- 知道带权图最短路和 Dijkstra 的基本前提

## 先修知识

- 树的 BFS/DFS
- 队列

## 为什么这节课重要

图题最可怕的不是代码长，而是看不出“这其实是个图”。把这层视角建立好，后面很多题会突然有路走。

## 核心知识

- 先明确节点是谁、边是谁
- 无权图最短路常用 BFS
- 非负权图常用 Dijkstra，先不要急着背堆优化

## 示例

```python
from collections import deque

def shortest_path(adj, start):
    dist = {start: 0}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        for nxt in adj[node]:
            if nxt not in dist:
                dist[nxt] = dist[node] + 1
                queue.append(nxt)
    return dist
```

## 继续练什么

- 写网格最短步数 BFS
- 把课程依赖关系翻成图结构

## 参考资料

- [CP-Algorithms Dijkstra](https://cp-algorithms.com/graph/dijkstra.html)
- [CP-Algorithms BFS](https://cp-algorithms.com/graph/breadth-first-search.html)

## 推荐论文 / 经典文章

- [A note on two problems in connexion with graphs](https://eudml.org/doc/131436)
