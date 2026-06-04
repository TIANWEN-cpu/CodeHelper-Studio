# 字符串、列表、字典与集合

## 学习目标

- 会区分字符串、列表、字典、集合的使用场景
- 会用常见容器完成查找、统计、去重和映射
- 开始建立“先选对数据结构，再写逻辑”的习惯

## 为什么这节课很重要

很多初学者写代码时，脑子里只有“变量”和“循环”，结果一旦数据稍微复杂一点，代码就开始乱。  
真正让程序变清爽的，往往不是更高级的语法，而是先把数据放进合适的容器。

## 四种常见容器

- `str`：适合处理文本
- `list`：适合保留顺序的一组数据
- `dict`：适合“键 -> 值”映射
- `set`：适合快速去重和成员判断

```python
name = "Alice"
scores = [88, 92, 76]
profile = {"name": "Alice", "city": "Shanghai"}
tags = {"python", "sql", "python"}
```

## 一个常见组合

统计单词出现次数时，字典会非常自然：

```python
words = ["python", "sql", "python"]
counter = {}

for word in words:
    counter[word] = counter.get(word, 0) + 1
```

而如果你只想知道“一个元素是否出现过”，集合通常比列表更合适。

## 常见误区

- 列表和集合都能放一组数据，但集合不保证顺序
- 字典不是“高级列表”，它解决的是名字映射问题
- 字符串不可变，很多操作会返回新字符串而不是原地修改

## 小练习

- 用列表保存 5 个温度值，求平均值
- 用字典保存用户名和积分
- 用集合判断一个单词有没有重复出现

## 参考文献

- [The Python Tutorial - Data Structures](https://docs.python.org/3/tutorial/datastructures.html)
- [Python Standard Types](https://docs.python.org/3/library/stdtypes.html)

## 推荐论文 / 文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  这篇文章不是专门讲容器的，但它会帮你形成“先组织结构，再写实现”的思维。
