# 两数之和 - C++ 题解

## 解法：哈希表

```cpp
#include <iostream>
#include <vector>
#include <unordered_map>
#include <sstream>
using namespace std;

int main() {
    int n;
    cin >> n;
    cin.ignore();

    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];

    int target;
    cin >> target;

    unordered_map<int, int> hash_map;
    for (int i = 0; i < n; i++) {
        int complement = target - nums[i];
        if (hash_map.count(complement)) {
            cout << hash_map[complement] << " " << i << endl;
            break;
        }
        hash_map[nums[i]] = i;
    }

    return 0;
}
```

## C++ 特有知识点
- `unordered_map` 底层是哈希表，查找 O(1)
- `count()` 检查键是否存在
- 相比 `map`（红黑树，O(log n)），`unordered_map` 更适合只查不排序的场景
