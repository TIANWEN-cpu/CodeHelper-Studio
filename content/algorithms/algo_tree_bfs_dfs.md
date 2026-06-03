# 树的 DFS / BFS 基础

## 你会学到

- 知道 DFS 和 BFS 在树上的直觉差异
- 会写前序 DFS
- 会写层序 BFS

## 先修知识

- 栈与队列
- 递归基础

## 为什么这节课重要

树题是很多人从数组题跨到“更抽象结构题”的第一道坎。先把 DFS / BFS 两套视角建立起来，后面就顺了。

## 核心知识

- DFS 更像把一条路走到底
- BFS 更像按层推进
- 树题要先想节点定义和递归返回值代表什么

## 示例

```python
def preorder(root):
    if not root:
        return []
    return [root.val] + preorder(root.left) + preorder(root.right)
```

## 继续练什么

- 写二叉树前序遍历
- 写层序遍历返回每层节点值

## 参考资料

- [CP-Algorithms DFS](https://cp-algorithms.com/graph/depth-first-search.html)
- [CP-Algorithms BFS](https://cp-algorithms.com/graph/breadth-first-search.html)

## 推荐论文 / 经典文章

- [Depth-First Search and Linear Graph Algorithms](https://epubs.siam.org/doi/10.1137/0201010)
