# Coding Interview Tips

Practical strategies for succeeding in technical coding interviews.

## Before the Interview

### Preparation Timeline

- **2-3 months out:** Learn core data structures and algorithms
- **1-2 months out:** Practice 2-3 problems daily, focus on weak areas
- **2-4 weeks out:** Do timed mock interviews
- **1 week out:** Review common patterns, rest well

### What to Study (Priority Order)

1. Arrays and Strings (Two Pointers, Sliding Window)
2. Hash Tables
3. Linked Lists
4. Trees and Graphs (BFS, DFS)
5. Dynamic Programming
6. Sorting and Searching
7. Stack and Queue
8. Backtracking

## During the Interview

### Step 1: Understand the Problem (2-3 minutes)

- Listen carefully to the problem description
- Ask clarifying questions:
  - "Can the input be empty?"
  - "Are there duplicate values?"
  - "What should I return if there's no valid answer?"
  - "Can I modify the input array?"
- Work through 1-2 small examples by hand

### Step 2: Discuss Approach (3-5 minutes)

- Start with the brute force approach
  - "The naive approach would be O(n^2) by checking all pairs..."
- Identify optimizations
  - "I notice if I use a hash table, I can reduce lookup to O(1)..."
- State time and space complexity
- Wait for interviewer approval before coding

### Step 3: Code (10-15 minutes)

- Write clean, readable code
- Use meaningful variable names
- Talk through your logic as you code
- Don't rush - correctness over speed

```python
# GOOD: Clean, readable
def two_sum(nums, target):
    seen = {}  # value -> index
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []  # No solution found

# BAD: Cryptic variable names
def f(a, t):
    d = {}
    for i, x in enumerate(a):
        if t - x in d: return [d[t-x], i]
        d[x] = i
```

### Step 4: Test (3-5 minutes)

- Walk through your code with the given examples
- Trace through edge cases
- Fix any bugs you find
  - "Let me trace through this... oh, I see an off-by-one error here..."

### Step 5: Optimize (if time allows)

- Discuss potential optimizations
- Mention trade-offs between time and space
- Consider alternative approaches

## Communication Tips

### Think Out Loud

- "I'm thinking of using a hash table because..."
- "Let me consider what happens if the array is empty..."
- "The time complexity here is O(n) because..."

### When You're Stuck

1. Start with brute force - it's better than nothing
2. Work through a small example by hand
3. Look for patterns in the examples
4. Think about what data structure would help
5. Ask the interviewer for a hint (it's okay!)

### Common Phrases

- "Let me think about this for a moment..."
- "I see two possible approaches here..."
- "Let me trace through this example..."
- "I think there might be an edge case when..."
- "Would you like me to optimize further?"

## Problem-Solving Framework

### For Any Problem:

1. **Clarify** - Understand inputs, outputs, constraints
2. **Examples** - Work through 2-3 by hand
3. **Brute Force** - State the obvious O(n^2) solution
4. **Optimize** - Find the pattern, use the right data structure
5. **Code** - Write clean implementation
6. **Test** - Verify with examples and edge cases

### For Specific Types:

**Array/String problems:**

- Consider sorting first
- Two pointers for sorted data
- Sliding window for subarray/substring

**Tree problems:**

- Think recursively (most tree problems are recursive)
- Consider BFS vs DFS based on what you need
- Use DFS for path-related problems

**Graph problems:**

- BFS for shortest path (unweighted)
- DFS for cycle detection, connected components
- Adjacency list representation

**DP problems:**

- Define the state clearly
- Write the recurrence relation
- Start with recursive + memoization
- Convert to iterative if needed

## After Coding

### Self-Review Checklist

- [ ] Does it handle the given examples?
- [ ] Does it handle edge cases?
- [ ] Is the time complexity acceptable?
- [ ] Is the code clean and readable?
- [ ] Are variable names descriptive?
- [ ] Is there any redundant code?

### Common Follow-up Questions

- "What's the time/space complexity?"
- "Can you do better?"
- "What if the input doesn't fit in memory?"
- "How would you handle this in a distributed system?"
- "What if we need to handle concurrent access?"

## Practice Strategy

### Daily Practice

1. Solve 2-3 problems (mix of difficulties)
2. Focus on one pattern per week
3. Review problems you couldn't solve
4. Time yourself (aim for 30 minutes max per problem)

### Problem Selection

- **Easy:** Build confidence, practice patterns
- **Medium:** Core interview preparation
- **Hard:** Stretch goals, challenging problems

### Mock Interviews

- Practice with a friend or use platforms like Pramp
- Simulate real conditions (45-60 minutes, talking out loud)
- Record yourself to review communication

## Day-of-Interview Tips

1. **Sleep well** the night before
2. **Eat a good meal** - your brain needs fuel
3. **Have water** nearby
4. **Test your setup** (for virtual interviews)
5. **Keep paper and pen** ready for diagrams
6. **Stay calm** - it's okay to take a moment to think
7. **Be positive** - even if you make a mistake, stay composed

## Red Flags to Avoid

- Jumping into code without understanding the problem
- Not asking any clarifying questions
- Coding in silence without explaining your thought process
- Refusing to consider the interviewer's hints
- Panicking when you get stuck
- Writing overly clever or complex code
- Not testing your solution before saying "done"

## Key Takeaways

1. **Practice deliberately** - Focus on understanding patterns, not memorizing solutions
2. **Communicate clearly** - Think out loud, explain your reasoning
3. **Start simple** - Brute force first, then optimize
4. **Test thoroughly** - Walk through examples and edge cases
5. **Stay calm** - It's a problem-solving exercise, not a test of memory
