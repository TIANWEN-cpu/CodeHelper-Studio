# 命令行参数与 main 函数入口

## 你会学到

- 理解 `argc` 和 `argv` 的含义
- 知道程序如何接收外部参数
- 会为命令行工具设计最小输入格式

## 为什么这节课重要

很多 C 小工具一旦离开“写死数据”的阶段，就需要从命令行接参数。学会 `argc/argv`，你做的程序就开始像真正能被别人调用的工具，而不只是课堂脚本。

## 核心知识

- `argc` 表示参数个数
- `argv` 是参数字符串数组
- `argv[0]` 通常是程序名

## 示例

```c
#include <stdio.h>

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("usage: app <name>\\n");
        return 1;
    }
    printf("hello, %s\\n", argv[1]);
    return 0;
}
```

## 设计参数时要想清楚

- 必填参数有哪些
- 缺参数时怎么提示
- 参数顺序是否固定
- 输入非法时怎么尽快退出

## 常见误区

- 直接访问 `argv[1]`，却没先检查 `argc`
- 没有给出明确的 usage 提示
- 参数越做越多，却没有重新设计输入格式

## 小练习

- 写一个接收用户名的 hello 工具
- 再增加一个数字参数，用于打印次数
- 缺参数时输出帮助信息

## 参考资料

- [cppreference: main function](https://en.cppreference.com/w/c/language/main_function)

## 推荐论文 / 经典文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  很多命令行工具做着做着会失控，先把输入边界设计清楚，比急着加功能更重要。
