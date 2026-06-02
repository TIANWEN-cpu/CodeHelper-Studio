/**
 * Two Sum - Java Solutions
 * ========================
 * Problem: Given an array of integers and a target, return indices of two numbers
 * that add up to the target.
 */
import java.util.HashMap;
import java.util.Map;

class TwoSum {

    // ============================================================
    // Solution 1: Hash Table (Optimal)
    // Time: O(n), Space: O(n)
    // ============================================================
    public int[] twoSum(int[] nums, int target) {
        // Map from value to its index
        Map<Integer, Integer> seen = new HashMap<>();

        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];

            // Check if complement exists
            if (seen.containsKey(complement)) {
                return new int[]{seen.get(complement), i};
            }

            // Store current number
            seen.put(nums[i], i);
        }

        return new int[]{};  // No solution
    }

    // ============================================================
    // Solution 2: Brute Force (for comparison)
    // Time: O(n^2), Space: O(1)
    // ============================================================
    public int[] twoSumBrute(int[] nums, int target) {
        for (int i = 0; i < nums.length; i++) {
            for (int j = i + 1; j < nums.length; j++) {
                if (nums[i] + nums[j] == target) {
                    return new int[]{i, j};
                }
            }
        }
        return new int[]{};
    }

    // ============================================================
    // Test
    // ============================================================
    public static void main(String[] args) {
        TwoSum solution = new TwoSum();

        int[] result1 = solution.twoSum(new int[]{2, 7, 11, 15}, 9);
        assert result1[0] == 0 && result1[1] == 1;

        int[] result2 = solution.twoSum(new int[]{3, 2, 4}, 6);
        assert result2[0] == 1 && result2[1] == 2;

        System.out.println("All tests passed!");
    }
}
