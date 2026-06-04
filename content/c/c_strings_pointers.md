# C 字符串与字符数组

## 你会学到

- 理解字符串在 C 里就是以 `\0` 结尾的字符序列
- 知道字符数组和指针的关系
- 学会避免最常见的越界错误

## 为什么这节课重要

一旦你理解 C 字符串不是“高级对象”，很多神秘 bug 就会立刻变得具体。C 里字符串处理最重要的不是 API 数量，而是边界意识。

## 核心知识

- 字符串字面量会自动带结尾符。
- 字符数组有长度，指针只有地址。
- 处理字符串时必须给结尾符留位置。

## 示例

```c
#include <stdio.h>

int main(void) {
    char name[] = "Tom";
    printf("%s\n", name);
    return 0;
}
```

## 常见误区

- 把数组长度和字符串长度混为一谈
- 忘记给 `\0` 预留空间
- 直接修改字符串字面量

## 继续练什么

- 手写一个统计字符串长度的函数
- 比较 `char name[] = "Tom"` 和 `char *name = "Tom"` 的区别

## 参考资料

- [cppreference: C string handling](https://en.cppreference.com/w/c/string/byte)

## 推荐论文 / 经典文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  哪怕是字符串处理，边界和职责拆分依旧决定代码质量。
