/**
 * Two Sum - JavaScript Solutions
 * ===============================
 * Problem: Given an array of integers and a target, return indices of two numbers
 * that add up to the target.
 */

// ============================================================
// Solution 1: Hash Map (Optimal)
// Time: O(n), Space: O(n)
// ============================================================
function twoSum(nums, target) {
  // Map from value to its index
  const seen = new Map();

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];

    // Check if complement exists
    if (seen.has(complement)) {
      return [seen.get(complement), i];
    }

    // Store current number and index
    seen.set(nums[i], i);
  }

  return []; // No solution found
}

// ============================================================
// Solution 2: Brute Force (for comparison)
// Time: O(n^2), Space: O(1)
// ============================================================
function twoSumBrute(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) {
        return [i, j];
      }
    }
  }
  return [];
}

// ============================================================
// Solution 3: Using Object (alternative to Map)
// Time: O(n), Space: O(n)
// ============================================================
function twoSumObj(nums, target) {
  const seen = {};
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (complement in seen) {
      return [seen[complement], i];
    }
    seen[nums[i]] = i;
  }
  return [];
}

// ============================================================
// Test
// ============================================================
console.assert(JSON.stringify(twoSum([2, 7, 11, 15], 9)) === JSON.stringify([0, 1]));
console.assert(JSON.stringify(twoSum([3, 2, 4], 6)) === JSON.stringify([1, 2]));
console.assert(JSON.stringify(twoSum([3, 3], 6)) === JSON.stringify([0, 1]));
console.log("All tests passed!");
