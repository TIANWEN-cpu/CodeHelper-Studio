# 动态数组求和 - C 题解

## 解法

```c
#include <stdio.h>
#include <stdlib.h>

int main() {
    int n;
    scanf("%d", &n);

    int *arr = (int *)malloc(n * sizeof(int));
    if (arr == NULL) {
        return 1;  // 内存分配失败
    }

    long long sum = 0;
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
        sum += arr[i];
    }

    printf("%lld\n", sum);

    free(arr);  // 释放动态分配的内存
    arr = NULL; // 防止悬空指针

    return 0;
}
```

## 核心知识点
- `malloc()` 动态分配内存，返回 `void*` 需要强制类型转换
- `free()` 释放内存，防止内存泄漏
- 使用后将指针设为 `NULL`，避免悬空指针
- 检查 `malloc` 返回值是否为 `NULL`
