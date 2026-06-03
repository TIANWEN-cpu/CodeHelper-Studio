# Lambda 表达式与函数式编程

## 概述

Lambda 表达式是 C++11 引入的强大特性，允许你在代码中定义匿名函数。结合 STL 算法，Lambda 让 C++ 具备了函数式编程的能力，使代码更简洁、更具表达力。本章将系统讲解 Lambda 的语法、捕获机制、与 STL 算法的配合使用，以及 `std::function` 的应用。

## Lambda 基础语法

### 最简单的 Lambda

```cpp
#include <iostream>

int main() {
    // 最简单的 Lambda：无参数、无捕获、无返回值
    auto hello = []() {
        std::cout << "Hello, Lambda!" << std::endl;
    };
    hello();  // 调用

    // 可以省略空的参数列表
    auto hello2 = [] {
        std::cout << "Hello again!" << std::endl;
    };
    hello2();

    return 0;
}
```

### Lambda 的完整语法

```cpp
[capture](parameters) mutable -> return_type { body }
//  ^捕获列表  ^参数列表  ^可变   ^返回类型   ^函数体
```

```cpp
#include <iostream>

int main() {
    // 带参数
    auto add = [](int a, int b) {
        return a + b;
    };
    std::cout << "3 + 5 = " << add(3, 5) << std::endl;

    // 指定返回类型（当编译器无法推导时）
    auto transform = [](double x) -> int {
        return static_cast<int>(x * 100);
    };
    std::cout << "transform(3.14) = " << transform(3.14) << std::endl;

    // 带默认参数
    auto greet = [](const std::string& name, const std::string& greeting = "你好") {
        std::cout << greeting << ", " << name << "!" << std::endl;
    };
    greet("Alice");
    greet("Bob", "Hello");

    return 0;
}
```

## 捕获列表

捕获列表决定了 Lambda 可以访问哪些外部变量，以及如何访问它们。

### 捕获方式

```cpp
#include <iostream>
#include <string>

int main() {
    int x = 10;
    int y = 20;
    std::string name = "Alice";

    // []：不捕获任何变量
    auto noCapture = [] {
        // std::cout << x;  // 错误！x 不在作用域内
        std::cout << "没有捕获任何变量" << std::endl;
    };
    noCapture();

    // [x]：按值捕获 x
    auto byValue = [x] {
        std::cout << "x = " << x << std::endl;
        // x = 100;  // 错误！按值捕获的变量是 const 的
    };
    byValue();

    // [&x]：按引用捕获 x
    auto byRef = [&x] {
        x = 100;  // OK：可以修改
        std::cout << "修改后 x = " << x << std::endl;
    };
    byRef();
    std::cout << "外部 x = " << x << std::endl;  // 100

    // [=]：按值捕获所有使用的变量
    auto allByValue = [=] {
        std::cout << "x = " << x << ", y = " << y << std::endl;
    };
    allByValue();

    // [&]：按引用捕获所有使用的变量
    auto allByRef = [&] {
        x = 200;
        y = 300;
        std::cout << "x = " << x << ", y = " << y << std::endl;
    };
    allByRef();

    // [x, &y]：混合捕获
    auto mixed = [x, &y] {
        std::cout << "x (值) = " << x << std::endl;
        y = 400;  // OK：y 是引用捕获
    };
    mixed();

    // [this]：捕获当前对象的 this 指针
    // 在类成员函数中使用

    return 0;
}
```

### 在类中使用 Lambda

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

class Calculator {
public:
    Calculator(int base) : base_(base) {}

    void process(const std::vector<int>& numbers) {
        // [this] 捕获当前对象
        auto addBase = [this](int n) {
            return n + base_;
        };

        // [=] 也可以捕获 this（隐式）
        auto addBase2 = [=](int n) {
            return n + base_;
        };

        for (int n : numbers) {
            std::cout << addBase(n) << " ";
        }
        std::cout << std::endl;
    }

private:
    int base_;
};

int main() {
    Calculator calc(100);
    calc.process({1, 2, 3, 4, 5});  // 101 102 103 104 105
    return 0;
}
```

## Mutable Lambda

默认情况下，按值捕获的变量在 Lambda 体内是 `const` 的。使用 `mutable` 可以修改按值捕获的变量（但不会影响外部变量）。

```cpp
#include <iostream>

int main() {
    int counter = 0;

    // 没有 mutable：按值捕获的变量是 const
    auto readCounter = [counter] {
        std::cout << "counter = " << counter << std::endl;
        // counter++;  // 错误！const 变量
    };
    readCounter();

    // 有 mutable：可以修改按值捕获的变量
    auto mutableCounter = [counter]() mutable {
        counter++;  // OK：修改的是 Lambda 内部的副本
        std::cout << "内部 counter = " << counter << std::endl;
    };
    mutableCounter();  // 内部 counter = 1
    mutableCounter();  // 内部 counter = 2
    mutableCounter();  // 内部 counter = 3

    std::cout << "外部 counter = " << counter << std::endl;  // 仍然是 0

    // 引用捕获 + mutable：修改外部变量
    auto refCounter = [&counter]() mutable {
        counter++;  // 修改外部变量
        std::cout << "引用 counter = " << counter << std::endl;
    };
    refCounter();  // 引用 counter = 1
    refCounter();  // 引用 counter = 2
    std::cout << "外部 counter = " << counter << std::endl;  // 2

    return 0;
}
```

## 泛型 Lambda（C++14）

C++14 允许 Lambda 的参数使用 `auto`，实现泛型 Lambda。

```cpp
#include <iostream>
#include <string>
#include <vector>

