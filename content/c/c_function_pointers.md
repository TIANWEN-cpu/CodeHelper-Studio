# 函数指针入门：把“传函数”这件事看清楚

## 学习目标

- 知道函数名也能参与“被传递”
- 会读懂最小函数指针声明
- 对回调函数建立第一层直觉

## 先修知识

- 普通函数声明
- 指针基础

## 为什么这节课重要

函数指针第一次看通常很吓人，但它真正表达的事情并不玄：

- 不只是传数据
- 也可以把“处理方式”传进去

这就是回调、策略切换、排序比较函数这类设计的基础。

## 最小例子

```c
int add_one(int x) {
    return x + 1;
}

int (*fn)(int) = add_one;
```

这里的 `fn` 表示：

- 它是一个指针
- 指向参数为 `int`
- 返回值为 `int` 的函数

调用时：

```c
int result = fn(3);
```

## 和普通指针的类比

- 普通变量指针：指向数据
- 函数指针：指向代码入口

你不用一开始就背复杂声明，先把“它是一个可被调用的入口引用”理解稳。

## 常见使用场景

- 回调函数
- 自定义比较函数
- 菜单命令分发表
- 不同策略的切换

## 常见错误

- 把函数调用结果和函数本身混淆
- 声明太复杂时完全不拆解
- 过早上复杂嵌套声明，把自己绕进去

## 小练习

- 定义一个 `square` 函数，并用函数指针调用它
- 写一个 `apply(int x, int (*fn)(int))`，让它把 `fn` 应用到 `x`

## 课后总结

- 函数指针本质上是在传“处理方式”
- 它不是玄学，是更底层的回调表达
- 先读懂最小形态，再看复杂代码

## 参考文献

- cppreference pointers to functions: https://en.cppreference.com/w/c/language/pointer

## 推荐阅读

- GNU C Manual, Function Pointers: https://www.gnu.org/software/c-intro-and-ref/manual/html_node/Function-Pointers.html
