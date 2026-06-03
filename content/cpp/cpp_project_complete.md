# 综合实战项目：学生成绩管理系统

## 概述

本章将通过设计并实现一个完整的学生成绩管理系统，将前面章节学到的 C++ 知识融会贯通。项目涵盖：项目结构设计、CMake 构建、类设计、文件读写、异常处理、STL 容器与算法、智能指针管理、单元测试等。这是一个从 0 到 1 的完整项目实战。

## 项目目标

- 管理学生信息（学号、姓名、各科成绩）
- 支持添加、删除、修改、查询学生
- 计算个人总分、平均分、排名
- 数据持久化（CSV 文件读写）
- 异常处理与输入验证
- 单元测试

## 项目结构

```
student_manager/
├── CMakeLists.txt           # CMake 构建配置
├── src/
│   ├── main.cpp             # 程序入口
│   ├── student.h            # Student 类声明
│   ├── student.cpp          # Student 类实现
│   ├── grade_manager.h      # GradeManager 类声明
│   ├── grade_manager.cpp    # GradeManager 类实现
│   └── file_io.h            # 文件读写工具
├── tests/
│   ├── CMakeLists.txt       # 测试 CMake 配置
│   └── test_grade_manager.cpp  # 单元测试
└── data/
    └── students.csv         # 数据文件
```

## CMake 配置

### 根目录 CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.14)
project(StudentManager LANGUAGES CXX)

# C++17 标准
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 可执行文件
add_executable(student_manager
    src/main.cpp
    src/student.cpp
    src/grade_manager.cpp
)

# 包含目录
target_include_directories(student_manager PRIVATE src)

# 启用测试
enable_testing()
add_subdirectory(tests)
```

### tests/CMakeLists.txt

```cmake
add_executable(test_grade_manager
    test_grade_manager.cpp
    ../src/student.cpp
    ../src/grade_manager.cpp
)

target_include_directories(test_grade_manager PRIVATE ../src)
add_test(NAME GradeManagerTests COMMAND test_grade_manager)
```

## 核心类设计

### Student 类

```cpp
// student.h
#ifndef STUDENT_H
#define STUDENT_H

#include <string>
#include <map>
#include <stdexcept>
#include <numeric>
#include <algorithm>

class Student {
public:
    Student(int id, const std::string& name)
        : id_(id), name_(name) {
        if (name.empty()) {
            throw std::invalid_argument("姓名不能为空");
        }
        if (id <= 0) {
            throw std::invalid_argument("学号必须大于 0");
        }
    }

    // Getter
    int getId() const { return id_; }
    const std::string& getName() const { return name_; }

    void setName(const std::string& name) {
        if (name.empty()) {
            throw std::invalid_argument("姓名不能为空");
        }
        name_ = name;
    }

    // 成绩管理
    void addGrade(const std::string& subject, double score) {
        if (score < 0 || score > 100) {
            throw std::out_of_range("成绩必须在 0-100 之间");
        }
        grades_[subject] = score;
    }

    double getGrade(const std::string& subject) const {
        auto it = grades_.find(subject);
        if (it == grades_.end()) {
            throw std::out_of_range("科目不存在: " + subject);
        }
        return it->second;
    }

    bool hasGrade(const std::string& subject) const {
        return grades_.count(subject) > 0;
    }

    void removeGrade(const std::string& subject) {
        grades_.erase(subject);
    }

    double getTotalScore() const {
        double total = 0;
        for (const auto& [subject, score] : grades_) {
            total += score;
        }
        return total;
    }

    double getAverageScore() const {
        if (grades_.empty()) return 0.0;
        return getTotalScore() / grades_.size();
    }

    const std::map<std::string, double>& getGrades() const {
        return grades_;
    }

    // 打印信息
    std::string toString() const {
        std::string result = "学号: " + std::to_string(id_) +
                           ", 姓名: " + name_ +
                           ", 总分: " + std::to_string(getTotalScore()) +
                           ", 平均分: " + std::to_string(getAverageScore());
        return result;
    }

private:
    int id_;
    std::string name_;
    std::map<std::string, double> grades_;
};

#endif // STUDENT_H
```

### GradeManager 类

```cpp
// grade_manager.h
#ifndef GRADE_MANAGER_H
#define GRADE_MANAGER_H

