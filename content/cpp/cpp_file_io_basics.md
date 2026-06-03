# fstream 文件读写基础

## 概述

C++ 通过 `<fstream>` 头文件提供文件输入输出功能。`ifstream` 用于读取文件，`ofstream` 用于写入文件，`fstream` 支持同时读写。文件操作是 RAII 的典型应用——文件流对象在析构时自动关闭文件，确保资源不会泄漏。本章将系统讲解文件读写的各种模式和最佳实践。

## 文件流类型

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    // ifstream: 文件输入流（读取）
    std::ifstream inputFile;

    // ofstream: 文件输出流（写入）
    std::ofstream outputFile;

    // fstream: 文件输入输出流（读写）
    std::fstream ioFile;

    return 0;
}
```

## 写入文件：ofstream

### 基本写入

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    // 创建并打开文件（如果文件已存在则覆盖）
    std::ofstream outFile("output.txt");

    // 始终检查文件是否成功打开
    if (!outFile.is_open()) {
        std::cerr << "无法打开文件" << std::endl;
        return 1;
    }

    // 写入数据（与 cout 用法相同）
    outFile << "Hello, File!" << std::endl;
    outFile << "数字: " << 42 << std::endl;
    outFile << "浮点数: " << 3.14159 << std::endl;

    // 写入多行
    outFile << "第一行\n";
    outFile << "第二行\n";
    outFile << "第三行\n";

    // 文件在 outFile 离开作用域时自动关闭（RAII）
    // 也可以手动关闭
    outFile.close();

    return 0;
}
```

### 写入模式

```cpp
#include <fstream>
#include <iostream>

int main() {
    // 追加模式：在文件末尾写入，不覆盖原有内容
    std::ofstream appendFile("log.txt", std::ios::app);
    appendFile << "新的日志条目" << std::endl;
    appendFile.close();

    // 二进制模式
    std::ofstream binFile("data.bin", std::ios::binary);
    int data = 12345;
    binFile.write(reinterpret_cast<const char*>(&data), sizeof(data));
    binFile.close();

    // 组合模式
    std::ofstream combined("test.txt", std::ios::app | std::ios::binary);

    return 0;
}
```

### 文件打开模式

| 模式          | 说明                      |
| ------------- | ------------------------- |
| `ios::in`     | 读取模式                  |
| `ios::out`    | 写入模式（ofstream 默认） |
| `ios::app`    | 追加模式                  |
| `ios::ate`    | 打开后定位到文件末尾      |
| `ios::binary` | 二进制模式                |
| `ios::trunc`  | 截断文件（ofstream 默认） |

## 读取文件：ifstream

### 逐行读取

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    // 创建并打开文件
    std::ifstream inFile("input.txt");

    if (!inFile.is_open()) {
        std::cerr << "无法打开文件" << std::endl;
        return 1;
    }

    // 逐行读取（最常用）
    std::string line;
    int lineNum = 0;
    while (std::getline(inFile, line)) {
        lineNum++;
        std::cout << "第 " << lineNum << " 行: " << line << std::endl;
    }

    // 文件自动关闭
    return 0;
}
```

### 逐词读取

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    std::ifstream inFile("input.txt");

    // 逐词读取（以空白符分隔）
    std::string word;
    while (inFile >> word) {
        std::cout << "单词: " << word << std::endl;
    }

    return 0;
}
```

### 读取整个文件

```cpp
#include <fstream>
#include <iostream>
#include <string>
#include <sstream>

int main() {
    std::ifstream inFile("input.txt");

    // 方法 1：使用 stringstream
    std::stringstream buffer;
    buffer << inFile.rdbuf();
    std::string content = buffer.str();
    std::cout << "文件大小: " << content.size() << " 字节" << std::endl;

    // 方法 2：逐行拼接
    inFile.clear();  // 清除 EOF 状态
    inFile.seekg(0); // 回到文件开头
    std::string allContent;
    std::string line;
    while (std::getline(inFile, line)) {
        allContent += line + "\n";
    }

    return 0;
}
```

## 文件位置操作

### seekg / seekp / tellg / tellp

```cpp
#include <fstream>
#include <iostream>

int main() {
    // 写入一些数据
    {
        std::ofstream out("seek_test.txt");
        out << "Hello, World! This is a test file.";
    }

    std::fstream file("seek_test.txt", std::ios::in | std::ios::out);

    // tellg: 获取当前读取位置
    std::cout << "初始读取位置: " << file.tellg() << std::endl;  // 0

    // seekg: 设置读取位置
    file.seekg(7);  // 跳到第 7 个字节
    char ch;
    file.get(ch);
    std::cout << "第 7 个字符: " << ch << std::endl;  // 'W'

    // seekg 的三种定位方式
    file.seekg(0, std::ios::beg);   // 文件开头
    file.seekg(0, std::ios::end);   // 文件末尾
    std::streampos fileSize = file.tellg();
    std::cout << "文件大小: " << fileSize << " 字节" << std::endl;

    file.seekg(-5, std::ios::end);  // 从末尾向前 5 个字节
    char last5[6] = {0};
    file.read(last5, 5);
    std::cout << "最后 5 个字符: " << last5 << std::endl;

    // seekp: 设置写入位置（用于读写模式）
    file.seekp(0, std::ios::beg);
    file << "HELLO";  // 覆盖前 5 个字符

    file.close();
    return 0;
}
```

## 二进制文件读写

