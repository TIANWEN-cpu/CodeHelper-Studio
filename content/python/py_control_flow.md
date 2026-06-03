# 条件、循环与小程序思维

## 学习目标

- 会根据条件做分支决策
- 会把重复任务改写成循环
- 开始形成“小程序拆解”思维

## 条件判断

当程序需要“看情况办事”时，用 `if`：

```python
score = 78

if score >= 90:
    print("优秀")
elif score >= 60:
    print("及格")
else:
    print("需要补强")
```

重点不是记语法，而是先问自己：我到底在判断什么条件？

## `for` 循环

如果你要遍历一组数据，优先想 `for`：

```python
for number in [1, 2, 3]:
    print(number)
```

如果是一个连续区间，经常配合 `range()`：

```python
for i in range(5):
    print(i)
```

## `while` 循环

当“循环结束条件”不只是简单遍历时，用 `while`：

```python
count = 3
while count > 0:
    print(count)
    count -= 1
```

## break / continue

- `break`：提前结束整个循环
- `continue`：跳过本轮，继续下一轮

```python
for n in range(10):
    if n == 5:
        break
    print(n)
```

## 小程序思维

例如“计算列表中所有偶数之和”，你可以拆成：

1. 准备总和变量
2. 遍历列表
3. 判断当前数是不是偶数
4. 如果是，就累加
5. 最后返回结果

这就是算法思维的起点。

## 常见错误

- 循环变量没有更新，导致死循环
- `if` 缩进错误
- 把“打印结果”误当成“返回结果”

## 本课总结

流程控制的价值，不是会背 `if` 和 `for`，而是能把现实任务拆成明确步骤。后面做项目时，这种能力会比语法本身更重要。
