# malloc、free 与动态内存基础

## 你会学到

- 理解堆内存和栈内存的区别
- 会写最小的 `malloc` / `free` 工作流
- 知道为什么“释放后置空”是个好习惯

## 为什么这节课重要

动态内存是 C 最有力量也最容易出事的地方。你真正要学的不是两个函数名，而是一整套“申请、使用、释放、验证”的习惯。

## 核心知识

- `malloc` 返回一块未初始化内存。
- `free` 只负责释放，不会自动把指针改成 `NULL`。
- 谁申请内存，通常就要想清楚由谁释放。

## 示例

```c
#include <stdlib.h>

int main(void) {
    int *nums = malloc(sizeof(int) * 5);
    if (nums == NULL) {
        return 1;
    }

    nums[0] = 10;
    free(nums);
    nums = NULL;
    return 0;
}
```

## 常见误区

- 申请后不检查 `NULL`
- 释放之后继续使用旧指针
- 在循环里反复申请，却忘了对应释放

## 继续练什么

- 申请 10 个 `int` 的数组并填入 0 到 9
- 写出“释放后置空”的最小模板

## 参考资料

- [cppreference: Dynamic memory management](https://en.cppreference.com/w/c/memory.html)
- [GNU C Manual: Dynamic Memory Allocation](https://www.gnu.org/software/c-intro-and-ref/manual/html_node/Dynamic-Memory-Allocation.html)

## 推荐论文 / 经典文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  管理复杂性没有捷径，内存问题尤其如此。
