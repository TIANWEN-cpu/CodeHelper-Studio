# 链表节点与指针串联

## 你会学到

- 会定义最小链表节点
- 能看懂 `next` 指针如何把节点串起来
- 理解链表为什么适合局部插入和删除

## 为什么这节课重要

链表是把指针、结构体和动态内存真正放到一个场景里练的最好材料。你一旦能看懂链表，指针就不再像魔法。

## 核心知识

- 节点通常由数据字段和 `next` 指针组成。
- 遍历本质上是在不断跟随 `next`。
- 链表的优势在于局部修改方便，但随机访问慢。

## 示例

```c
struct Node {
    int value;
    struct Node *next;
};
```

## 常见误区

- 把 `struct Node *next` 写成普通对象
- 遍历时忘记更新当前指针
- 头节点为空时没有单独处理

## 继续练什么

- 定义一个两节点链表
- 手动画出插入新节点前后的指针变化

## 参考资料

- [GNU C Manual: Structures](https://www.gnu.org/software/c-intro-and-ref/manual/html_node/Structures.html)

## 推荐论文 / 经典文章

- [Go To Statement Considered Harmful](https://homepages.cwi.nl/~storm/teaching/reader/Dijkstra68.pdf)
  数据结构学习最终还是回到控制流和组织方式。
