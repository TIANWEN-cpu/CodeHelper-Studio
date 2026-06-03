# 报错阅读与调试工作流

## 学习目标

- 学会阅读 traceback 的关键部分
- 建立复现、定位、修复、验证的调试流程
- 知道什么叫“修掉症状”和“修掉原因”

## 一条很实用的调试路线

当程序报错时，不要急着四处乱改。先按这四步走：

1. 复现问题
2. 读报错信息
3. 缩小范围
4. 修复后重新验证

## 看 traceback 时先看哪里

- 错误类型：比如 `TypeError`、`KeyError`
- 出错文件和行号
- 你自己写的那一层调用

很多人一看到长长的 traceback 就慌，其实最该先看的常常只有最后几行。

## 一个例子

```python
data = {"name": "Alice"}
print(data["age"])
```

这里的核心不是“记住 KeyError”，而是先想：

- 我是不是取了一个不存在的键？
- 数据结构是不是和我想的不一样？

## 常见误区

- 看到报错就直接删代码
- 不复现，只靠猜
- 修完以后不重新跑一遍相关流程

## 参考文献

- [Python Tutorial - Errors and Exceptions](https://docs.python.org/3/tutorial/errors.html)
- [Python Built-in Exceptions](https://docs.python.org/3/library/exceptions.html)

## 推荐论文 / 文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  它会提醒你：软件开发没有神奇捷径，调试能力本身就是核心基本功。
