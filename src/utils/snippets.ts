export type Snippet = {
  id: string
  name: string
  prefix: string
  language: string
  body: string
  description: string
  isBuiltin: boolean
}

const STORAGE_KEY = 'codehelper-user-snippets'

const BUILTIN_SNIPPETS: Snippet[] = [
  {
    id: 'py-main',
    name: 'Main Entry',
    prefix: 'main',
    language: 'python',
    body: 'def main():\n    ${1:pass}\n\nif __name__ == "__main__":\n    main()',
    description: 'Python main function',
    isBuiltin: true,
  },
  {
    id: 'js-arrow',
    name: 'Arrow Function',
    prefix: 'af',
    language: 'javascript',
    body: 'const ${1:name} = (${2:args}) => {\n  ${3:// code}\n}',
    description: 'JavaScript arrow function',
    isBuiltin: true,
  },
  {
    id: 'js-main',
    name: 'JavaScript main',
    prefix: 'main',
    language: 'javascript',
    body: 'function main() {\n  ${1:// code}\n}\nmain()',
    description: 'JavaScript main function',
    isBuiltin: true,
  },
  {
    id: 'ts-interface',
    name: 'Interface',
    prefix: 'intf',
    language: 'typescript',
    body: 'interface ${1:Name} {\n  ${2:key}: ${3:string}\n}',
    description: 'TypeScript interface',
    isBuiltin: true,
  },
  {
    id: 'ts-main',
    name: 'TypeScript main',
    prefix: 'main',
    language: 'typescript',
    body: 'function main(): void {\n  ${1:// code}\n}\nmain()',
    description: 'TypeScript main function',
    isBuiltin: true,
  },
  {
    id: 'cpp-class',
    name: 'Class',
    prefix: 'cls',
    language: 'cpp',
    body: 'class ${1:Name} {\npublic:\n  ${1:Name}() {}\n};',
    description: 'C++ class',
    isBuiltin: true,
  },
  {
    id: 'cpp-main',
    name: 'C++ main',
    prefix: 'main',
    language: 'cpp',
    body: '#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n  ${1:return 0;}\n}',
    description: 'C++ main function',
    isBuiltin: true,
  },
  {
    id: 'java-main',
    name: 'Java main',
    prefix: 'main',
    language: 'java',
    body: 'public class Main {\n  public static void main(String[] args) {\n    ${1:// code}\n  }\n}',
    description: 'Java main class',
    isBuiltin: true,
  },
  {
    id: 'go-main',
    name: 'Go main',
    prefix: 'main',
    language: 'go',
    body: 'package main\n\nfunc main() {\n\t${1:// code}\n}',
    description: 'Go main function',
    isBuiltin: true,
  },
  {
    id: 'go-function',
    name: 'Function',
    prefix: 'fn',
    language: 'go',
    body: 'func ${1:name}(${2:args}) ${3:returnType} {\n\t${4:// code}\n}',
    description: 'Go function',
    isBuiltin: true,
  },
  {
    id: 'rs-main',
    name: 'Rust main',
    prefix: 'main',
    language: 'rust',
    body: 'fn main() {\n    ${1:// code}\n}',
    description: 'Rust main function',
    isBuiltin: true,
  },
  {
    id: 'rs-struct',
    name: 'Struct',
    prefix: 'struct',
    language: 'rust',
    body: 'struct ${1:Name} {\n    ${2:field}: ${3:String},\n}',
    description: 'Rust struct',
    isBuiltin: true,
  },
]

function loadUserSnippets(): Snippet[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as Snippet[]
  } catch {
    return []
  }
}

function saveUserSnippets(snippets: Snippet[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets))
}

export function getSnippets(language: string): Snippet[] {
  return [...loadUserSnippets(), ...BUILTIN_SNIPPETS].filter(
    (snippet) => snippet.language === language,
  )
}

export function getSnippetLanguages(): string[] {
  return [
    ...new Set([...BUILTIN_SNIPPETS, ...loadUserSnippets()].map((snippet) => snippet.language)),
  ].sort()
}

export function addUserSnippet(input: Omit<Snippet, 'id' | 'isBuiltin'>): Snippet {
  const snippets = loadUserSnippets()
  const snippet: Snippet = {
    ...input,
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isBuiltin: false,
  }
  saveUserSnippets([snippet, ...snippets])
  return snippet
}

export function removeUserSnippet(id: string): void {
  saveUserSnippets(loadUserSnippets().filter((snippet) => snippet.id !== id))
}

export function updateUserSnippet(
  id: string,
  patch: Partial<Omit<Snippet, 'id' | 'isBuiltin'>>,
): void {
  saveUserSnippets(
    loadUserSnippets().map((snippet) => (snippet.id === id ? { ...snippet, ...patch } : snippet)),
  )
}

export function findSnippetByPrefix(prefix: string, language: string): Snippet | null {
  return getSnippets(language).find((snippet) => snippet.prefix === prefix) ?? null
}

export function expandSnippetBody(body: string): string {
  return body.replace(/\$\{(\d+):([\s\S]*?)\}/g, (_match, _index, value) => value)
}

export function getSnippetPrefixes(language: string) {
  return getSnippets(language).map(({ prefix, description, body }) => ({
    prefix,
    description,
    body,
  }))
}
