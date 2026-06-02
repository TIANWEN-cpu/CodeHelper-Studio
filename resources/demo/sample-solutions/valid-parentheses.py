"""
Valid Parentheses - Python Solutions
======================================
Problem: Determine if a string of brackets is valid.
"""

# ============================================================
# Solution 1: Stack (Standard)
# Time: O(n), Space: O(n)
# ============================================================
def is_valid(s):
    """
    Use a stack to track opening brackets.
    When we see a closing bracket, check if it matches the top of the stack.
    """
    stack = []
    mapping = {')': '(', '}': '{', ']': '['}

    for char in s:
        if char in mapping:
            # Closing bracket: check if it matches the top
            if not stack or stack[-1] != mapping[char]:
                return False
            stack.pop()
        else:
            # Opening bracket: push onto stack
            stack.append(char)

    # Valid only if all brackets were matched
    return len(stack) == 0


# ============================================================
# Solution 2: Replacement-based (clever but less efficient)
# Time: O(n^2) in worst case, Space: O(n)
# ============================================================
def is_valid_replace(s):
    """
    Repeatedly remove valid pairs until the string is empty or
    no more pairs can be removed.
    """
    while '()' in s or '{}' in s or '[]' in s:
        s = s.replace('()', '').replace('{}', '').replace('[]', '')
    return s == ''


# ============================================================
# Solution 3: Stack with early termination
# Time: O(n), Space: O(n)
# ============================================================
def is_valid_optimized(s):
    """Optimized with early termination: if remaining chars can't form pairs."""
    if len(s) % 2 != 0:
        return False  # Odd length can't be valid

    stack = []
    mapping = {')': '(', '}': '{', ']': '['}

    for char in s:
        if char in mapping:
            if not stack:
                return False  # No matching opening bracket
            if stack[-1] != mapping[char]:
                return False
            stack.pop()
        else:
            stack.append(char)

    return not stack


# ============================================================
# Test
# ============================================================
if __name__ == "__main__":
    assert is_valid("()") == True
    assert is_valid("()[]{}") == True
    assert is_valid("(]") == False
    assert is_valid("([)]") == False
    assert is_valid("{[]}") == True
    assert is_valid("") == True
    assert is_valid("(") == False
    assert is_valid(")") == False
    print("All tests passed!")
