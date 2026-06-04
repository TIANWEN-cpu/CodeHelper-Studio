# 防御式 C 编码习惯

## 你会学到

- 会主动检查空指针和返回值
- 知道什么情况下该提前 return
- 能把错误路径写清楚而不是堆成一团

## 先修知识

- 动态内存
- 文件与字符串基础

## 为什么这节课重要

C 没有太多保护网，所以好习惯不是锦上添花，而是你和线上 bug 之间最现实的缓冲层。

## 核心知识

- 先检查输入，再执行业务逻辑
- 一条错误路径只做一件事
- 写 C 时要比写脚本语言更主动地保护边界

## 示例

```c
FILE *fp = fopen(path, "r");
if (!fp) {
    return -1;
}
```

## 继续练什么

- 把一个简单文件读取函数加上错误路径
- 给命令行参数检查写出早返回版本

## 参考资料

- [CERT C Coding Standard](https://wiki.sei.cmu.edu/confluence/display/c/SEI+CERT+C+Coding+Standard)
- [GNU C Manual Errors](https://www.gnu.org/software/c-intro-and-ref/manual/html_node/Error-Reporting.html)

## 推荐论文 / 经典文章

- [No Silver Bullet](https://worrydream.com/refs/Brooks_1986_-_No_Silver_Bullet.pdf)
