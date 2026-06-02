# 编程基础速查表

## 变量与数据类型

### Python

```python
x = 42          # int
y = 3.14        # float
s = "hello"     # str
flag = True     # bool
lst = [1, 2, 3] # list
d = {"a": 1}    # dict
t = (1, 2)      # tuple
st = {1, 2, 3}  # set
```

### C

```c
int x = 42;
float y = 3.14f;
double z = 3.14159;
char c = 'A';
char s[] = "hello";
int arr[5] = {1, 2, 3, 4, 5};
```

### C++

```cpp
int x = 42;
double y = 3.14;
string s = "hello";
vector<int> v = {1, 2, 3};
map<string, int> m = {{"a", 1}};
set<int> st = {1, 2, 3};
```

### C#

```csharp
int x = 42;
double y = 3.14;
string s = "hello";
bool flag = true;
int[] arr = {1, 2, 3};
List<int> lst = new List<int> {1, 2, 3};
Dictionary<string, int> dict = new Dictionary<string, int>();
```

---

## 输入输出

### Python

```python
# 读一行
line = input()
# 读整数
n = int(input())
# 读一行整数
nums = list(map(int, input().split()))
# 读多行
import sys
for line in sys.stdin:
    pass
# 输出
print(result)
print(a, b, sep=" ")
```

### C

```c
int n;
scanf("%d", &n);
int nums[1000], count = 0;
while (scanf("%d", &nums[count]) == 1) count++;
printf("%d\n", result);
```

### C++

```cpp
int n;
cin >> n;
string line;
getline(cin, line);
vector<int> nums;
int val;
while (cin >> val) nums.push_back(val);
cout << result << endl;
```

### C#

```csharp
string line = Console.ReadLine();
int n = int.Parse(Console.ReadLine());
int[] nums = Console.ReadLine().Split().Select(int.Parse).ToArray();
Console.WriteLine(result);
```

---

## 常用字符串操作

| 操作   | Python               | C++                       | C#                      |
| ------ | -------------------- | ------------------------- | ----------------------- |
| 长度   | `len(s)`             | `s.length()` / `s.size()` | `s.Length`              |
| 子串   | `s[1:3]`             | `s.substr(1, 2)`          | `s.Substring(1, 2)`     |
| 查找   | `s.find("ab")`       | `s.find("ab")`            | `s.IndexOf("ab")`       |
| 分割   | `s.split(",")`       | 需手动实现                | `s.Split(',')`          |
| 连接   | `",".join(lst)`      | `+` 运算符                | `string.Join(",", arr)` |
| 替换   | `s.replace("a","b")` | 需用 `regex` 或手动       | `s.Replace("a","b")`    |
| 转大写 | `s.upper()`          | `transform` + `toupper`   | `s.ToUpper()`           |
| 去空格 | `s.strip()`          | 需手动实现                | `s.Trim()`              |

---

## 常用集合操作

### Python

```python
# 列表
lst.append(x)       # 追加
lst.sort()           # 排序
lst.reverse()       # 反转
len(lst)             # 长度

# 字典
d.get(key, default)  # 安全取值
d.keys()             # 所有键
d.values()           # 所有值

# 集合
s.add(x)             # 添加
s.discard(x)         # 删除（不报错）
s1 & s2              # 交集
s1 | s2              # 并集
```

### C++ STL

```cpp
// vector
v.push_back(x);      // 追加
v.pop_back();        // 删除末尾
v.size();            // 长度
sort(v.begin(), v.end());  // 排序
reverse(v.begin(), v.end());  // 反转

// map
m[key] = value;      // 设置
m.count(key);        // 是否存在
m.find(key);         // 查找

// 遍历
for (auto& item : v) { }
for (auto& [k, v] : m) { }
```

---

## 条件与循环

### 条件判断

```python
# Python
if x > 0:
    pass
elif x == 0:
    pass
else:
    pass

# 三元表达式
result = "yes" if condition else "no"
```

```c
// C/C++
if (x > 0) { }
else if (x == 0) { }
else { }

// 三元表达式
int result = condition ? 1 : 0;
```

### 循环

```python
# for 循环
for i in range(n):       # 0 到 n-1
for i in range(1, n+1):  # 1 到 n
for item in lst:         # 遍历

# while 循环
while condition:
    pass

# 列表推导式
squares = [x**2 for x in range(10)]
evens = [x for x in nums if x % 2 == 0]
```

```cpp
// C++ 范围 for
for (auto& item : vec) { }

// 传统 for
for (int i = 0; i < n; i++) { }

// while
while (condition) { }
```

---

## 函数定义

```python
# Python
def solve(a, b):
    return a + b

# 默认参数
def greet(name, msg="Hello"):
    return f"{msg}, {name}!"
```

```cpp
// C++
int solve(int a, int b) {
    return a + b;
}

// 引用传参
void swap(int& a, int& b) {
    int t = a; a = b; b = t;
}
```

```csharp
// C#
static int Solve(int a, int b) {
    return a + b;
}

// out 参数
static bool TryParse(string s, out int result) {
    return int.TryParse(s, out result);
}
```
