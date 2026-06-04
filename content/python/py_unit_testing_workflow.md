# 单元测试工作流与回归意识

## 你会学到

- 会用 unittest 或 pytest 为核心函数写最小测试
- 理解“修 bug 之后补测试”的价值
- 形成回归意识

## 为什么这节课重要

测试的本质不是追求覆盖率数字，而是让你敢改代码。只要一个函数承担核心逻辑，它就值得有一两个能保底的测试。

## 核心知识

- 测试先覆盖稳定输入和明确输出
- 失败信息要能帮助定位问题
- 回归测试的意义在于“以后别再坏一次”

## 示例

```python
import unittest


def is_positive(num):
    return num > 0


class TestMath(unittest.TestCase):
    def test_positive(self):
        self.assertTrue(is_positive(3))
        self.assertFalse(is_positive(0))
```

## 常见误区

- 把测试写成和实现一样复杂
- 只测理想路径，不测边界值
- 发现 bug 后修了实现，却不补测试

## 继续练什么

- 给 `safe_divide` 写 2 个最小测试
- 给你自己的小项目挑一个函数补回归测试

## 参考资料

- [unittest — Unit testing framework](https://docs.python.org/3/library/unittest.html)

## 推荐论文 / 经典文章

- [An Axiomatic Basis for Computer Programming](https://research.cs.queensu.ca/home/cordy/cisc860/Biblio/drb/GS/hoare69.pdf)
  它会提醒你：程序正确性不是凭感觉。
