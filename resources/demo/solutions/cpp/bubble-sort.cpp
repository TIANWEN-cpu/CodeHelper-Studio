# 冒泡排序 - C++ 题解

## 解法

```cpp
#include <iostream>
#include <vector>
#include <sstream>
using namespace std;

int main() {
    string line;
    getline(cin, line);
    istringstream iss(line);
    vector<int> nums;
    int val;
    while (iss >> val) nums.push_back(val);

    int n = nums.size();
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false;
        for (int j = 0; j < n - 1 - i; j++) {
            if (nums[j] > nums[j + 1]) {
                swap(nums[j], nums[j + 1]);
                swapped = true;
            }
        }
        if (!swapped) break;  // 优化：如果某轮没有交换，说明已有序
    }

    for (int i = 0; i < n; i++) {
        if (i > 0) cout << " ";
        cout << nums[i];
    }
    cout << endl;

    return 0;
}
```

## 核心思路
- 外层循环控制轮数（n-1 轮）
- 内层循环每轮将最大的未排序元素"冒泡"到末尾
- `swapped` 优化：某轮无交换时提前终止
- 时间复杂度: O(n^2)，空间复杂度: O(1)