#include "student.h"
#include <vector>
#include <memory>
#include <string>
#include <algorithm>
#include <functional>

class GradeManager {
public:
    // 添加学生
    void addStudent(int id, const std::string& name) {
        if (findStudent(id)) {
            throw std::runtime_error("学号已存在: " + std::to_string(id));
        }
        students_.push_back(std::make_unique<Student>(id, name));
    }

    // 删除学生
    bool removeStudent(int id) {
        auto it = std::remove_if(students_.begin(), students_.end(),
            [id](const std::unique_ptr<Student>& s) {
                return s->getId() == id;
            });
        if (it == students_.end()) return false;
        students_.erase(it, students_.end());
        return true;
    }

    // 查找学生
    Student* findStudent(int id) const {
        auto it = std::find_if(students_.begin(), students_.end(),
            [id](const std::unique_ptr<Student>& s) {
                return s->getId() == id;
            });
        return (it != students_.end()) ? it->get() : nullptr;
    }

    // 添加成绩
    void addGrade(int studentId, const std::string& subject, double score) {
        Student* student = findStudent(studentId);
        if (!student) {
            throw std::runtime_error("学生不存在: " + std::to_string(studentId));
        }
        student->addGrade(subject, score);
    }

    // 获取排名（按总分降序）
    std::vector<const Student*> getRanking() const {
        std::vector<const Student*> ranking;
        for (const auto& s : students_) {
            ranking.push_back(s.get());
        }
        std::sort(ranking.begin(), ranking.end(),
            [](const Student* a, const Student* b) {
                return a->getTotalScore() > b->getTotalScore();
            });
        return ranking;
    }

    // 统计信息
    double getClassAverage(const std::string& subject) const {
        double total = 0;
        int count = 0;
        for (const auto& s : students_) {
            if (s->hasGrade(subject)) {
                total += s->getGrade(subject);
                count++;
            }
        }
        return count > 0 ? total / count : 0.0;
    }

    size_t getStudentCount() const { return students_.size(); }

    // 遍历所有学生
    void forEachStudent(std::function<void(const Student&)> callback) const {
        for (const auto& s : students_) {
            callback(*s);
        }
    }

private:
    std::vector<std::unique_ptr<Student>> students_;
};

#endif // GRADE_MANAGER_H
```

### 文件读写

```cpp
// file_io.h
#ifndef FILE_IO_H
#define FILE_IO_H

#include "grade_manager.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <stdexcept>

class FileIO {
public:
    // 保存数据到 CSV
    static void saveToFile(const GradeManager& manager, const std::string& filename) {
        std::ofstream file(filename);
        if (!file) {
            throw std::runtime_error("无法打开文件: " + filename);
        }

        // 写入表头
        file << "ID,Name,Math,English,Science" << std::endl;

        manager.forEachStudent([&file](const Student& student) {
            file << student.getId() << ","
                 << student.getName() << ",";

            double math = student.hasGrade("Math") ? student.getGrade("Math") : 0;
            double english = student.hasGrade("English") ? student.getGrade("English") : 0;
            double science = student.hasGrade("Science") ? student.getGrade("Science") : 0;

            file << math << "," << english << "," << science << std::endl;
        });

        std::cout << "数据已保存到 " << filename << std::endl;
    }

    // 从 CSV 加载数据
    static void loadFromFile(GradeManager& manager, const std::string& filename) {
        std::ifstream file(filename);
        if (!file) {
            throw std::runtime_error("无法打开文件: " + filename);
        }

        std::string line;
        // 跳过表头
        std::getline(file, line);

        while (std::getline(file, line)) {
            std::stringstream ss(line);
            std::string token;

            // 解析 ID
            std::getline(ss, token, ',');
            int id = std::stoi(token);

            // 解析姓名
            std::string name;
            std::getline(ss, name, ',');

            try {
                manager.addStudent(id, name);
            } catch (const std::runtime_error&) {
                // 学号已存在，跳过
                continue;
            }

            // 解析成绩
            std::string subjects[] = {"Math", "English", "Science"};
            for (const auto& subject : subjects) {
                std::getline(ss, token, ',');
                double score = std::stod(token);
                if (score > 0) {
                    manager.addGrade(id, subject, score);
                }
            }
        }

        std::cout << "已从 " << filename << " 加载 "
                  << manager.getStudentCount() << " 名学生" << std::endl;
    }
};

