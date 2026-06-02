"""
Valid Parentheses - C++ Solutions
===================================
Problem: Determine if a string of brackets is valid.
*/
#include <string>
#include <stack>
#include <unordered_map>
#include <cassert>

// ============================================================
// Solution 1: Stack (Standard)
// Time: O(n), Space: O(n)
// ============================================================
bool isValid(std::string s) {
    std::stack<char> st;
    std::unordered_map<char, char> mapping = {
        {')', '('}, {'}', '{'}, {']', '['}
    };

    for (char c : s) {
        if (mapping.count(c)) {
            // Closing bracket
            if (st.empty() || st.top() != mapping[c]) {
                return false;
            }
            st.pop();
        } else {
            // Opening bracket
            st.push(c);
        }
    }

    return st.empty();
}

// ============================================================
// Solution 2: Stack with size check
// Time: O(n), Space: O(n)
// ============================================================
bool isValidOptimized(std::string s) {
    if (s.size() % 2 != 0) return false;

    std::stack<char> st;

    for (char c : s) {
        if (c == '(' || c == '{' || c == '[') {
            st.push(c);
        } else {
            if (st.empty()) return false;
            if (c == ')' && st.top() != '(') return false;
            if (c == '}' && st.top() != '{') return false;
            if (c == ']' && st.top() != '[') return false;
            st.pop();
        }
    }

    return st.empty();
}

// ============================================================
// Test
// ============================================================
int main() {
    assert(isValid("()") == true);
    assert(isValid("()[]{}") == true);
    assert(isValid("(]") == false);
    assert(isValid("([)]") == false);
    assert(isValid("{[]}") == true);
    assert(isValid("") == true);
    return 0;
}
