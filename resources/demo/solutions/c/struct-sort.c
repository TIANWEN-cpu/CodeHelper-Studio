# 结构体排序 - C 题解

## 解法

```c
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

typedef struct {
    char name[100];
    int score;
    int index;  // 记录原始顺序，用于稳定排序
} Student;

int compare(const void *a, const void *b) {
    Student *sa = (Student *)a;
    Student *sb = (Student *)b;
    if (sb->score != sa->score) {
        return sb->score - sa->score;  // 分数降序
    }
    return sa->index - sb->index;  // 分数相同按输入顺序
}

int main() {
    int n;
    scanf("%d", &n);

    Student students[100];
    for (int i = 0; i < n; i++) {
        scanf("%s %d", students[i].name, &students[i].score);
        students[i].index = i;
    }

    qsort(students, n, sizeof(Student), compare);

    for (int i = 0; i < n; i++) {
        printf("%s %d\n", students[i].name, students[i].score);
    }

    return 0;
}
```

## 核心知识点
- `typedef struct` 定义结构体类型
- `qsort()` C 标准库排序函数，需要自定义比较函数
- 比较函数返回负数/零/正数表示小于/等于/大于
- 记录原始下标实现稳定排序