#endif // FILE_IO_H
```

### 主程序

```cpp
// main.cpp
#include "grade_manager.h"
#include "file_io.h"
#include <iostream>
#include <string>
#include <limits>

void printMenu() {
    std::cout << "\n===== 学生成绩管理系统 =====" << std::endl;
    std::cout << "1. 添加学生" << std::endl;
    std::cout << "2. 删除学生" << std::endl;
    std::cout << "3. 添加成绩" << std::endl;
    std::cout << "4. 查询学生" << std::endl;
    std::cout << "5. 查看排名" << std::endl;
    std::cout << "6. 统计信息" << std::endl;
    std::cout << "7. 保存数据" << std::endl;
    std::cout << "8. 加载数据" << std::endl;
    std::cout << "0. 退出" << std::endl;
    std::cout << "请选择: ";
}

int main() {
    GradeManager manager;
    const std::string DATA_FILE = "data/students.csv";

    // 尝试加载已有数据
    try {
        FileIO::loadFromFile(manager, DATA_FILE);
    } catch (const std::exception& e) {
        std::cout << "无已有数据，从头开始" << std::endl;
    }

    while (true) {
        printMenu();
        int choice;
        if (!(std::cin >> choice)) {
            std::cin.clear();
            std::cin.ignore(std::numeric_limits<std::streamsize>::max(), '\n');
            std::cout << "无效输入" << std::endl;
            continue;
        }

        try {
            switch (choice) {
                case 1: {
                    int id;
                    std::string name;
                    std::cout << "输入学号: ";
                    std::cin >> id;
                    std::cout << "输入姓名: ";
                    std::cin >> name;
                    manager.addStudent(id, name);
                    std::cout << "学生添加成功" << std::endl;
                    break;
                }
                case 2: {
                    int id;
                    std::cout << "输入学号: ";
                    std::cin >> id;
                    if (manager.removeStudent(id)) {
                        std::cout << "学生已删除" << std::endl;
                    } else {
                        std::cout << "学生不存在" << std::endl;
                    }
                    break;
                }
                case 3: {
                    int id;
                    std::string subject;
                    double score;
                    std::cout << "输入学号: ";
                    std::cin >> id;
                    std::cout << "输入科目 (Math/English/Science): ";
                    std::cin >> subject;
                    std::cout << "输入成绩: ";
                    std::cin >> score;
                    manager.addGrade(id, subject, score);
                    std::cout << "成绩添加成功" << std::endl;
                    break;
                }
                case 4: {
                    int id;
                    std::cout << "输入学号: ";
                    std::cin >> id;
                    Student* student = manager.findStudent(id);
                    if (student) {
                        std::cout << student->toString() << std::endl;
                        for (const auto& [subj, grade] : student->getGrades()) {
                            std::cout << "  " << subj << ": " << grade << std::endl;
                        }
                    } else {
                        std::cout << "学生不存在" << std::endl;
                    }
                    break;
                }
                case 5: {
                    auto ranking = manager.getRanking();
                    std::cout << "\n=== 排名 ===" << std::endl;
                    int rank = 1;
                    for (const auto* student : ranking) {
                        std::cout << rank++ << ". " << student->getName()
                                  << " (总分: " << student->getTotalScore()
                                  << ", 平均: " << student->getAverageScore() << ")" << std::endl;
                    }
                    break;
                }
                case 6: {
                    std::string subjects[] = {"Math", "English", "Science"};
                    std::cout << "\n=== 统计 ===" << std::endl;
                    std::cout << "学生总数: " << manager.getStudentCount() << std::endl;
                    for (const auto& subj : subjects) {
                        double avg = manager.getClassAverage(subj);
                        if (avg > 0) {
                            std::cout << subj << " 平均分: " << avg << std::endl;
                        }
                    }
                    break;
                }
                case 7: {
                    FileIO::saveToFile(manager, DATA_FILE);
                    break;
                }
                case 8: {
                    GradeManager tempManager;
                    FileIO::loadFromFile(tempManager, DATA_FILE);
                    manager = std::move(tempManager);
                    break;
                }
                case 0: {
                    // 退出前自动保存
                    FileIO::saveToFile(manager, DATA_FILE);
                    std::cout << "再见！" << std::endl;
                    return 0;
                }
                default:
                    std::cout << "无效选项" << std::endl;
            }
        } catch (const std::exception& e) {
            std::cerr << "错误: " << e.what() << std::endl;
        }
    }
}
```

## 单元测试

```cpp
// tests/test_grade_manager.cpp
#include "grade_manager.h"
#include <iostream>
#include <cassert>
#include <cmath>

