# 常见内存错误与排查思路

## 你会学到

- 识别越界、悬空指针和重复释放
- 建立排查内存问题的顺序
- 知道何时借助工具

## 为什么这节课重要

很多 C 新手不是不会写代码，而是遇到内存错误时完全没有排查顺序。真正提高效率的，是一套稳定的定位流程。

## 核心知识

- 先缩小复现，再定位哪块内存生命周期不对。
- 释放后置空能降低部分误用概率。
- 编译警告、GDB、Sanitizer 都是排查链的一部分。

## 示例

```c
free(buffer);
buffer = NULL;
```

## 常见误区

- 以为程序“偶尔崩”就不是内存问题
- 释放后继续读写旧地址
- 只盯着崩溃行，不看分配和释放路径

## 继续练什么

- 列出一个 `double free` 的最小错误示例
- 写出你自己的内存排查清单

## 参考资料

- [cppreference: Dynamic memory management](https://en.cppreference.com/w/c/memory.html)

## 推荐论文 / 经典文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  内存 bug 没有魔法修复器，靠的是更稳定的工程习惯。
