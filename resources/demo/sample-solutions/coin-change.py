"""
Coin Change - Python Solutions
================================
Problem: Find the fewest number of coins to make up an amount.
"""

# ============================================================
# Solution 1: Dynamic Programming (Bottom-up)
# Time: O(amount * len(coins)), Space: O(amount)
# ============================================================
def coin_change(coins, amount):
    """
    dp[i] = minimum number of coins to make amount i.
    For each amount, try every coin and take the minimum.
    """
    if amount == 0:
        return 0

    # Initialize with amount + 1 (impossible value, acts as infinity)
    dp = [amount + 1] * (amount + 1)
    dp[0] = 0

    for i in range(1, amount + 1):
        for coin in coins:
            if coin <= i and dp[i - coin] + 1 < dp[i]:
                dp[i] = dp[i - coin] + 1

    return dp[amount] if dp[amount] <= amount else -1


# ============================================================
# Solution 2: BFS (shortest path perspective)
# Time: O(amount * len(coins)), Space: O(amount)
# ============================================================
from collections import deque

def coin_change_bfs(coins, amount):
    """
    BFS perspective: each level represents using one more coin.
    First time we reach amount 0, that's the minimum coins.
    """
    if amount == 0:
        return 0

    queue = deque([(amount, 0)])  # (remaining_amount, num_coins)
    visited = {amount}

    while queue:
        remaining, num_coins = queue.popleft()

        for coin in coins:
            new_amount = remaining - coin
            if new_amount == 0:
                return num_coins + 1
            if new_amount > 0 and new_amount not in visited:
                visited.add(new_amount)
                queue.append((new_amount, num_coins + 1))

    return -1


# ============================================================
# Solution 3: Top-down DP (Memoization)
# Time: O(amount * len(coins)), Space: O(amount)
# ============================================================
def coin_change_memo(coins, amount):
    """
    Recursive with memoization. Try each coin, recurse on remaining.
    """
    memo = {}

    def dp(remaining):
        if remaining == 0:
            return 0
        if remaining < 0:
            return -1
        if remaining in memo:
            return memo[remaining]

        min_coins = float('inf')
        for coin in coins:
            result = dp(remaining - coin)
            if result >= 0:
                min_coins = min(min_coins, result + 1)

        memo[remaining] = min_coins if min_coins != float('inf') else -1
        return memo[remaining]

    return dp(amount)


# ============================================================
# Test
# ============================================================
if __name__ == "__main__":
    assert coin_change([1, 2, 5], 11) == 3  # 5 + 5 + 1
    assert coin_change([2], 3) == -1
    assert coin_change([1], 0) == 0
    assert coin_change([1, 2, 5], 100) == 20
    assert coin_change([186, 419, 83, 408], 6249) == 20

    # Verify BFS and memo agree
    assert coin_change_bfs([1, 2, 5], 11) == 3
    assert coin_change_bfs([2], 3) == -1
    assert coin_change_memo([1, 2, 5], 11) == 3
    assert coin_change_memo([2], 3) == -1

    print("All tests passed!")