int main() {
    // 泛型 Lambda：参数使用 auto
    auto print = [](const auto& value) {
        std::cout << value << std::endl;
    };

    print(42);               // int
    print(3.14);             // double
    print(std::string("Hello"));  // string

    // 多个泛型参数
    auto add = [](const auto& a, const auto& b) {
        return a + b;
    };

    std::cout << add(1, 2) << std::endl;           // 3
    std::cout << add(1.5, 2.5) << std::endl;       // 4.0
    std::cout << add(std::string("Hello"), " World") << std::endl;

    // 泛型 Lambda 与类型推导
    auto identity = [](auto&& x) -> decltype(auto) {
        return std::forward<decltype(x)>(x);
    };

    return 0;
}
```

## std::function

`std::function` 是一个通用的函数包装器，可以存储、复制和调用任何可调用对象（函数、Lambda、函数对象）。

```cpp
#include <iostream>
#include <functional>
#include <string>

// 普通函数
int add(int a, int b) { return a + b; }

// 函数对象
class Multiplier {
public:
    int operator()(int a, int b) const { return a * b; }
};

int main() {
    // std::function 包装普通函数
    std::function<int(int, int)> func1 = add;
    std::cout << "add(3, 5) = " << func1(3, 5) << std::endl;

    // std::function 包装 Lambda
    std::function<int(int, int)> func2 = [](int a, int b) {
        return a - b;
    };
    std::cout << "subtract(10, 3) = " << func2(10, 3) << std::endl;

    // std::function 包装函数对象
    std::function<int(int, int)> func3 = Multiplier();
    std::cout << "multiply(4, 5) = " << func3(4, 5) << std::endl;

    // std::function 作为函数参数
    auto applyOperation = [](int a, int b, std::function<int(int, int)> op) {
        return op(a, b);
    };

    std::cout << applyOperation(10, 3, add) << std::endl;
    std::cout << applyOperation(10, 3, [](int a, int b) { return a % b; }) << std::endl;

    return 0;
}
```

### std::function 的典型应用：回调

```cpp
#include <iostream>
#include <functional>
#include <vector>
#include <string>

class Button {
public:
    using ClickCallback = std::function<void(const std::string&)>;

    Button(const std::string& label) : label_(label) {}

    // 注册回调
    void onClick(ClickCallback callback) {
        callback_ = callback;
    }

    // 模拟点击
    void click() {
        std::cout << "按钮 '" << label_ << "' 被点击" << std::endl;
        if (callback_) {
            callback_(label_);
        }
    }

private:
    std::string label_;
    ClickCallback callback_;
};

int main() {
    Button btn1("保存");
    Button btn2("取消");

    btn1.onClick([](const std::string& label) {
        std::cout << "  → 执行保存操作" << std::endl;
    });

    btn2.onClick([](const std::string& label) {
        std::cout << "  → 取消当前操作" << std::endl;
    });

    btn1.click();
    btn2.click();

    return 0;
}
```

## Lambda 与 STL 算法

Lambda 与 STL 算法的结合是函数式编程的核心。

### 排序

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

struct Person {
    std::string name;
    int age;
};

int main() {
    std::vector<Person> people = {
        {"Alice", 30}, {"Bob", 25}, {"Charlie", 35}, {"David", 25}
    };

    // 按年龄排序
    std::sort(people.begin(), people.end(),
        [](const Person& a, const Person& b) {
            return a.age < b.age;
        });

    std::cout << "按年龄排序:" << std::endl;
    for (const auto& p : people) {
        std::cout << "  " << p.name << " (" << p.age << ")" << std::endl;
    }

    // 按名字排序
    std::sort(people.begin(), people.end(),
        [](const Person& a, const Person& b) {
            return a.name < b.name;
        });

    return 0;
}
```

### 查找

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

