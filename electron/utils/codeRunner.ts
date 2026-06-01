import Database from 'better-sqlite3'
import { spawn, spawnSync, execFileSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { app } from 'electron'
import { randomUUID } from 'crypto'
import { join } from 'path'

const MAX_OUTPUT_SIZE = 1024 * 1024 // 1MB
const MAX_CONCURRENT = 5
let activeProcesses = 0

const resolvedPaths = new Map<string, string>()

function resolveCommand(cmd: string): string {
  const cached = resolvedPaths.get(cmd)
  if (cached !== undefined) return cached
  try {
    const resolved = execFileSync('where', [cmd], { timeout: 5000, encoding: 'utf-8' }).trim().split(/\r?\n/)[0]
    resolvedPaths.set(cmd, resolved)
    return resolved
  } catch {
    resolvedPaths.set(cmd, cmd)
    return cmd
  }
}

export type CodeRunStage = 'compile' | 'run' | 'sql'

export interface CodeRunResult {
  stdout: string
  stderr: string
  exitCode: number
  stage: CodeRunStage
}

function getTempDir() {
  const tempDir = join(app.getPath('temp'), 'codehelper-run')
  mkdirSync(tempDir, { recursive: true })
  return tempDir
}

export async function runCodeSnippet(code: string, language: string, stdin?: string): Promise<CodeRunResult> {
  switch (language) {
    case 'python':
      return runPython(code, stdin)
    case 'c':
      return runCFamily(code, stdin, 'gcc')
    case 'cpp':
      return runCFamily(code, stdin, 'g++')
    case 'csharp':
      return runCSharp(code, stdin)
    case 'sql':
      return runSql(code)
    default:
      return { stdout: '', stderr: `不支持的语言: ${language}`, exitCode: 1, stage: 'run' }
  }
}

async function runPython(code: string, stdin?: string) {
  const file = join(getTempDir(), `main_${randomUUID()}.py`)
  writeFileSync(file, code)
  const result = await runProcess('python', [file], stdin)
  return { ...result, stage: 'run' as const }
}

async function runCFamily(code: string, stdin: string | undefined, compiler: 'gcc' | 'g++') {
  const tempDir = getTempDir()
  const uid = randomUUID()
  const ext = compiler === 'gcc' ? 'c' : 'cpp'
  const srcFile = join(tempDir, `main_${uid}.${ext}`)
  const outFile = join(tempDir, `main_${uid}.exe`)
  writeFileSync(srcFile, code)

  const compile = spawnSync(resolveCommand(compiler), [srcFile, '-o', outFile], { timeout: 10000 })
  if (compile.status !== 0) {
    return {
      stdout: '',
      stderr: String(compile.stderr ?? ''),
      exitCode: compile.status ?? 1,
      stage: 'compile' as const,
    }
  }

  const result = await runProcess(outFile, [], stdin)
  return { ...result, stage: 'run' as const }
}

async function runCSharp(code: string, stdin?: string) {
  const tempDir = getTempDir()
  const uid = randomUUID()
  const srcFile = join(tempDir, `Main_${uid}.cs`)
  const outFile = join(tempDir, `Main_${uid}.exe`)
  writeFileSync(srcFile, code)

  const compile = spawnSync(resolveCommand('csc'), ['/out:' + outFile, srcFile], { timeout: 10000 })
  if (compile.status !== 0) {
    return {
      stdout: '',
      stderr: String(compile.stderr ?? ''),
      exitCode: compile.status ?? 1,
      stage: 'compile' as const,
    }
  }

  const result = await runProcess(outFile, [], stdin)
  return { ...result, stage: 'run' as const }
}

async function runSql(code: string): Promise<CodeRunResult> {
  const db = new Database(':memory:')

  try {
    const statements = splitSqlStatements(code)
    if (statements.length === 0) {
      return { stdout: '', stderr: '', exitCode: 0, stage: 'sql' }
    }

    for (const statement of statements.slice(0, -1)) {
      db.exec(statement)
    }

    const last = statements[statements.length - 1]
    if (isQueryStatement(last)) {
      const rows = db.prepare(last).all() as Record<string, unknown>[]
      return {
        stdout: formatRows(rows),
        stderr: '',
        exitCode: 0,
        stage: 'sql',
      }
    }

    db.exec(last)
    return { stdout: '执行成功', stderr: '', exitCode: 0, stage: 'sql' }
  } catch (error) {
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
      stage: 'sql',
    }
  } finally {
    db.close()
  }
}

function splitSqlStatements(sql: string) {
  const statements: string[] = []
  let current = ''
  let quote: "'" | '"' | null = null

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]
    const next = sql[i + 1]

    if (!quote && char === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        i += 1
      }
      current += '\n'
      continue
    }

    if (char === '\'' || char === '"') {
      if (quote === char) {
        quote = null
      } else if (!quote) {
        quote = char
      }
    }

    if (char === ';' && !quote) {
      const statement = current.trim()
      if (statement) statements.push(statement)
      current = ''
      continue
    }

    current += char
  }

  const last = current.trim()
  if (last) statements.push(last)
  return statements
}

function isQueryStatement(statement: string) {
  return /^(select|with|pragma|explain)\b/i.test(statement.trim())
}

function formatRows(rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return '查询成功，结果为空'
  }
  return JSON.stringify(rows, null, 2)
}

function runProcess(
  cmd: string,
  args: string[],
  stdin?: string,
  timeout = 10000,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (activeProcesses >= MAX_CONCURRENT) {
    return Promise.resolve({
      stdout: '',
      stderr: '并发执行数量已达上限，请稍后重试',
      exitCode: 1,
    })
  }

  activeProcesses++
  return new Promise((resolve) => {
    let outputExceeded = false
    let decremented = false
    let killed = false
    const proc = spawn(resolveCommand(cmd), args)
    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      killed = true
      proc.kill()
    }, timeout)

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      if (stdout.length > MAX_OUTPUT_SIZE && !outputExceeded) {
        outputExceeded = true
        proc.kill()
      }
    })
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > MAX_OUTPUT_SIZE && !outputExceeded) {
        outputExceeded = true
        proc.kill()
      }
    })

    if (stdin) {
      proc.stdin.write(stdin)
      proc.stdin.end()
    }

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (!decremented) {
        decremented = true
        activeProcesses--
      }
      if (outputExceeded) {
        resolve({ stdout: '', stderr: '输出超过1MB限制，进程已终止', exitCode: 1 })
      } else if (killed) {
        resolve({ stdout, stderr: `执行超时（${timeout}ms），进程已终止`, exitCode: 1 })
      } else {
        resolve({ stdout, stderr, exitCode: code ?? 1 })
      }
    })
    proc.on('error', (error) => {
      clearTimeout(timer)
      if (!decremented) {
        decremented = true
        activeProcesses--
      }
      resolve({ stdout, stderr: error.message, exitCode: 1 })
    })
  })
}
