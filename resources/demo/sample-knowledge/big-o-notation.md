# Big-O Notation Guide

Big-O notation describes the upper bound of an algorithm's time or space complexity as input size grows. It helps you compare algorithms and predict performance.

## Why Big-O Matters

When your input grows from 100 to 1,000,000 elements:

- O(log n) goes from ~7 to ~20 operations
- O(n) goes from 100 to 1,000,000 operations
- O(n^2) goes from 10,000 to 1,000,000,000,000 operations

Choosing the right algorithm can mean the difference between milliseconds and hours.

## Common Complexities (Best to Worst)

### O(1) - Constant Time

The operation takes the same time regardless of input size.

```python
# Array access by index
arr[5]  # Always O(1)

# Hash table lookup
hash_map["key"]  # Average O(1)

# Stack push/pop
stack.append(x)  # O(1)
stack.pop()      # O(1)
```

### O(log n) - Logarithmic Time

The problem size is halved at each step.

```python
# Binary search
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

# Balanced BST operations
# Heap insert/extract
```

### O(n) - Linear Time

Must examine each element once (or a constant number of times).

```python
# Array traversal
for num in nums:
    print(num)

# Two-pointer approach (each pointer moves at most n times)
# Sliding window (each element enters/leaves window once)
```

### O(n log n) - Linearithmic Time

Divide and conquer with linear merge/combine step.

```python
# Merge sort
# Quick sort (average case)
# Heap sort
# Sorting-based algorithms (most built-in sorts)
```

### O(n^2) - Quadratic Time

Nested loops over the input.

```python
# Brute force pair comparison
for i in range(n):
    for j in range(i + 1, n):
        process(arr[i], arr[j])

# Bubble sort, Insertion sort (worst case)
```

### O(2^n) - Exponential Time

Recursive algorithms that explore all subsets.

```python
# Fibonacci (naive recursive)
def fib(n):
    if n <= 1:
        return n
    return fib(n-1) + fib(n-2)

# Generating all subsets
# Brute force on all subsets
```

### O(n!) - Factorial Time

Generating all permutations.

```python
# Brute force TSP
# Generating all permutations
```

## Space Complexity

Space complexity measures additional memory used (beyond the input).

```python
# O(1) space - in-place
def reverse(arr):
    left, right = 0, len(arr) - 1
    while left < right:
        arr[left], arr[right] = arr[right], arr[left]
        left += 1
        right -= 1

# O(n) space - creating new data structure
def duplicate(arr):
    return [x for x in arr for _ in range(2)]

# O(n) space - recursion stack (worst case for skewed tree)
def max_depth(node):
    if not node:
        return 0
    return 1 + max(max_depth(node.left), max_depth(node.right))
```

## Analyzing Recursive Algorithms

### Master Theorem

For recurrences of the form T(n) = aT(n/b) + O(n^d):

- If a < b^d: T(n) = O(n^d)
- If a = b^d: T(n) = O(n^d \* log n)
- If a > b^d: T(n) = O(n^(log_b a))

**Examples:**

- Binary search: T(n) = T(n/2) + O(1) => O(log n)
- Merge sort: T(n) = 2T(n/2) + O(n) => O(n log n)
- Naive fibonacci: T(n) = 2T(n-1) + O(1) => O(2^n)

## Amortized Analysis

Some operations are occasionally expensive but cheap on average.

**Dynamic array append:**

- Most appends: O(1)
- When resizing: O(n) (copy all elements)
- Amortized: O(1) because resize happens rarely (every time size doubles)

## Common Pitfalls

### 1. Hidden Costs

```python
# String concatenation in a loop - O(n^2) total, not O(n)!
result = ""
for s in strings:
    result += s  # Creates new string each time

# Better: O(n)
result = "".join(strings)
```

### 2. Nested Loop but Not O(n^2)

```python
# Two pointers on same array - O(n) not O(n^2)
left, right = 0, len(arr) - 1
while left < right:
    # Each pointer moves at most n times total
    if condition:
        left += 1
    else:
        right -= 1
```

### 3. Sorting Cost

```python
# This is O(n log n), not O(n)!
def find_duplicates(arr):
    arr.sort()  # O(n log n)
    for i in range(1, len(arr)):  # O(n)
        if arr[i] == arr[i-1]:
            return arr[i]
```

## Quick Reference Table

| n         | O(log n) | O(n)      | O(n log n) | O(n^2)         | O(2^n) |
| --------- | -------- | --------- | ---------- | -------------- | ------ |
| 10        | 3        | 10        | 33         | 100            | 1,024  |
| 100       | 7        | 100       | 664        | 10,000         | 1.3e30 |
| 1,000     | 10       | 1,000     | 9,966      | 1,000,000      | -      |
| 10,000    | 13       | 10,000    | 132,877    | 100,000,000    | -      |
| 100,000   | 17       | 100,000   | 1,660,964  | 10,000,000,000 | -      |
| 1,000,000 | 20       | 1,000,000 | 19,931,569 | -              | -      |

**Rule of thumb:** For n up to ~20, O(2^n) is feasible. For n up to ~500, O(n^3) might work. For n up to ~10^6, O(n log n) is the practical limit.
