# Common Mistakes in Coding Interviews

Learn from these frequent errors to avoid them in your next interview.

## 1. Off-By-One Errors

The most common bug in coding. Always verify your loop bounds.

```python
# WRONG: Missing the last element
for i in range(len(arr) - 1):  # skips last element
    process(arr[i])

# WRONG: Going out of bounds
for i in range(len(arr)):
    process(arr[i + 1])  # IndexError on last iteration

# CORRECT: Process all elements
for i in range(len(arr)):
    process(arr[i])

# CORRECT: Process pairs
for i in range(len(arr) - 1):
    process(arr[i], arr[i + 1])
```

**Tips:**

- Use `range(n)` for 0 to n-1
- Use `range(n-1)` when you need i+1 inside the loop
- Always mentally trace through with a small input (n=2 or n=3)

## 2. Not Handling Edge Cases

Always check these before writing your solution:

- **Empty input:** `[]`, `""`, `null`/`None`
- **Single element:** `[1]`, `"a"`
- **All same elements:** `[1,1,1]`
- **Already sorted / reverse sorted**
- **Negative numbers, zero**
- **Very large inputs** (overflow considerations)

```python
# WRONG: Doesn't handle empty list
def find_max(arr):
    max_val = arr[0]  # IndexError if empty
    for num in arr:
        max_val = max(max_val, num)
    return max_val

# CORRECT: Handle edge case
def find_max(arr):
    if not arr:
        return None
    max_val = arr[0]
    for num in arr:
        max_val = max(max_val, num)
    return max_val
```

## 3. Modifying Data While Iterating

```python
# WRONG: Modifying list during iteration
for item in my_list:
    if item < 0:
        my_list.remove(item)  # Skips elements!

# CORRECT: Create new list
my_list = [item for item in my_list if item >= 0]

# CORRECT: Iterate over copy
for item in my_list[:]:
    if item < 0:
        my_list.remove(item)
```

## 4. Integer Overflow

In languages like Java and C++, integers have fixed size. Python handles big integers automatically.

```java
// WRONG: Integer overflow in Java
int mid = (left + right) / 2;  // Can overflow if left + right > Integer.MAX_VALUE

// CORRECT: Safe midpoint
int mid = left + (right - left) / 2;
```

## 5. Forgetting to Update State

```python
# WRONG: Infinite loop - forgot to update left/right
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid  # BUG: should be mid + 1
        else:
            right = mid  # BUG: should be mid - 1

# CORRECT:
def binary_search(arr, target):
    left, right = 0, len(arr) - 1
    while left <= right:
        mid = (left + right) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1
```

## 6. Using Wrong Data Structure

```python
# SLOW: O(n) lookup in list
seen = []
for num in nums:
    if num in seen:  # O(n) each time!
        return True
    seen.append(num)

# FAST: O(1) lookup in set
seen = set()
for num in nums:
    if num in seen:  # O(1) average
        return True
    seen.add(num)
```

**Guide:**

- Need fast lookup? Use `set` or `dict`
- Need ordered data? Use sorted array or BST
- Need min/max? Use heap
- Need FIFO? Use `deque`
- Need LIFO? Use `list` as stack

## 7. Not Considering Time Complexity

```python
# TOO SLOW: O(n^2) for finding duplicates
def has_duplicates(arr):
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            if arr[i] == arr[j]:
                return True
    return False

# FAST: O(n) using set
def has_duplicates(arr):
    seen = set()
    for num in arr:
        if num in seen:
            return True
        seen.add(num)
    return False
```

## 8. Recursive Stack Overflow

```python
# DANGEROUS: Can cause stack overflow for large inputs
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# BETTER: Memoized
from functools import lru_cache

@lru_cache(maxsize=None)
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

# BEST: Iterative
def fibonacci(n):
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
```

## 9. Shallow vs Deep Copy

```python
# WRONG: Shallow copy - both reference same inner lists
grid = [[0] * 3] * 3
grid[0][0] = 1
print(grid)  # [[1, 0, 0], [1, 0, 0], [1, 0, 0]] - all rows changed!

# CORRECT: Deep copy
grid = [[0] * 3 for _ in range(3)]
grid[0][0] = 1
print(grid)  # [[1, 0, 0], [0, 0, 0], [0, 0, 0]] - only first row changed
```

## 10. String Immutability

```python
# WRONG: Strings are immutable in Python
s = "hello"
s[0] = "H"  # TypeError!

# CORRECT: Convert to list
chars = list(s)
chars[0] = "H"
s = "".join(chars)

# CORRECT: Create new string
s = "H" + s[1:]
```

## 11. Hash Map Key Issues

```python
# WRONG: List can't be a dict key (unhashable)
memo = {}
memo[[1, 2, 3]] = "value"  # TypeError!

# CORRECT: Use tuple as key
memo = {}
memo[(1, 2, 3)] = "value"

# CORRECT: Use frozenset for unordered collection
memo = {}
memo[frozenset([1, 2, 3])] = "value"
```

## 12. Comparison Pitfalls

```python
# Comparing None with integers
# Python 3: TypeError for None < 5
# Always check for None first

# Float comparison
# WRONG: Direct comparison
if a == b:  # Fails for 0.1 + 0.2 == 0.3

# CORRECT: Epsilon comparison
EPSILON = 1e-9
if abs(a - b) < EPSILON:
    # approximately equal
```

## Pre-Submission Checklist

Before submitting your solution, verify:

1. [ ] Edge cases handled (empty, single element, duplicates)
2. [ ] No off-by-one errors (trace through with small input)
3. [ ] Correct data structure for required operations
4. [ ] No infinite loops (all pointers/indices updated)
5. [ ] Time complexity meets the requirement
6. [ ] Space complexity is acceptable
7. [ ] Return type matches expected output format
8. [ ] No mutation of input unless intended
