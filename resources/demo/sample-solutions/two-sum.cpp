/**
 * Two Sum - C++ Solutions
 * ========================
 * Problem: Given an array of integers and a target, return indices of two numbers
 * that add up to the target.
 */
#include <vector>
#include <unordered_map>
#include <cassert>

// ============================================================
// Solution 1: Hash Table (Optimal)
// Time: O(n), Space: O(n)
// ============================================================
std::vector<int> twoSum(std::vector<int>& nums, int target) {
    // Map from value to its index
    std::unordered_map<int, int> seen;

    for (int i = 0; i < nums.size(); i++) {
        int complement = target - nums[i];

        // Check if complement exists in the map
        auto it = seen.find(complement);
        if (it != seen.end()) {
            return {it->second, i};
        }

        // Store current number and its index
        seen[nums[i]] = i;
    }

    return {};  // No solution found
}

// ============================================================
// Solution 2: Brute Force (for comparison)
// Time: O(n^2), Space: O(1)
// ============================================================
std::vector<int> twoSumBrute(std::vector<int>& nums, int target) {
    for (int i = 0; i < nums.size(); i++) {
        for (int j = i + 1; j < nums.size(); j++) {
            if (nums[i] + nums[j] == target) {
                return {i, j};
            }
        }
    }
    return {};
}

// ============================================================
// Test
// ============================================================
int main() {
    std::vector<int> nums1 = {2, 7, 11, 15};
    auto result1 = twoSum(nums1, 9);
    assert(result1[0] == 0 && result1[1] == 1);

    std::vector<int> nums2 = {3, 2, 4};
    auto result2 = twoSum(nums2, 6);
    assert(result2[0] == 1 && result2[1] == 2);

    std::vector<int> nums3 = {3, 3};
    auto result3 = twoSum(nums3, 6);
    assert(result3[0] == 0 && result3[1] == 1);

    return 0;
}
