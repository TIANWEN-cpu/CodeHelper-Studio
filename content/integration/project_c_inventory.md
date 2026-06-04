# 项目六：C 语言库存记录工具

## 项目目标

做一个基于结构体和文件的小型库存工具，支持新增、查看和持久化库存记录。

## 这个项目为什么重要

- 结构体建模
- 文件读写
- 菜单流程组织
- C 小项目拆分

## 推荐 MVP 范围

- `add`：新增一个库存项
- `list`：查看当前库存
- `save`：退出前保存到文件
- `load`：启动时读取已有数据

## 拆分建议

- 先设计 `struct Item`
- 再做内存中的列表或数组管理
- 最后接文件读写和菜单循环

## 验收标准

- 能新增库存项
- 能列出库存项
- 重启后数据仍然存在

## 参考资料

- [GNU C Manual](https://www.gnu.org/software/c-intro-and-ref/manual/)
- [cppreference C](https://en.cppreference.com/w/c.html)

## 推荐论文 / 经典文章

- [The Mythical Man-Month](https://archive.org/details/mythicalmanmonth00fred)
  小项目也要收范围，别一开始就堆十个功能。
