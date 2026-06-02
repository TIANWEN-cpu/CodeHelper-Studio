"""
Number of Islands - Python Solutions
=======================================
Problem: Count the number of islands in a 2D grid.
An island is formed by connecting adjacent lands horizontally or vertically.
"""

# ============================================================
# Solution 1: DFS (Depth-First Search)
# Time: O(m * n), Space: O(m * n) worst case for recursion stack
# ============================================================
def num_islands_dfs(grid):
    """
    For each cell, if it's land ('1'), start DFS to mark all connected
    land as visited (flip to '0'). Count the number of DFS calls.
    """
    if not grid or not grid[0]:
        return 0

    rows, cols = len(grid), len(grid[0])
    count = 0

    def dfs(r, c):
        # Boundary check and skip water
        if r < 0 or r >= rows or c < 0 or c >= cols or grid[r][c] == '0':
            return

        # Mark as visited by sinking the island
        grid[r][c] = '0'

        # Explore all 4 directions
        dfs(r + 1, c)
        dfs(r - 1, c)
        dfs(r, c + 1)
        dfs(r, c - 1)

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                count += 1
                dfs(r, c)

    return count


# ============================================================
# Solution 2: BFS (Breadth-First Search)
# Time: O(m * n), Space: O(min(m, n))
# ============================================================
from collections import deque

def num_islands_bfs(grid):
    """
    Use BFS to explore each island. Queue-based approach avoids
    potential stack overflow for large grids.
    """
    if not grid or not grid[0]:
        return 0

    rows, cols = len(grid), len(grid[0])
    count = 0

    def bfs(r, c):
        queue = deque([(r, c)])
        grid[r][c] = '0'  # Mark as visited immediately

        while queue:
            row, col = queue.popleft()
            for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                nr, nc = row + dr, col + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == '1':
                    grid[nr][nc] = '0'  # Mark before enqueueing
                    queue.append((nr, nc))

    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                count += 1
                bfs(r, c)

    return count


# ============================================================
# Solution 3: Union Find
# Time: O(m * n * alpha(m*n)), Space: O(m * n)
# ============================================================
class UnionFind:
    """Union-Find with path compression and union by rank."""

    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.count = 0  # Number of components

    def find(self, x):
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, x, y):
        px, py = self.find(x), self.find(y)
        if px == py:
            return
        if self.rank[px] < self.rank[py]:
            px, py = py, px
        self.parent[py] = px
        if self.rank[px] == self.rank[py]:
            self.rank[px] += 1
        self.count -= 1


def num_islands_uf(grid):
    """
    Use Union-Find to group connected land cells.
    Each land cell starts as its own component, then we union adjacent lands.
    """
    if not grid or not grid[0]:
        return 0

    rows, cols = len(grid), len(grid[0])
    uf = UnionFind(rows * cols)

    # Count initial land cells
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                uf.count += 1

    # Union adjacent land cells
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == '1':
                grid[r][c] = '0'  # Avoid double-counting
                for dr, dc in [(1, 0), (0, 1)]:  # Only right and down
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == '1':
                        uf.union(r * cols + c, nr * cols + nc)

    return uf.count


# ============================================================
# Test
# ============================================================
if __name__ == "__main__":
    import copy

    grid1 = [
        ["1","1","1","1","0"],
        ["1","1","0","1","0"],
        ["1","1","0","0","0"],
        ["0","0","0","0","0"]
    ]
    assert num_islands_dfs(copy.deepcopy(grid1)) == 1

    grid2 = [
        ["1","1","0","0","0"],
        ["1","1","0","0","0"],
        ["0","0","1","0","0"],
        ["0","0","0","1","1"]
    ]
    assert num_islands_dfs(copy.deepcopy(grid2)) == 3

    grid3 = [["1"]]
    assert num_islands_dfs(copy.deepcopy(grid3)) == 1

    # Verify BFS and UF agree
    assert num_islands_bfs(copy.deepcopy(grid1)) == 1
    assert num_islands_bfs(copy.deepcopy(grid2)) == 3

    print("All tests passed!")
