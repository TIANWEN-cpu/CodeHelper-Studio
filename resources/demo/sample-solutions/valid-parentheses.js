/**
 * Valid Parentheses - JavaScript Solutions
 * =========================================
 * Problem: Determine if a string of brackets is valid.
 */

// ============================================================
// Solution 1: Stack (Standard)
// Time: O(n), Space: O(n)
// ============================================================
function isValid(s) {
  const stack = [];
  const mapping = { ')': '(', '}': '{', ']': '[' };

  for (const char of s) {
    if (char in mapping) {
      // Closing bracket: check if it matches the top
      if (stack.length === 0 || stack[stack.length - 1] !== mapping[char]) {
        return false;
      }
      stack.pop();
    } else {
      // Opening bracket: push onto stack
      stack.push(char);
    }
  }

  return stack.length === 0;
}

// ============================================================
// Solution 2: Stack with early termination
// Time: O(n), Space: O(n)
// ============================================================
function isValidOptimized(s) {
  if (s.length % 2 !== 0) return false;

  const stack = [];

  for (const char of s) {
    switch (char) {
      case '(': stack.push(')'); break;
      case '{': stack.push('}'); break;
      case '[': stack.push(']'); break;
      default:
        if (stack.length === 0 || stack.pop() !== char) {
          return false;
        }
    }
  }

  return stack.length === 0;
}

// ============================================================
// Test
// ============================================================
console.assert(isValid("()") === true);
console.assert(isValid("()[]{}") === true);
console.assert(isValid("(]") === false);
console.assert(isValid("([)]") === false);
console.assert(isValid("{[]}") === true);
console.assert(isValid("") === true);
console.log("All tests passed!");
