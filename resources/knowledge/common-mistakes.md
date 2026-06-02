# 常见编程错误参考

## 1. 越界错误

### 数组/列表越界

```python
# 错误：下标从 0 开始
lst = [1, 2, 3]
print(lst[3])   # IndexError!

# 正确
for i in range(len(lst)):
    print(lst[i])
```

```c
// 错误：C 数组越界不报错，但行为未定义
int arr[5];
arr[5] = 10;  // 越界！未定义行为

// 正确
for (int i = 0; i < 5; i++) {
    arr[i] = i;
}
```

### 字符串末尾

```c
// 错误：忘记 '\0'
char s[4];
strcpy(s, "hello");  // 缓冲区溢出！

// 正确：预留 '\0' 空间
char s[6];
strcpy(s, "hello");  // 需要 6 字节
```

---

## 2. 整数溢出

### int 范围

```
int 范围: -2,147,483,648 ~ 2,147,483,647 (约 2x10^9)
long long 范围: 约 9x10^18
```

```c
// 错误：两数相乘溢出
int a = 100000, b = 100000;
int c = a * b;  // 溢出！

// 正确
long long c = (long long)a * b;
```

```python
# Python 无整数溢出问题（自动大整数）
# 但注意性能：大整数运算较慢
```

### 浮点精度

```python
# 错误：浮点比较
if 0.1 + 0.2 == 0.3:  # False!

# 正确：使用误差范围
import math
if abs(0.1 + 0.2 - 0.3) < 1e-9:  # True
    pass

# 或使用 decimal
from decimal import Decimal
if Decimal('0.1') + Decimal('0.2') == Decimal('0.3'):  # True
    pass
```

---

## 3. 输入输出错误

### 忘记读取所有输入

```python
# 错误：只读了一行
n = int(input())     # 读了 n
nums = input().split()  # 但没读完所有行

# 正确：确认读取所有输入
n = int(input())
for _ in range(n):
    line = input()
```

### 换行符残留

```c
// 错误：scanf 留下换行符
int n;
char s[100];
scanf("%d", &n);
scanf("%s", s);  // 可能读到 '\n'

// 正确：用空格跳过
scanf("%d\n", &n);
// 或
scanf("%d", &n);
getchar();  // 消耗换行符
```

### 输出格式错误

```python
# 错误：多余空格
print(a, b, c, end=" ")  # 末尾多空格

# 正确
print(a, b, c)
# 或
result = [str(a), str(b), str(c)]
print(" ".join(result))
```

---

## 4. 算法逻辑错误

### 二分查找边界

```python
# 错误：mid 计算可能溢出（C/C++ 中）
mid = (left + right) / 2      # 可能溢出
mid = left + (right - left) // 2  # 安全

# 错误：死循环
while left < right:
    mid = left + (right - left) // 2
    if condition:
        left = mid      # 可能死循环！
# 正确
    if condition:
        left = mid + 1  # 必须 +1
```

### 递归无终止条件

```python
# 错误：缺少基准情况
def fib(n):
    return fib(n-1) + fib(n-2)  # 无限递归！

# 正确
def fib(n):
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)
```

### 修改迭代中的集合

```python
# 错误：遍历时删除
d = {"a": 1, "b": 2, "c": 3}
for k in d:
    if d[k] < 2:
        del d[k]  # RuntimeError!

# 正确
to_remove = [k for k, v in d.items() if v < 2]
for k in to_remove:
    del d[k]
```

---

## 5. 内存管理错误（C/C++）

### 内存泄漏

```c
// 错误：分配后未释放
void func() {
    int *p = (int *)malloc(100 * sizeof(int));
    if (some_error) return;  // 泄漏！
    free(p);
}

// 正确
void func() {
    int *p = (int *)malloc(100 * sizeof(int));
    if (!p) return;
    if (some_error) { free(p); return; }
    // ... 使用 p
    free(p);
}
```

