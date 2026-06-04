# 列表推导式与表达式化思维

## 你会学到

- 会把简单循环改写成推导式
- 知道什么时候保留普通循环更清楚
- 理解过滤和映射可以同时发生

## 为什么这节课重要

列表推导式不是为了把代码写短，而是为了把“从一个集合得到另一个集合”的意图写得更直接。它适合单步过滤、单步映射，不适合塞进太多业务条件。

## 核心知识

- 基本结构是 `[expr for item in items if cond]`
- 如果一行里已经塞进两层以上判断，通常就该退回普通循环
- 可读性优先于“看起来高级”

## 示例

```python
numbers = [1, 2, 3, 4, 5, 6]
odd_squares = [n * n for n in numbers if n % 2 == 1]
print(odd_squares)
```

## 常见误区

- 把复杂业务逻辑硬塞进推导式，结果更难读
- 忘记先想清“筛选”和“变换”的先后顺序
- 把副作用操作写进推导式

## 继续练什么

- 把 `for` 循环版的去空字符串逻辑改写成推导式
- 自己判断一段复杂推导式是否该退回普通循环

## 参考资料

- [Python Tutorial: Data Structures](https://docs.python.org/3/tutorial/datastructures.html)

## 推荐论文 / 经典文章

- [Structured Programming with go to Statements](https://www.cs.utexas.edu/~EWD/transcriptions/EWD02xx/EWD249/EWD249.html)
  表达式化写法的前提是结构清晰，而不是把逻辑压扁。