```cpp
#include <fstream>
#include <iostream>
#include <vector>
#include <cstring>

struct Record {
    int id;
    char name[32];
    double score;
};

int main() {
    // 写入二进制数据
    {
        std::ofstream outFile("records.bin", std::ios::binary);

        Record records[] = {
            {1, "Alice", 95.5},
            {2, "Bob", 87.0},
            {3, "Charlie", 92.3}
        };

        for (const auto& rec : records) {
            outFile.write(reinterpret_cast<const char*>(&rec), sizeof(Record));
        }
    }

    // 读取二进制数据
    {
        std::ifstream inFile("records.bin", std::ios::binary);

        Record rec;
        while (inFile.read(reinterpret_cast<char*>(&rec), sizeof(Record))) {
            std::cout << "ID: " << rec.id
                      << ", 姓名: " << rec.name
                      << ", 分数: " << rec.score << std::endl;
        }
    }

    return 0;
}
```

## 错误处理

```cpp
#include <fstream>
#include <iostream>
#include <string>

int main() {
    std::ifstream file("nonexistent.txt");

    // 检查文件是否打开成功
    if (!file) {
        std::cerr << "文件打开失败" << std::endl;
        return 1;
    }

    // 检查文件状态
    std::cout << "good: " << file.good() << std::endl;
    std::cout << "eof: " << file.eof() << std::endl;
    std::cout << "fail: " << file.fail() << std::endl;
    std::cout << "bad: " << file.bad() << std::endl;

    // 读取时检查状态
    std::string line;
    while (std::getline(file, line)) {
        // 处理每一行
    }

    // 判断是否正常结束
    if (file.eof()) {
        std::cout << "正常读到文件末尾" << std::endl;
    } else if (file.fail()) {
        std::cerr << "读取过程中发生错误" << std::endl;
    }

    // 清除错误状态（如果需要继续读取）
    file.clear();

    return 0;
}
```

## 读取结构化数据

```cpp
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <sstream>

struct Student {
    int id;
    std::string name;
    double grade;
};

// 读取 CSV 格式文件
std::vector<Student> readCSV(const std::string& filename) {
    std::vector<Student> students;
    std::ifstream file(filename);

    if (!file) {
        std::cerr << "无法打开文件: " << filename << std::endl;
        return students;
    }

    std::string line;
    // 跳过表头
    std::getline(file, line);

    // 读取数据行
    while (std::getline(file, line)) {
        std::stringstream ss(line);
        std::string token;
        Student student;

        std::getline(ss, token, ',');
        student.id = std::stoi(token);

        std::getline(ss, student.name, ',');

        std::getline(ss, token, ',');
        student.grade = std::stod(token);

        students.push_back(student);
    }

    return students;
}

// 写入 CSV 格式文件
void writeCSV(const std::string& filename, const std::vector<Student>& students) {
    std::ofstream file(filename);

    file << "ID,Name,Grade" << std::endl;
    for (const auto& s : students) {
        file << s.id << "," << s.name << "," << s.grade << std::endl;
    }
}

int main() {
    // 写入示例数据
    std::vector<Student> students = {
        {1, "Alice", 95.5},
        {2, "Bob", 87.0},
        {3, "Charlie", 92.3}
    };
    writeCSV("students.csv", students);

    // 读取并打印
    auto loaded = readCSV("students.csv");
    for (const auto& s : loaded) {
        std::cout << s.id << " | " << s.name
                  << " | " << s.grade << std::endl;
    }

    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：不检查文件是否打开成功

```cpp
std::ifstream file("data.txt");
// 如果文件不存在，后续读取都会静默失败
// 正确做法：始终检查
if (!file) {
    std::cerr << "文件打开失败" << std::endl;
}
```

### 陷阱 2：混用 >> 和 getline

```cpp
std::ifstream file("data.txt");
int age;
file >> age;  // 读取数字后，换行符仍在缓冲区
std::string name;
std::getline(file, name);  // 读到空字符串（换行符）！

// 解决：清除换行符
file >> age;
file.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
std::getline(file, name);
```

### 陷阱 3：用 eof() 控制循环

```cpp
// 错误：eof() 在读取失败后才返回 true
while (!file.eof()) {
    std::getline(file, line);  // 最后一次会读到空行
    process(line);
}

// 正确：用读取操作本身作为条件
while (std::getline(file, line)) {
    process(line);
}
```

### 最佳实践

1. **始终检查文件是否成功打开**
2. **使用 RAII：文件流对象离开作用域自动关闭**
3. **用读取操作作为循环条件，而非 `eof()`**
4. **文本文件用默认模式，二进制文件用 `ios::binary`**
5. **混用 `>>` 和 `getline` 时注意清除换行符**
6. **使用 `std::filesystem`（C++17）检查文件是否存在**

## 练习

1. 编写程序读取一个文本文件，统计其中的行数、单词数和字符数。

2. 实现一个简易的日志系统：每次调用 `logMessage(const std::string&)` 时，将带时间戳的消息追加到日志文件。

3. 编写程序将一个二进制文件的内容复制到另一个文件。

4. 读取一个 CSV 文件（包含学生信息），计算平均分并输出到新的 CSV 文件。

5. 实现一个文件加密/解密工具：对文件每个字节进行 XOR 操作。

## 参考链接

- [std::basic_ifstream - cppreference](https://en.cppreference.com/w/cpp/io/basic_ifstream)
- [std::basic_ofstream - cppreference](https://en.cppreference.com/w/cpp/io/basic_ofstream)
- [std::basic_fstream - cppreference](https://en.cppreference.com/w/cpp/io/basic_fstream)
- [std::getline - cppreference](https://en.cppreference.com/w/cpp/string/basic_string/getline)
- [std::filesystem - cppreference](https://en.cppreference.com/w/cpp/filesystem)
- [C++ 文件 I/O 教程](https://www.learncpp.com/cpp-tutorial/streams-and-iostreams/)
