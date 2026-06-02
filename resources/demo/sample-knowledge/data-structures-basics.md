# Data Structures Basics

## 1. Array (数组)

Arrays are the most fundamental data structure. They store elements in contiguous memory locations, allowing O(1) random access by index.

**Key properties:**

- Fixed size (in static arrays) or dynamic size (in dynamic arrays)
- O(1) access by index
- O(n) insertion/deletion in the middle
- O(1) amortized append at the end (dynamic arrays)

**Common patterns:**

- Two pointers (e.g., left/right from both ends)
- Sliding window
- Prefix sum

**Example (Python):**

```python
# Dynamic array operations
arr = [1, 2, 3]
arr.append(4)       # O(1) amortized
arr.pop()           # O(1)
arr.insert(0, 0)    # O(n) - shifts all elements
```

## 2. Hash Table (哈希表)

Hash tables provide average O(1) lookup, insertion, and deletion by mapping keys to array indices via a hash function.

**Key properties:**

- Average O(1) for get/put/delete
- Worst case O(n) due to collisions
- Unordered (in most implementations)

**Common patterns:**

- Frequency counting
- Two Sum pattern (complement lookup)
- Grouping (anagrams, categories)

**Example (Python):**

```python
from collections import defaultdict

# Frequency counter
counter = defaultdict(int)
for word in words:
    counter[word] += 1

# Two Sum pattern
seen = {}
for i, num in enumerate(nums):
    complement = target - num
    if complement in seen:
        return [seen[complement], i]
    seen[num] = i
```

## 3. Stack (栈)

A Last-In-First-Out (LIFO) data structure.

**Key operations:**

- push: O(1)
- pop: O(1)
- peek/top: O(1)

**Common patterns:**

- Matching parentheses
- Monotonic stack (next greater/smaller element)
- Expression evaluation
- DFS traversal (explicit stack)

**Example (Python):**

```python
# Valid parentheses
def is_valid(s):
    stack = []
    mapping = {')': '(', '}': '{', ']': '['}
    for char in s:
        if char in mapping:
            if not stack or stack[-1] != mapping[char]:
                return False
            stack.pop()
        else:
            stack.append(char)
    return len(stack) == 0
```

## 4. Queue (队列)

A First-In-First-Out (FIFO) data structure.

**Variants:**

- Simple queue: enqueue at back, dequeue from front
- Deque (double-ended queue): operations at both ends
- Priority queue (heap): always dequeue the highest-priority element

**Common patterns:**

- BFS traversal
- Sliding window maximum (deque)
- Task scheduling

**Example (Python):**

```python
from collections import deque

# BFS
queue = deque([start_node])
while queue:
    node = queue.popleft()
    for neighbor in node.neighbors:
        queue.append(neighbor)
```

## 5. Linked List (链表)

A linear data structure where elements are stored in nodes, each pointing to the next (singly) or both next and previous (doubly).

**Key properties:**

- O(1) insertion/deletion at known position
- O(n) access by index
- No wasted space (dynamic allocation)

**Common patterns:**

- Fast/slow pointers (cycle detection, middle node)
- Dummy head node
- Reverse in place

**Example (Python):**

```python
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

# Detect cycle
def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow == fast:
            return True
    return False
```

## 6. Binary Tree (二叉树)

A hierarchical data structure where each node has at most two children.

**Key traversals:**

- Inorder (Left, Root, Right) - gives sorted order for BST
- Preorder (Root, Left, Right) - useful for copying
- Postorder (Left, Right, Right) - useful for deletion
- Level-order (BFS)

**Common patterns:**

- Recursion (divide and conquer)
- BFS for level-order
- DFS with path tracking

## 7. Heap / Priority Queue (堆)

A complete binary tree that satisfies the heap property (min-heap or max-heap).

**Key operations:**

- Insert: O(log n)
- Extract min/max: O(log n)
- Peek: O(1)

**Common patterns:**

- Top K elements
- Merge K sorted lists
- Median finding (two heaps)
- Dijkstra's algorithm

**Example (Python):**

```python
import heapq

# Top K largest elements
def top_k(nums, k):
    return heapq.nlargest(k, nums)

# Min heap
min_heap = []
heapq.heappush(min_heap, 3)
smallest = heapq.heappop(min_heap)
```

## 8. Graph (图)

A collection of nodes (vertices) connected by edges.

**Representations:**

- Adjacency list (most common for sparse graphs)
- Adjacency matrix (better for dense graphs)

**Key algorithms:**

- BFS: shortest path in unweighted graph
- DFS: cycle detection, topological sort
- Dijkstra: shortest path in weighted graph
- Union-Find: connected components

## 9. Trie (前缀树)

A tree-like data structure for efficient string prefix operations.

**Key operations:**

- Insert: O(m) where m is word length
- Search: O(m)
- Prefix search: O(m)

**Common patterns:**

- Autocomplete
- Word search in a grid
- Longest common prefix

## 10. Union-Find (并查集)

A data structure for tracking disjoint sets and performing union/find operations.

**Key operations:**

- Find: O(alpha(n)) ~ O(1) with path compression
- Union: O(alpha(n)) ~ O(1) with union by rank

**Common patterns:**

- Connected components
- Cycle detection in undirected graphs
- Kruskal's MST algorithm

---

## Complexity Cheat Sheet

| Operation | Array | Hash Table | Stack/Queue | Linked List | BST (avg) | Heap     |
| --------- | ----- | ---------- | ----------- | ----------- | --------- | -------- |
| Access    | O(1)  | -          | -           | O(n)        | O(log n)  | -        |
| Search    | O(n)  | O(1)       | O(n)        | O(n)        | O(log n)  | O(n)     |
| Insert    | O(n)  | O(1)       | O(1)        | O(1)        | O(log n)  | O(log n) |
| Delete    | O(n)  | O(1)       | O(1)        | O(1)        | O(log n)  | O(log n) |
