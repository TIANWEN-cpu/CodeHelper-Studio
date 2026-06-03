# 异常、文件与异步入门

## 学习目标

- 会使用 `try/catch`
- 会读写基础文本文件
- 对 `async/await` 建立第一层不恐惧的理解

## 为什么这三件事要放一起学

因为它们都属于“真实程序一定会碰到的情况”：

- 文件会出问题
- 网络会变慢
- 代码不能一直把用户界面卡住

## 一个最小的异步心智模型

`async/await` 不等于“更快”，它更像是：
“把等待过程安排得更合理，不要把主流程整块卡死。”

## 参考文献

- [Exceptions and exception handling](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/exceptions/)
- [Async and await](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/concepts/async/)

## 推荐论文 / 文章

- [An Axiomatic Basis for Computer Programming](https://research.cs.queensu.ca/home/cordy/cisc860/Biblio/drb/GS/hoare69.pdf)
  它会帮助你更认真地看待“程序在不同状态下到底应该保证什么”。
