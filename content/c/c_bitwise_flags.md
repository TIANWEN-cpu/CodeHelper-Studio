# 位运算与标志位：把多个状态压进一个整数

## 你会学到

- 理解按位与、按位或、按位异或的基本直觉
- 知道标志位为什么常见于底层和系统编程
- 会读最小的权限位写法

## 为什么这节课重要

位运算看起来吓人，其实很多时候它只是在做“高效表示多个开关状态”。如果你能把“一个整数里放多个布尔状态”想清楚，很多底层代码会突然变得没那么神秘。

## 核心知识

- `|` 用来设置某个标志位
- `&` 用来检查某个标志位
- `~` 常用于清除某个标志位

## 示例

```c
enum {
    READ = 1 << 0,
    WRITE = 1 << 1,
    EXECUTE = 1 << 2
};

int perms = READ | WRITE;

if (perms & READ) {
    printf("can read\n");
}
```

## 直觉理解

- `READ` 是第 0 位打开
- `WRITE` 是第 1 位打开
- `READ | WRITE` 表示两个开关都开
- `perms & READ` 不为 0，说明读取权限存在

## 常见误区

- 把逻辑运算 `&&`、`||` 和位运算 `&`、`|` 混掉
- 标志位值乱写成 1、2、3，导致位冲突
- 没有先画二进制示意图就硬算

## 小练习

- 定义三个标志位：读、写、删
- 写出“同时开启读和删”的表达式
- 写出“检查是否有写权限”的判断

## 参考资料

- [cppreference: Arithmetic and bitwise operators](https://en.cppreference.com/w/c/language/operator_arithmetic)

## 推荐论文 / 经典文章

- [The C Programming Language, 2nd Edition (book overview)](https://en.wikipedia.org/wiki/The_C_Programming_Language)
  它不是论文，但位运算这类内容的讲解方式非常经典，值得慢慢消化。
