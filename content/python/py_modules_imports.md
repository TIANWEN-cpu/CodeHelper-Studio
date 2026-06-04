# 导入、模块边界与代码组织

## 学习目标

- 理解 `import` 在项目中的作用
- 会把一个长脚本拆成多个模块
- 建立“入口代码”和“工具代码”分开的意识

## 为什么要学模块边界

如果所有代码都写在一个文件里，程序很快就会变成“你自己都不想再看第二遍”的样子。  
模块化的目标不是显得专业，而是让代码能改、能查、能复用。

## 一个简单拆分

假设你在做成绩程序，可以这样拆：

```python
# calc.py
def average(values):
    return sum(values) / len(values)
```

```python
# main.py
from calc import average

scores = [80, 90, 100]
print(average(scores))
```

## 先建立一个朴素规则

- `main.py` 负责流程
- 工具函数放到单独模块
- 不要让模块之间互相乱引用

## 常见误区

- `import` 不是复制代码，而是加载模块对象
- 模块拆分不是越多越好，边界要有意义
- 如果两个模块互相 import，往往说明职责还没拆好

## 延伸实践

- 把一个 100 行脚本拆成 2 到 3 个文件
- 尝试把“数据处理”和“输出展示”分到不同模块

## 参考文献

- [The Python Tutorial - Modules](https://docs.python.org/3/tutorial/modules.html)
- [The Python Language Reference - import](https://docs.python.org/3/reference/import.html)

## 推荐论文 / 文章

- [On the Criteria To Be Used in Decomposing Systems into Modules](https://cw.fel.cvut.cz/old/_media/courses/a4m33sep/materialy/architecture_and_design/01-article_original_de_parnas.pdf)
  这是学习模块化时非常值得早读的一篇经典文章。