int main() {
    std::vector<int> numbers = {1, 3, 5, 7, 9, 11, 13};

    // find_if：查找第一个满足条件的元素
    auto it = std::find_if(numbers.begin(), numbers.end(),
        [](int n) { return n > 6; });
    if (it != numbers.end()) {
        std::cout << "第一个大于 6 的数: " << *it << std::endl;  // 7
    }

    // count_if：统计满足条件的元素个数
    int evenCount = std::count_if(numbers.begin(), numbers.end(),
        [](int n) { return n % 2 == 0; });
    std::cout << "偶数个数: " << evenCount << std::endl;  // 0

    // all_of / any_of / none_of
    bool allPositive = std::all_of(numbers.begin(), numbers.end(),
        [](int n) { return n > 0; });
    std::cout << "所有数都为正: " << (allPositive ? "是" : "否") << std::endl;

    bool anyGreaterThan10 = std::any_of(numbers.begin(), numbers.end(),
        [](int n) { return n > 10; });
    std::cout << "有数大于 10: " << (anyGreaterThan10 ? "是" : "否") << std::endl;

    return 0;
}
```

### 变换与归约

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <numeric>

int main() {
    std::vector<int> numbers = {1, 2, 3, 4, 5};

    // transform：变换
    std::vector<int> squares(numbers.size());
    std::transform(numbers.begin(), numbers.end(), squares.begin(),
        [](int n) { return n * n; });

    std::cout << "平方: ";
    for (int n : squares) std::cout << n << " ";
    std::cout << std::endl;  // 1 4 9 16 25

    // accumulate：归约（求和）
    int sum = std::accumulate(numbers.begin(), numbers.end(), 0);
    std::cout << "总和: " << sum << std::endl;  // 15

    // accumulate 配合 Lambda：自定义归约
    int product = std::accumulate(numbers.begin(), numbers.end(), 1,
        [](int acc, int n) { return acc * n; });
    std::cout << "乘积: " << product << std::endl;  // 120

    // for_each：遍历
    std::for_each(numbers.begin(), numbers.end(),
        [](int n) { std::cout << n * 2 << " "; });
    std::cout << std::endl;  // 2 4 6 8 10

    return 0;
}
```

### 过滤与组合

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <string>

int main() {
    std::vector<int> numbers = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};

    // 过滤：copy_if
    std::vector<int> evens;
    std::copy_if(numbers.begin(), numbers.end(), std::back_inserter(evens),
        [](int n) { return n % 2 == 0; });

    std::cout << "偶数: ";
    for (int n : evens) std::cout << n << " ";
    std::cout << std::endl;  // 2 4 6 8 10

    // 链式操作：过滤 → 变换 → 求和
    std::vector<int> filtered;
    std::copy_if(numbers.begin(), numbers.end(), std::back_inserter(filtered),
        [](int n) { return n > 3 && n < 9; });

    std::vector<int> transformed(filtered.size());
    std::transform(filtered.begin(), filtered.end(), transformed.begin(),
        [](int n) { return n * 10; });

    int result = std::accumulate(transformed.begin(), transformed.end(), 0);
    std::cout << "结果: " << result << std::endl;  // (4+5+6+7+8)*10 = 300

    return 0;
}
```

## 常见陷阱与最佳实践

### 陷阱 1：悬垂引用捕获

```cpp
#include <functional>

std::function<int()> createCounter() {
    int count = 0;
    return [&count]() {  // 危险！count 是局部变量
        return ++count;
    };
    // count 在此处被销毁，返回的 Lambda 包含悬垂引用
}

// 正确做法：按值捕获 + mutable
std::function<int()> createCounterSafe() {
    int count = 0;
    return [count]() mutable {
        return ++count;
    };
}
```

### 陷阱 2：隐式捕获所有变量

```cpp
// 不推荐：隐式捕获所有变量，不清楚 Lambda 依赖什么
auto bad = [=] { return x + y + z; };

// 推荐：显式列出需要的变量
auto good = [x, y, z] { return x + y + z; };
```

### 最佳实践

1. **优先显式捕获，避免 `[=]` 和 `[&]`**
2. **短 Lambda 用 `[]`，复杂 Lambda 考虑命名函数**
3. **Lambda 体超过 3-5 行时，考虑提取为独立函数**
4. **需要存储 Lambda 时用 `std::function`，传参时用模板**
5. **注意捕获对象的生命周期，避免悬垂引用**

## 练习

1. 用 Lambda 和 `std::sort` 对一个 `std::vector<std::string>` 按字符串长度排序。

2. 用 `std::transform` 将一个 `vector<int>` 中所有负数变为 0，正数保持不变。

3. 实现一个通用的 `filter` 函数模板，接受容器和 Lambda 谓词，返回过滤后的新容器。

4. 用 `std::accumulate` 和 Lambda 计算一个 `vector<pair<string, int>>` 中所有 int 值的总和。

5. 创建一个事件系统，使用 `std::vector<std::function<void()>>` 存储多个回调函数。

## 参考链接

- [Lambda 表达式 - cppreference](https://en.cppreference.com/w/cpp/language/lambda)
- [std::function - cppreference](https://en.cppreference.com/w/cpp/utility/functional/function)
- [std::sort - cppreference](https://en.cppreference.com/w/cpp/algorithm/sort)
- [std::transform - cppreference](https://en.cppreference.com/w/cpp/algorithm/transform)
- [std::accumulate - cppreference](https://en.cppreference.com/w/cpp/algorithm/accumulate)
- [C++ Core Guidelines: F.50 - cppreference](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rf-lambda)
