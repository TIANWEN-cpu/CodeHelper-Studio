# 第二章：数据库实战 (SQLite)

## 1. 什么是数据库？

数据库是长期存储在计算机内、有组织的、可共享的大量数据的集合。

## 2. SQLite 入门

SQLite 是一个嵌入式 SQL 数据库引擎。它不需要服务器即可运行。

```python
import sqlite3
conn = sqlite3.connect('test.db')
```

## 3. 实操任务

在“数据库管家”中点击刷新，观察预设的 `students` 表数据。
