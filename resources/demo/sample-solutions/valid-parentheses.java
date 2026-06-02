"""
Valid Parentheses - Java Solutions
====================================
Problem: Determine if a string of brackets is valid.
*/
import java.util.Stack;
import java.util.Map;
import java.util.HashMap;

class ValidParentheses {

    // ============================================================
    // Solution 1: Stack (Standard)
    // Time: O(n), Space: O(n)
    // ============================================================
    public boolean isValid(String s) {
        Stack<Character> stack = new Stack<>();
        Map<Character, Character> mapping = new HashMap<>();
        mapping.put(')', '(');
        mapping.put('}', '{');
        mapping.put(']', '[');

        for (char c : s.toCharArray()) {
            if (mapping.containsKey(c)) {
                // Closing bracket
                if (stack.isEmpty() || stack.peek() != mapping.get(c)) {
                    return false;
                }
                stack.pop();
            } else {
                // Opening bracket
                stack.push(c);
            }
        }

        return stack.isEmpty();
    }

    // ============================================================
    // Test
    // ============================================================
    public static void main(String[] args) {
        ValidParentheses solution = new ValidParentheses();

        assert solution.isValid("()") == true;
        assert solution.isValid("()[]{}") == true;
        assert solution.isValid("(]") == false;
        assert solution.isValid("([)]") == false;
        assert solution.isValid("{[]}") == true;

        System.out.println("All tests passed!");
    }
}
