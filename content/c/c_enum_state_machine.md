# enum 与状态机直觉：让流程不再靠字符串硬拼

## 学习目标

- 理解 `enum` 的价值
- 会用枚举表示状态
- 对状态机建立第一层直觉

## 先修知识

- 条件判断
- 函数

## 为什么这节课重要

当程序流程开始变复杂时，很多人会到处散落：

- `"INIT"`
- `"RUNNING"`
- `"DONE"`

这很容易拼错，也很难维护。  
`enum` 可以把这些状态先收拢起来。

## 最小例子

```c
typedef enum {
    STATE_INIT,
    STATE_RUNNING,
    STATE_DONE
} State;
```

然后：

```c
State current = STATE_INIT;
```

## 状态机最小直觉

你可以把状态机先理解成：

- 程序当前在哪个阶段
- 某个事件来了以后，状态怎么变

比如任务流程：

- INIT -> RUNNING -> DONE

## 为什么比字符串更稳

- 不容易拼错
- 可读性更强
- 分支判断更集中

## 常见错误

- 状态定义了，但迁移逻辑散得到处都是
- 明明只有固定几种状态，却还在用魔法数字

## 小练习

- 定义一个 `TaskStatus` 枚举，包含 `TODO / DOING / DONE`
- 写一个 `switch`，根据状态输出不同提示

## 课后总结

- `enum` 让状态表达更清晰
- 状态机不是高深概念，本质是“阶段 + 转换”
- 流程复杂时越早建模越轻松

## 参考文献

- cppreference enums: https://en.cppreference.com/w/c/language/enum

## 推荐阅读

- State machine basics articles from embedded systems resources
