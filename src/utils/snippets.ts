/**
 * Code Snippets system.
 *
 * Provides:
 * - Language-specific templates
 * - User-defined snippets (persisted to localStorage)
 * - Tab-trigger expansion
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeSnippet {
  id: string
  name: string
  prefix: string
  language: string
  body: string
  description: string
  isBuiltin: boolean
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const USER_SNIPPETS_KEY = 'codehelper-user-snippets'

function loadUserSnippets(): CodeSnippet[] {
  try {
    const raw = localStorage.getItem(USER_SNIPPETS_KEY)
    return raw ? (JSON.parse(raw) as CodeSnippet[]) : []
  } catch {
    return []
  }
}

function saveUserSnippets(snippets: CodeSnippet[]): void {
  localStorage.setItem(USER_SNIPPETS_KEY, JSON.stringify(snippets))
}

// ---------------------------------------------------------------------------
// Built-in snippets by language
// ---------------------------------------------------------------------------

const BUILTIN_SNIPPETS: CodeSnippet[] = [
  // Python
  {
    id: 'py-main',
    name: 'Main Entry',
    prefix: 'main',
    language: 'python',
    body: 'if __name__ == "__main__":\n    ${1:pass}',
    description: 'Main entry point',
    isBuiltin: true,
  },
  {
    id: 'py-def',
    name: 'Function',
    prefix: 'def',
    language: 'python',
    body: 'def ${1:function_name}(${2:params}):\n    """${3:docstring}"""\n    ${4:pass}',
    description: 'Define a function',
    isBuiltin: true,
  },
  {
    id: 'py-class',
    name: 'Class',
    prefix: 'cls',
    language: 'python',
    body: 'class ${1:ClassName}:\n    """${2:docstring}"""\n\n    def __init__(self${3:, params}):\n        ${4:pass}',
    description: 'Define a class',
    isBuiltin: true,
  },
  {
    id: 'py-for',
    name: 'For Loop',
    prefix: 'for',
    language: 'python',
    body: 'for ${1:item} in ${2:iterable}:\n    ${3:pass}',
    description: 'For loop',
    isBuiltin: true,
  },
  {
    id: 'py-while',
    name: 'While Loop',
    prefix: 'while',
    language: 'python',
    body: 'while ${1:condition}:\n    ${2:pass}',
    description: 'While loop',
    isBuiltin: true,
  },
  {
    id: 'py-try',
    name: 'Try/Except',
    prefix: 'try',
    language: 'python',
    body: 'try:\n    ${1:pass}\nexcept ${2:Exception} as ${3:e}:\n    ${4:raise}',
    description: 'Try/except block',
    isBuiltin: true,
  },
  {
    id: 'py-listcomp',
    name: 'List Comprehension',
    prefix: 'lc',
    language: 'python',
    body: '[${1:expr} for ${2:x} in ${3:iterable}]',
    description: 'List comprehension',
    isBuiltin: true,
  },
  {
    id: 'py-dictcomp',
    name: 'Dict Comprehension',
    prefix: 'dc',
    language: 'python',
    body: '{${1:key}: ${2:value} for ${3:x} in ${4:iterable}}',
    description: 'Dict comprehension',
    isBuiltin: true,
  },
  {
    id: 'py-with',
    name: 'With Statement',
    prefix: 'with',
    language: 'python',
    body: 'with ${1:expression} as ${2:var}:\n    ${3:pass}',
    description: 'Context manager',
    isBuiltin: true,
  },
  {
    id: 'py-lambda',
    name: 'Lambda',
    prefix: 'lam',
    language: 'python',
    body: 'lambda ${1:x}: ${2:expr}',
    description: 'Lambda function',
    isBuiltin: true,
  },

  // JavaScript
  {
    id: 'js-func',
    name: 'Function',
    prefix: 'fn',
    language: 'javascript',
    body: 'function ${1:name}(${2:params}) {\n  ${3:// body}\n}',
    description: 'Function declaration',
    isBuiltin: true,
  },
  {
    id: 'js-arrow',
    name: 'Arrow Function',
    prefix: 'af',
    language: 'javascript',
    body: 'const ${1:name} = (${2:params}) => {\n  ${3:// body}\n}',
    description: 'Arrow function',
    isBuiltin: true,
  },
  {
    id: 'js-async',
    name: 'Async Function',
    prefix: 'async',
    language: 'javascript',
    body: 'async function ${1:name}(${2:params}) {\n  ${3:// body}\n}',
    description: 'Async function',
    isBuiltin: true,
  },
  {
    id: 'js-forof',
    name: 'For...of Loop',
    prefix: 'forof',
    language: 'javascript',
    body: 'for (const ${1:item} of ${2:iterable}) {\n  ${3:// body}\n}',
    description: 'For...of loop',
    isBuiltin: true,
  },
  {
    id: 'js-try',
    name: 'Try/Catch',
    prefix: 'try',
    language: 'javascript',
    body: 'try {\n  ${1:// body}\n} catch (${2:err}) {\n  ${3:console.error(err)}\n}',
    description: 'Try/catch block',
    isBuiltin: true,
  },
  {
    id: 'js-promise',
    name: 'Promise',
    prefix: 'promise',
    language: 'javascript',
    body: 'new Promise((resolve, reject) => {\n  ${1:// body}\n})',
    description: 'New Promise',
    isBuiltin: true,
  },

  // TypeScript
  {
    id: 'ts-interface',
    name: 'Interface',
    prefix: 'intf',
    language: 'typescript',
    body: 'interface ${1:Name} {\n  ${2:prop}: ${3:type}\n}',
    description: 'Interface declaration',
    isBuiltin: true,
  },
  {
    id: 'ts-type',
    name: 'Type Alias',
    prefix: 'type',
    language: 'typescript',
    body: 'type ${1:Name} = ${2:type}',
    description: 'Type alias',
    isBuiltin: true,
  },
  {
    id: 'ts-enum',
    name: 'Enum',
    prefix: 'enum',
    language: 'typescript',
    body: 'enum ${1:Name} {\n  ${2:Member} = "${3:value}"\n}',
    description: 'Enum declaration',
    isBuiltin: true,
  },

  // C++
  {
    id: 'cpp-main',
    name: 'Main',
    prefix: 'main',
    language: 'cpp',
    body: '#include <iostream>\nusing namespace std;\n\nint main() {\n    ${1:// body}\n    return 0;\n}',
    description: 'Main entry with includes',
    isBuiltin: true,
  },
  {
    id: 'cpp-class',
    name: 'Class',
    prefix: 'cls',
    language: 'cpp',
    body: 'class ${1:ClassName} {\npublic:\n    ${1:ClassName}() {}\n    ~${1:ClassName}() {}\n\nprivate:\n    ${2:int} ${3:member_};\n};',
    description: 'Class with constructor/destructor',
    isBuiltin: true,
  },
  {
    id: 'cpp-vector',
    name: 'Vector',
    prefix: 'vec',
    language: 'cpp',
    body: 'vector<${1:int}> ${2:v}',
    description: 'Vector declaration',
    isBuiltin: true,
  },

  // Java
  {
    id: 'java-main',
    name: 'Main',
    prefix: 'main',
    language: 'java',
    body: 'public class ${1:Main} {\n    public static void main(String[] args) {\n        ${2:// body}\n    }\n}',
    description: 'Main class with entry point',
    isBuiltin: true,
  },
  {
    id: 'java-sout',
    name: 'Print',
    prefix: 'sout',
    language: 'java',
    body: 'System.out.println(${1:});',
    description: 'System.out.println',
    isBuiltin: true,
  },

  // Go
  {
    id: 'go-main',
    name: 'Main',
    prefix: 'main',
    language: 'go',
    body: 'package main\n\nimport "fmt"\n\nfunc main() {\n    ${1:fmt.Println("Hello")}\n}',
    description: 'Main function',
    isBuiltin: true,
  },
  {
    id: 'go-func',
    name: 'Function',
    prefix: 'fn',
    language: 'go',
    body: 'func ${1:name}(${2:params}) ${3:returnType} {\n    ${4:// body}\n}',
    description: 'Function declaration',
    isBuiltin: true,
  },

  // Rust
  {
    id: 'rust-main',
    name: 'Main',
    prefix: 'main',
    language: 'rust',
    body: 'fn main() {\n    ${1:println!("Hello");}\n}',
    description: 'Main function',
    isBuiltin: true,
  },
  {
    id: 'rust-fn',
    name: 'Function',
    prefix: 'fn',
    language: 'rust',
    body: 'fn ${1:name}(${2:params}) -> ${3:ReturnType} {\n    ${4:// body}\n}',
    description: 'Function declaration',
    isBuiltin: true,
  },
  {
    id: 'rust-struct',
    name: 'Struct',
    prefix: 'struct',
    language: 'rust',
    body: 'struct ${1:Name} {\n    ${2:field}: ${3:Type},\n}',
    description: 'Struct declaration',
    isBuiltin: true,
  },
]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all snippets (built-in + user-defined) for a given language.
 */
