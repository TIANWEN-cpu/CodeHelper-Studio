# 异常处理模式：别只会 try / except

## 学习目标

- 理解异常处理不只是“别报错”
- 会写更清楚的 `try / except / else / finally`
- 知道什么时候该捕获，什么时候该继续抛出

## 先修知识

- 函数
- 文件读写
- 基础调试

## 为什么这节课重要

很多初学者写异常处理时容易走两个极端：

- 什么都不处理，程序一报错就直接退出
- 见错就 `except Exception`，然后把问题吞掉

真正稳的代码不是“永远不报错”，而是：

- 该拦的时候拦
- 该提示的时候提示
- 该结束的时候结束

## 最小结构

```python
try:
    value = int(text)
except ValueError:
    print("请输入合法整数")
else:
    print("解析成功", value)
finally:
    print("本次尝试结束")
```

先记最直觉的分工：

- `try`：可能出错的代码
- `except`：出错后怎么处理
- `else`：没出错时再做的事
- `finally`：无论如何都要做的收尾

## 什么时候不要胡乱兜底

如果你根本不知道错误为什么发生，就别急着一把抓：

```python
except Exception:
    pass
```

这类写法很容易把真正的问题藏起来。

## 更稳的例子

```python
def load_age(text):
    try:
        age = int(text)
    except ValueError as exc:
        raise ValueError("年龄必须是整数") from exc

    if age < 0:
        raise ValueError("年龄不能是负数")

    return age
```

这里体现了两个很重要的习惯：

- 只捕获你能解释的错误
- 给上层更清晰的错误信息

## 常见错误

- 用大而宽的异常吞掉所有问题
- 在 `try` 里塞太多无关代码
- 明明应该让调用方处理，却在底层随便打印完就结束

## 小练习

- 写一个 `parse_price(text)`，无法转成数字时抛出更清楚的提示
- 把一段“打开文件 + 解析内容”的逻辑分成 `except` 和 `finally`

## 课后总结

- 异常处理的目标是让程序更可控
- 只捕获你真正理解的错误
- 别用 `pass` 把问题闷掉

## 参考文献

- Python exceptions: https://docs.python.org/3/tutorial/errors.html
- Built-in exceptions: https://docs.python.org/3/library/exceptions.html

## 推荐阅读

- PEP 3134 Exception Chaining: https://peps.python.org/pep-3134/
