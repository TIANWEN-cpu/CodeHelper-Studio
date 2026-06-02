# 斐波那契数列 - C++ 题解

## 解法：动态规划

```cpp
#include <iostream>
using namespace std;

int main() {
    int n;
    cin >> n;

    if (n <= 1) {
        cout << n << endl;
        return 0;
    }

    long long a = 0, b = 1;
    for (int i = 2; i <= n; i++) {
        long long temp = a + b;
        a = b;
        b = temp;
    }
    cout << b << endl;

    return 0;
}
```

## 注意事项
- 使用 `long long` 防止大数溢出（int 最大约 2x10^9，long long 约 9x10^18）
- F(50) 已经超过 int 范围
