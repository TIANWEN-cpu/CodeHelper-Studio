# 二进制文件与记录索引

## 你会学到

- 知道 fread / fwrite 的基本模式
- 会设计简单记录头
- 理解文本文件和二进制文件的取舍

## 先修知识

- 文件读写
- 结构体

## 为什么这节课重要

只会读写文本文件，C 还像“练习语言”；会做记录文件和索引，你才开始碰到更真实的工具场景。

## 核心知识

- 先设计稳定的记录结构
- 读写前后都要检查返回值
- 二进制格式更紧凑，但兼容性要自己负责

## 示例

```c
typedef struct {
    int id;
    char name[32];
} UserRecord;

fwrite(&record, sizeof(UserRecord), 1, fp);
```

## 继续练什么

- 定义一条最小记录并写入文件
- 给二进制记录文件加一个文件头版本号

## 参考资料

- [cppreference fread](https://en.cppreference.com/w/c/io/fread)
- [cppreference fwrite](https://en.cppreference.com/w/c/io/fwrite)

## 推荐论文 / 经典文章

- [The UNIX Time-Sharing System](https://people.eecs.berkeley.edu/~brewer/cs262/unix.pdf)
