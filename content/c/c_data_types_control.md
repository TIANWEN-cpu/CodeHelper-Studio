# 变量、类型、分支与循环

## 学习目标

- 会声明 C 中的常见基本类型
- 会写 `if`、`for`、`while`
- 理解 C 里条件判断和真假值的基本规则

## 从显式声明开始

和 Python 不同，C 需要你先声明变量类型：

```c
int age = 18;
double ratio = 0.75;
char grade = 'A';
```

## 条件和循环

```c
if (age >= 18) {
    printf("adult\n");
}

for (int i = 0; i < 5; i++) {
    printf("%d\n", i);
}
```

## 初学时最容易踩的坑

- 把 `=` 和 `==` 混掉
- 忘记分号
- 以为大括号只是“排版好看”

## 参考文献

- [cppreference Statements and Expressions](https://www.cppreference.com/w/c/language/statements.html)
- [GNU C Manual - Conditions and Loops](https://www.gnu.org/software/c-intro-and-ref/manual/c-intro-and-ref.html)

## 推荐论文 / 文章

- [Go To Statement Considered Harmful](https://www.cs.cornell.edu/courses/JavaAndDS/files/DijkstraHarmful68.pdf)
  读这篇文章会帮助你更重视结构化控制流。
