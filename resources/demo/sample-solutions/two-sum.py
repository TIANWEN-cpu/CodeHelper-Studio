"""
Two Sum - Python Solutions
===========================
Problem: Given an array of integers and a target, return indices of two numbers
that add up to the target.
"""

# ============================================================
# Solution 1: Hash Table (Optimal)
# Time: O(n), Space: O(n)
# ============================================================
def two_sum_hash(nums, target):
    """
    Use a hash table to store seen numbers and their indices.
    For each number, check if its complement (target - num) exists.
    """
    seen = {}  # value -> index
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []  # No valid pair found


# ============================================================
# Solution 2: Brute Force (for comparison)
# Time: O(n^2), Space: O(1)
# ============================================================
def two_sum_brute(nums, target):
    """
    Check every pair of numbers. Simple but slow.
    """
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []


# ============================================================
# Solution 3: Two Pass Hash Table
# Time: O(n), Space: O(n)
# ============================================================
def two_sum_two_pass(nums, target):
    """
    First pass: build the hash table.
    Second pass: look for complement.
    Slightly less efficient than one-pass but clearer logic.
    """
    # First pass: build index map
    num_map = {}
    for i, num in enumerate(nums):
        num_map[num] = i

    # Second pass: find complement
    for i, num in enumerate(nums):
        complement = target - num
        if complement in num_map and num_map[complement] != i:
            return [i, num_map[complement]]
    return []


# ============================================================
# Test
# ============================================================
if __name__ == "__main__":
    assert two_sum_hash([2, 7, 11, 15], 9) == [0, 1]
    assert two_sum_hash([3, 2, 4], 6) == [1, 2]
    assert two_sum_hash([3, 3], 6) == [0, 1]
    print("All tests passed!")
