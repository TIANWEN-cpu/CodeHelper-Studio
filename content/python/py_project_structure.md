# Python 项目结构：让代码从脚本长成项目

## 学习目标

- 理解为什么项目结构会影响可维护性
- 知道模块、包、入口脚本的分工
- 会画出一个最小可维护项目骨架

## 先修知识

- 模块
- 文件读写
- argparse 更容易串起来

## 为什么这节课重要

很多脚本一开始都只有一个文件。  
但一旦功能开始变多，所有逻辑挤在一起会很快失控。

## 一个最小骨架

```text
project/
  app/
    __init__.py
    main.py
    services.py
  tests/
  README.md
```

## 先记住这几个角色

- `main.py`：入口
- `services.py`：业务逻辑
- `tests/`：验证代码没坏
- `README.md`：别人怎么运行它

## 常见错误

- 所有逻辑写在入口文件里
- 工具函数、数据模型、业务流程完全不分层
- 项目长大后还是按“临时脚本”思路维护

## 小练习

- 给一个现有脚本画出你准备拆分的目录结构
- 说出哪些函数应该从入口文件移出去

## 课后总结

- 项目结构不是形式主义，它直接影响扩展成本
- 越早开始分层，后面越轻松

## 参考文献

- Python Packaging User Guide: https://packaging.python.org/
- Python tutorial modules: https://docs.python.org/3/tutorial/modules.html

## 推荐阅读

- Hynek Schlawack on Python project layout