export function getSnippets(language: string): CodeSnippet[] {
  const builtin = BUILTIN_SNIPPETS.filter((s) => s.language === language || s.language === '*')
  const user = loadUserSnippets().filter((s) => s.language === language || s.language === '*')
  return [...user, ...builtin]
}

/**
 * Get all available languages from built-in snippets.
 */
export function getSnippetLanguages(): string[] {
  const langs = new Set(BUILTIN_SNIPPETS.map((s) => s.language))
  for (const s of loadUserSnippets()) {
    langs.add(s.language)
  }
  return Array.from(langs).sort()
}

/**
 * Add a user-defined snippet.
 */
export function addUserSnippet(snippet: Omit<CodeSnippet, 'id' | 'isBuiltin'>): CodeSnippet {
  const newSnippet: CodeSnippet = {
    ...snippet,
    id: `user-${Date.now()}`,
    isBuiltin: false,
  }
  const snippets = loadUserSnippets()
  snippets.push(newSnippet)
  saveUserSnippets(snippets)
  return newSnippet
}

/**
 * Remove a user-defined snippet by id.
 */
export function removeUserSnippet(id: string): void {
  const snippets = loadUserSnippets().filter((s) => s.id !== id)
  saveUserSnippets(snippets)
}

/**
 * Update a user-defined snippet.
 */