### 悬空指针

```c
// 错误：释放后继续使用
free(p);
*p = 10;  // 未定义行为！

// 正确
free(p);
p = NULL;
```

### 数组越界写入

```cpp
// 错误
vector<int> v(5);
v[10] = 1;  // 未定义行为

// 正确
v.push_back(1);  // 或 v.resize(11) 先
```

---

## 6. Python 常见陷阱

### 可变默认参数

```python
# 错误：默认参数在函数定义时求值
def add_item(item, lst=[]):
    lst.append(item)
    return lst

add_item(1)  # [1]
add_item(2)  # [1, 2]  -- 不是 [2]!

# 正确
def add_item(item, lst=None):
    if lst is None:
        lst = []
    lst.append(item)
    return lst
```

### 浅拷贝 vs 深拷贝

```python
# 错误：引用拷贝
a = [[1, 2], [3, 4]]
b = a
b[0][0] = 99  # a 也变了！

# 浅拷贝（只拷贝第一层）
b = a[:]        # 或 b = list(a)
b[0][0] = 99    # a 的内层列表仍受影响

# 深拷贝（完全独立）
import copy
b = copy.deepcopy(a)
```

### 浮点数迭代

```python
# 错误：浮点累积误差
x = 0.0
while x != 1.0:  # 可能永远不等于 1.0
    x += 0.1

# 正确
for i in range(10):
    x = i * 0.1
```

---

## 7. SQL 常见错误

### 忘记 GROUP BY

```sql
-- 错误：混合聚合和非聚合列
SELECT name, COUNT(*) FROM employees;
-- 大多数数据库报错

-- 正确
SELECT name, COUNT(*) FROM employees GROUP BY name;
```

### NULL 比较

```sql
-- 错误：NULL 不能用 = 比较
SELECT * FROM employees WHERE name = NULL;  -- 返回空！

-- 正确
SELECT * FROM employees WHERE name IS NULL;
```

### JOIN 丢失数据

```sql
-- 内连接：没有订单的客户不会出现
SELECT c.name, COUNT(o.id)
FROM customers c
JOIN orders o ON c.id = o.customer_id
GROUP BY c.name;

-- 左连接：保留所有客户
SELECT c.name, COUNT(o.id)
FROM customers c
LEFT JOIN orders o ON c.id = o.customer_id
GROUP BY c.name;
```

---

## 8. 判题常见错误

| 错误类型      | 可能原因                 | 排查方法                        |
| ------------- | ------------------------ | ------------------------------- |
| Wrong Answer  | 逻辑错误、边界未处理     | 用示例和边界值手动测试          |
| Compile Error | 语法错误、缺少头文件     | 检查错误信息，补全 import       |
| Runtime Error | 数组越界、除以零、栈溢出 | 检查特殊输入（空数组、0、负数） |
| Time Limit    | 时间复杂度过高           | 优化算法，避免 O(n^2) 以上      |
| 输出格式错    | 多余空格/换行            | 对比期望输出的每个字符          |

---

## 9. 调试技巧

### Python

```python
# 打印调试
print(f"debug: {variable=}")  # Python 3.8+ f-string 调试

# 断言
assert len(nums) > 0, "nums should not be empty"

# 边界值测试
# 空输入、单元素、负数、零、最大值
```

### C/C++

```c
// 条件编译调试
#ifdef DEBUG
printf("debug: x = %d\n", x);
#endif

// 检查 malloc 返回值
int *p = malloc(n * sizeof(int));
if (p == NULL) {
    fprintf(stderr, "malloc failed\n");
    return 1;
}
```

### 通用策略

1. **小规模手动模拟**: 用示例输入在纸上执行代码
2. **二分法定位**: 注释一半代码，确定哪部分出错
3. **边界测试**: 空集、单元素、全相同、最大/最小值
4. **逆向验证**: 用输出反推输入是否合理
