"""
Maximum Subarray - Python Solutions (Kadane's Algorithm)
=========================================================
Problem: Find the contiguous subarray with the largest sum.
"""

# ============================================================
# Solution 1: Kadane's Algorithm (Optimal)
# Time: O(n), Space: O(1)
# ============================================================
def max_sub_array(nums):
    """
    Kadane's algorithm: track the maximum sum ending at each position.
    At each step, decide: extend the current subarray or start a new one.
    """
    max_sum = nums[0]
    current_sum = nums[0]

    for i in range(1, len(nums)):
        # Either extend the previous subarray or start fresh
        current_sum = max(nums[i], current_sum + nums[i])
        max_sum = max(max_sum, current_sum)

    return max_sum


# ============================================================
# Solution 2: Kadane's with subarray indices
# Time: O(n), Space: O(1)
# ============================================================
def max_sub_array_with_indices(nums):
    """Returns the maximum sum along with start and end indices."""
    max_sum = nums[0]
    current_sum = nums[0]
    start = end = temp_start = 0

    for i in range(1, len(nums)):
        if nums[i] > current_sum + nums[i]:
            current_sum = nums[i]
            temp_start = i
        else:
            current_sum += nums[i]

        if current_sum > max_sum:
            max_sum = current_sum
            start = temp_start
            end = i

    return max_sum, nums[start:end + 1]


# ============================================================
# Solution 3: Divide and Conquer
# Time: O(n log n), Space: O(log n) recursion stack
# ============================================================
def max_sub_array_dc(nums):
    """
    Divide and conquer approach: split array in half, the max subarray is either:
    1. Entirely in the left half
    2. Entirely in the right half
    3. Crossing the middle
    """
    def helper(left, right):
        if left == right:
            return nums[left]

        mid = (left + right) // 2

        # Max subarray in left and right halves
        left_max = helper(left, mid)
        right_max = helper(mid + 1, right)

        # Max subarray crossing the middle
        # Left side: extend from mid to left
        left_sum = float('-inf')
        total = 0
        for i in range(mid, left - 1, -1):
            total += nums[i]
            left_sum = max(left_sum, total)

        # Right side: extend from mid+1 to right
        right_sum = float('-inf')
        total = 0
        for i in range(mid + 1, right + 1):
            total += nums[i]
            right_sum = max(right_sum, total)

        cross_sum = left_sum + right_sum

        return max(left_max, right_max, cross_sum)

    return helper(0, len(nums) - 1)


# ============================================================
# Solution 4: Prefix sum approach
# Time: O(n), Space: O(1)
# ============================================================
def max_sub_array_prefix(nums):
    """
    Track the minimum prefix sum seen so far.
    The max subarray sum = current prefix sum - minimum prefix sum.
    """
    prefix_sum = 0
    min_prefix = 0
    max_sum = float('-inf')

    for num in nums:
        prefix_sum += num
        max_sum = max(max_sum, prefix_sum - min_prefix)
        min_prefix = min(min_prefix, prefix_sum)

    return max_sum


# ============================================================
# Test
# ============================================================
if __name__ == "__main__":
    assert max_sub_array([-2, 1, -3, 4, -1, 2, 1, -5, 4]) == 6
    assert max_sub_array([1]) == 1
    assert max_sub_array([5, 4, -1, 7, 8]) == 23
    assert max_sub_array([-1]) == -1
    assert max_sub_array([-2, -1]) == -1

    # Verify all solutions agree
    test_cases = [
        [-2, 1, -3, 4, -1, 2, 1, -5, 4],
        [1],
        [5, 4, -1, 7, 8],
        [-1],
        [-2, -1],
    ]
    for nums in test_cases:
        expected = max_sub_array(nums)
        assert max_sub_array_dc(nums) == expected
        assert max_sub_array_prefix(nums) == expected

    print("All tests passed!")
