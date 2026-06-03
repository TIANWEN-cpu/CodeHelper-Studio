# 自动化脚本：批量处理文件

## 学习目标

- 会遍历目录和批量处理文件
- 会把重复劳动改造成脚本
- 开始建立“先做 MVP，再慢慢扩展”的自动化思维

## 一个特别典型的自动化场景

假设一个文件夹里有很多 `.txt` 文件，你想统一重命名、统计行数或者提取关键词。  
这时候手工一个个点开改，非常累；但脚本会很适合。

## 一个最小例子

```python
from pathlib import Path

folder = Path("notes")
for path in folder.glob("*.txt"):
    print(path.name)
```

如果你把这一步跑通了，就已经迈出了自动化最关键的一步：  
先让程序找到正确的目标。

## 做自动化脚本时的顺序

1. 先读，不急着写
2. 打印将要处理的文件
3. 确认没问题再真正改写
4. 最后补日志和异常处理

## 参考文献

- [pathlib — Object-oriented filesystem paths](https://docs.python.org/3/library/pathlib.html)
- [The Python Tutorial - Reading and Writing Files](https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files)

## 推荐论文 / 文章

- [No Silver Bullet](https://userweb.cs.txstate.edu/~rp31/slides/SilverBullet.pdf)
  自动化很容易让人产生“写个脚本就万事大吉”的错觉，这篇文章会帮你保持清醒。