export function updateUserSnippet(
  id: string,
  updates: Partial<Omit<CodeSnippet, 'id' | 'isBuiltin'>>,
): void {
  const snippets = loadUserSnippets()
  const idx = snippets.findIndex((s) => s.id === id)
  if (idx >= 0) {
    snippets[idx] = { ...snippets[idx], ...updates }
    saveUserSnippets(snippets)
  }
}

/**
 * Find a snippet by prefix match for tab-trigger expansion.
 * Returns the snippet if the word before cursor matches a snippet prefix.
 */
export function findSnippetByPrefix(prefix: string, language: string): CodeSnippet | null {
  const snippets = getSnippets(language)
  return snippets.find((s) => s.prefix === prefix) ?? null
}

/**
 * Expand a snippet body by replacing tab-stop placeholders (${1:default})
 * with their default values. Returns the expanded text.
 */
export function expandSnippetBody(body: string): string {
  // Replace ${n:default} with just the default value
  return body.replace(/\$\{(\d+):([^}]*)\}/g, (_, _num, defaultVal) => defaultVal)
}

/**
 * Get all snippet prefixes for autocomplete.
 */
export function getSnippetPrefixes(
  language: string,
): Array<{ prefix: string; description: string; body: string }> {
  return getSnippets(language).map((s) => ({
    prefix: s.prefix,
    description: s.description,
    body: s.body,
  }))
}
