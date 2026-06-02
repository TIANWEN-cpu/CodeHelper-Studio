# 指针交换两个数 - C 题解

## 解法

```c
#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    swap(&a, &b);
    printf("%d %d\n", a, b);
    return 0;
}
```

## 核心知识点
- `int *a` 声明指针参数，接收地址
- `*a` 解引用，读取指针指向的值
- `&a` 取地址运算符，获取变量的内存地址
- 通过指针可以在函数内修改调用者的变量
