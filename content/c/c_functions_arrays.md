# 函数、数组与程序拆分

## 学习目标

- 会声明和调用函数
- 理解数组和下标访问
- 知道函数原型为什么重要

## 为什么函数在 C 里更重要

如果所有逻辑都塞进 `main`，C 程序会很快变得难维护。  
所以函数不仅是复用工具，也是组织结构的骨架。

```c
int add(int a, int b) {
    return a + b;
}
```

## 数组的直觉理解

```c
int scores[3] = {90, 80, 70};
printf("%d\n", scores[0]);
```

数组在 C 里非常基础，但也因此特别需要你注意边界。

## 常见误区

- 越界访问数组
- 没写函数声明就直接调用
- 把数组和单个变量混着理解

## 参考文献

- [cppreference Arrays](https://www.cppreference.com/w/c/language/array.html)
- [GNU C Manual - Functions](https://www.gnu.org/software/c-intro-and-ref/manual/c-intro-and-ref.html)

## 推荐论文 / 文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  它很适合帮助你理解“为什么要拆函数和模块”。