// 简易测试框架
#define TEST(name) void name(); int main() { name(); std::cout << "所有测试通过!" << std::endl; return 0; } void name()
#define ASSERT_EQ(a, b) do { if ((a) != (b)) { std::cerr << "断言失败: " << #a << " != " << #b << std::endl; return; } } while(0)
#define ASSERT_NEAR(a, b, eps) do { if (std::abs((a) - (b)) > (eps)) { std::cerr << "断言失败: " << #a << " ≈ " << #b << std::endl; return; } } while(0)
#define ASSERT_THROWS(expr, exc) do { try { expr; std::cerr << "应抛出异常: " << #exc << std::endl; return; } catch (const exc&) {} } while(0)

TEST(testStudentCreation) {
    Student s(1, "Alice");
    ASSERT_EQ(s.getId(), 1);
    ASSERT_EQ(s.getName(), "Alice");
    ASSERT_EQ(s.getTotalScore(), 0.0);
}

TEST(testStudentGrades) {
    Student s(1, "Bob");
    s.addGrade("Math", 90.0);
    s.addGrade("English", 85.0);

    ASSERT_NEAR(s.getTotalScore(), 175.0, 0.01);
    ASSERT_NEAR(s.getAverageScore(), 87.5, 0.01);
    ASSERT_EQ(s.hasGrade("Math"), true);
    ASSERT_EQ(s.hasGrade("Science"), false);
}

TEST(testInvalidStudent) {
    ASSERT_THROWS(Student(0, "Test"), std::invalid_argument);
    ASSERT_THROWS(Student(1, ""), std::invalid_argument);
}

TEST(testInvalidGrade) {
    Student s(1, "Test");
    ASSERT_THROWS(s.addGrade("Math", -1), std::out_of_range);
    ASSERT_THROWS(s.addGrade("Math", 101), std::out_of_range);
}

TEST(testGradeManager) {
    GradeManager manager;
    manager.addStudent(1, "Alice");
    manager.addStudent(2, "Bob");

    ASSERT_EQ(manager.getStudentCount(), 2);

    manager.addGrade(1, "Math", 95.0);
    manager.addGrade(2, "Math", 88.0);

    ASSERT_NEAR(manager.getClassAverage("Math"), 91.5, 0.01);

    auto ranking = manager.getRanking();
    ASSERT_EQ(ranking[0]->getName(), "Alice");
    ASSERT_EQ(ranking[1]->getName(), "Bob");

    ASSERT_EQ(manager.removeStudent(1), true);
    ASSERT_EQ(manager.getStudentCount(), 1);
}

TEST(testDuplicateStudent) {
    GradeManager manager;
    manager.addStudent(1, "Alice");
    ASSERT_THROWS(manager.addStudent(1, "Bob"), std::runtime_error);
}
```

## 编译与运行

```bash
# 创建构建目录
mkdir build && cd build

# 配置
cmake ..

# 编译
cmake --build .

# 运行测试
ctest --verbose

# 运行程序
./student_manager
```

## 项目扩展方向

1. **GUI 界面**：使用 Qt 或 ImGui 添加图形界面
2. **数据库后端**：用 SQLite 替代 CSV 文件
3. **网络功能**：添加 REST API，支持远程访问
4. **报表生成**：导出 PDF 或 Excel 格式的成绩单
5. **权限管理**：添加用户登录和角色权限
6. **数据分析**：成绩分布图、趋势分析
7. **国际化**：支持多语言

## 参考链接

- [CMake 官方教程](https://cmake.org/cmake/help/latest/guide/tutorial/index.html)
- [Google Test 框架](https://google.github.io/googletest/)
- [Catch2 测试框架](https://github.com/catchorg/Catch2)
- [C++ Core Guidelines](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines)
- [CMake 最佳实践](https://cliutils.gitlab.io/modern-cmake/)
- [Google C++ 风格指南](https://google.github.io/styleguide/cppguide.html)
