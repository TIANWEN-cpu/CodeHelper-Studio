import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { readFileSync } from 'fs'
import { join } from 'path'

let db: SqlJsDatabase

/** Helper: run a query and return rows as objects */
function queryAll(sql: string, params: unknown[] = []): Record<string, unknown>[] {
  const stmt = db.prepare(sql)
  if (params.length) stmt.bind(params as initSqlJs.BindParams)
  const rows: Record<string, unknown>[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

/** Helper: run a query and return first row or undefined */
function queryOne(sql: string, params: unknown[] = []): Record<string, unknown> | undefined {
  return queryAll(sql, params)[0]
}

beforeAll(async () => {
  const SQL = await initSqlJs()
  db = new SQL.Database()

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON')

  // Read and execute schema
  const schema = readFileSync(join(__dirname, '..', 'electron', 'db', 'schema.sql'), 'utf-8')
  db.run(schema)

  // Run ensureSchemaColumns equivalent
  const columns = queryAll('PRAGMA table_info(problems)')
  const existing = new Set(columns.map((c) => c.name as string))
  const additions = [
    { name: 'tracks', sql: "ALTER TABLE problems ADD COLUMN tracks TEXT DEFAULT '[]'" },
    { name: 'platform', sql: "ALTER TABLE problems ADD COLUMN platform TEXT DEFAULT 'internal'" },
    { name: 'mode', sql: "ALTER TABLE problems ADD COLUMN mode TEXT DEFAULT 'oj'" },
    { name: 'exam_style', sql: "ALTER TABLE problems ADD COLUMN exam_style TEXT DEFAULT 'acm'" },
    { name: 'year', sql: 'ALTER TABLE problems ADD COLUMN year INTEGER' },
    { name: 'official_url', sql: 'ALTER TABLE problems ADD COLUMN official_url TEXT' },
    { name: 'estimated_time', sql: 'ALTER TABLE problems ADD COLUMN estimated_time INTEGER' },
  ]
  for (const item of additions) {
    if (!existing.has(item.name)) {
      db.run(item.sql)
    }
  }
})

afterAll(() => {
  if (db) db.close()
})

// ─────────────────────────────────────────────
// Schema structure tests
// ─────────────────────────────────────────────

describe('DB schema: problems 表', () => {
  it('problems 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='problems'",
    )
    expect(tables).toHaveLength(1)
  })

  it('problems 表包含所有必需列', () => {
    const columns = queryAll('PRAGMA table_info(problems)')
    const names = columns.map((c) => c.name)
    expect(names).toContain('id')
    expect(names).toContain('title')
    expect(names).toContain('description')
    expect(names).toContain('difficulty')
    expect(names).toContain('tags')
    expect(names).toContain('languages')
    expect(names).toContain('examples')
    expect(names).toContain('test_cases')
    expect(names).toContain('starter_code')
    expect(names).toContain('source')
    expect(names).toContain('tracks')
    expect(names).toContain('platform')
    expect(names).toContain('mode')
    expect(names).toContain('exam_style')
    expect(names).toContain('year')
    expect(names).toContain('official_url')
    expect(names).toContain('estimated_time')
    expect(names).toContain('created_at')
  })

  it('id 列为自增主键', () => {
    const columns = queryAll('PRAGMA table_info(problems)')
    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol).toBeDefined()
    expect(idCol!.pk).toBe(1)
  })

  it('difficulty 有 CHECK 约束', () => {
    expect(() => {
      db.run(
        "INSERT INTO problems (title, description, difficulty) VALUES ('bad', 'd', 'impossible')",
      )
    }).toThrow()
  })

  it('difficulty 允许 easy/medium/hard', () => {
    db.run("INSERT INTO problems (title, description, difficulty) VALUES ('t1', 'd', 'easy')")
    db.run("INSERT INTO problems (title, description, difficulty) VALUES ('t2', 'd', 'medium')")
    db.run("INSERT INTO problems (title, description, difficulty) VALUES ('t3', 'd', 'hard')")
    const row = queryOne('SELECT COUNT(*) as c FROM problems')
    expect(row!.c).toBeGreaterThanOrEqual(3)
  })

  it('tags 默认值为空 JSON 数组', () => {
    const row = queryOne('SELECT tags FROM problems WHERE title = ?', ['t1'])
    expect(row!.tags).toBe('[]')
  })

  it('languages 默认值包含 python', () => {
    const row = queryOne('SELECT languages FROM problems WHERE title = ?', ['t1'])
    expect(JSON.parse(row!.languages as string)).toContain('python')
  })

  it('source 默认值为 custom', () => {
    const row = queryOne('SELECT source FROM problems WHERE title = ?', ['t1'])
    expect(row!.source).toBe('custom')
  })

  it('platform 默认值为 internal', () => {
    const row = queryOne('SELECT platform FROM problems WHERE title = ?', ['t1'])
    expect(row!.platform).toBe('internal')
  })

  it('mode 默认值为 oj', () => {
    const row = queryOne('SELECT mode FROM problems WHERE title = ?', ['t1'])
    expect(row!.mode).toBe('oj')
  })

  it('exam_style 默认值为 acm', () => {
    const row = queryOne('SELECT exam_style FROM problems WHERE title = ?', ['t1'])
    expect(row!.exam_style).toBe('acm')
  })

  it('created_at 自动填充', () => {
    const row = queryOne('SELECT created_at FROM problems WHERE title = ?', ['t1'])
    expect(row!.created_at).toBeTruthy()
  })
})

describe('DB schema: submissions 表', () => {
  it('submissions 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'",
    )
    expect(tables).toHaveLength(1)
  })

  it('submissions 包含所有列', () => {
    const columns = queryAll('PRAGMA table_info(submissions)')
    const names = columns.map((c) => c.name)
    expect(names).toContain('id')
    expect(names).toContain('problem_id')
    expect(names).toContain('language')
    expect(names).toContain('code')
    expect(names).toContain('status')
    expect(names).toContain('passed_cases')
    expect(names).toContain('total_cases')
    expect(names).toContain('duration_ms')
    expect(names).toContain('created_at')
  })

  it('status 有 CHECK 约束', () => {
    const prob = queryOne("SELECT id FROM problems WHERE title = ?", ['t1'])
    expect(() => {
      db.run(
        `INSERT INTO submissions (problem_id, language, code, status)
         VALUES (?, 'python', 'print(1)', 'invalid_status')`,
        [prob!.id],
      )
    }).toThrow()
  })

  it('status 允许所有合法值', () => {
    const prob = queryOne("SELECT id FROM problems WHERE title = ?", ['t1'])
    const statuses = ['accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'timeout']
    for (const status of statuses) {
      db.run(
        'INSERT INTO submissions (problem_id, language, code, status) VALUES (?,?,?,?)',
        [prob!.id, 'python', 'code', status],
      )
    }
    const row = queryOne('SELECT COUNT(*) as c FROM submissions WHERE problem_id = ?', [prob!.id])
    expect(row!.c).toBe(statuses.length)
  })

  it('problem_id 外键关联 problems 表', () => {
    const fk = queryAll('PRAGMA foreign_key_list(submissions)')
    expect(fk.some((f) => f.table === 'problems' && f.from === 'problem_id')).toBe(true)
  })

  it('passed_cases 默认值为 0', () => {
    const row = queryOne('SELECT passed_cases FROM submissions LIMIT 1')
    expect(row!.passed_cases).toBe(0)
  })
})

describe('DB schema: mistakes 表', () => {
  it('mistakes 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='mistakes'",
    )
    expect(tables).toHaveLength(1)
  })

  it('mistakes 包含所有列', () => {
    const columns = queryAll('PRAGMA table_info(mistakes)')
    const names = columns.map((c) => c.name)
    expect(names).toContain('id')
    expect(names).toContain('problem_id')
    expect(names).toContain('error_count')
    expect(names).toContain('error_types')
    expect(names).toContain('last_wrong_code')
    expect(names).toContain('correct_code')
    expect(names).toContain('ai_analysis')
    expect(names).toContain('review_count')
    expect(names).toContain('next_review_at')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
  })

  it('problem_id UNIQUE 约束', () => {
    const prob = queryOne("SELECT id FROM problems WHERE title = ?", ['t1'])
    // First insert succeeds
    db.run('INSERT INTO mistakes (problem_id, last_wrong_code) VALUES (?, ?)', [
      prob!.id,
      'bad code',
    ])
    // Second insert for same problem_id fails
    expect(() => {
      db.run('INSERT INTO mistakes (problem_id, last_wrong_code) VALUES (?, ?)', [
        prob!.id,
        'another bad code',
      ])
    }).toThrow()
  })

  it('error_count 默认值为 1', () => {
    const row = queryOne('SELECT error_count FROM mistakes LIMIT 1')
    expect(row!.error_count).toBe(1)
  })

  it('updated_at 自动填充', () => {
    const row = queryOne('SELECT updated_at FROM mistakes LIMIT 1')
    expect(row!.updated_at).toBeTruthy()
  })
})

describe('DB schema: chat_history 表', () => {
  it('chat_history 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history'",
    )
    expect(tables).toHaveLength(1)
  })

  it('role 有 CHECK 约束', () => {
    db.run("INSERT INTO chat_sessions (id, title) VALUES ('s1', 'test')")
    expect(() => {
      db.run(
        "INSERT INTO chat_history (session_id, role, content) VALUES ('s1', 'invalid_role', 'hi')",
      )
    }).toThrow()
  })

  it('role 允许 user/assistant/system', () => {
    const roles = ['user', 'assistant', 'system']
    for (const role of roles) {
      db.run('INSERT INTO chat_history (session_id, role, content) VALUES (?,?,?)', [
        's1',
        role,
        `msg from ${role}`,
      ])
    }
    const row = queryOne('SELECT COUNT(*) as c FROM chat_history WHERE session_id = ?', ['s1'])
    expect(row!.c).toBe(roles.length)
  })
})

describe('DB schema: chat_sessions 表', () => {
  it('chat_sessions 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'",
    )
    expect(tables).toHaveLength(1)
  })

  it('id 为 TEXT PRIMARY KEY', () => {
    const columns = queryAll('PRAGMA table_info(chat_sessions)')
    const idCol = columns.find((c) => c.name === 'id')
    expect(idCol).toBeDefined()
    expect(idCol!.pk).toBe(1)
  })

  it('title 默认值为 "新对话"', () => {
    db.run("INSERT INTO chat_sessions (id) VALUES ('test-session')")
    const row = queryOne('SELECT title FROM chat_sessions WHERE id = ?', ['test-session'])
    expect(row!.title).toBe('新对话')
  })

  it('system_prompt 默认值为空字符串', () => {
    const row = queryOne('SELECT system_prompt FROM chat_sessions WHERE id = ?', ['test-session'])
    expect(row!.system_prompt).toBe('')
  })
})

describe('DB schema: memories 表', () => {
  it('memories 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memories'",
    )
    expect(tables).toHaveLength(1)
  })

  it('memories 包含所有列', () => {
    const columns = queryAll('PRAGMA table_info(memories)')
    const names = columns.map((c) => c.name)
    expect(names).toContain('id')
    expect(names).toContain('content')
    expect(names).toContain('category')
    expect(names).toContain('source')
    expect(names).toContain('source_ref')
    expect(names).toContain('pinned')
    expect(names).toContain('enabled')
    expect(names).toContain('confidence')
    expect(names).toContain('created_at')
    expect(names).toContain('updated_at')
    expect(names).toContain('last_used_at')
  })

  it('category 默认值为 general', () => {
    db.run("INSERT INTO memories (content) VALUES ('test memory')")
    const row = queryOne('SELECT category FROM memories WHERE content = ?', ['test memory'])
    expect(row!.category).toBe('general')
  })

  it('source 默认值为 manual', () => {
    const row = queryOne('SELECT source FROM memories WHERE content = ?', ['test memory'])
    expect(row!.source).toBe('manual')
  })

  it('pinned 默认值为 0', () => {
    const row = queryOne('SELECT pinned FROM memories WHERE content = ?', ['test memory'])
    expect(row!.pinned).toBe(0)
  })

  it('enabled 默认值为 1', () => {
    const row = queryOne('SELECT enabled FROM memories WHERE content = ?', ['test memory'])
    expect(row!.enabled).toBe(1)
  })

  it('confidence 默认值为 1', () => {
    const row = queryOne('SELECT confidence FROM memories WHERE content = ?', ['test memory'])
    expect(row!.confidence).toBe(1)
  })
})

describe('DB schema: prompt_presets 表', () => {
  it('prompt_presets 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='prompt_presets'",
    )
    expect(tables).toHaveLength(1)
  })

  it('is_builtin 默认值为 0', () => {
    db.run("INSERT INTO prompt_presets (name, prompt) VALUES ('test preset', 'prompt text')")
    const row = queryOne('SELECT is_builtin FROM prompt_presets WHERE name = ?', ['test preset'])
    expect(row!.is_builtin).toBe(0)
  })
})

describe('DB schema: ai_configs 表', () => {
  it('ai_configs 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_configs'",
    )
    expect(tables).toHaveLength(1)
  })

  it('base_url 默认值为 OpenAI API', () => {
    const columns = queryAll('PRAGMA table_info(ai_configs)')
    const baseUrlCol = columns.find((c) => c.name === 'base_url')
    expect(baseUrlCol).toBeDefined()
    expect(baseUrlCol!.dflt_value).toContain('openai.com')
  })

  it('model 默认值为 gpt-4o', () => {
    const columns = queryAll('PRAGMA table_info(ai_configs)')
    const modelCol = columns.find((c) => c.name === 'model')
    expect(modelCol).toBeDefined()
    expect(modelCol!.dflt_value).toContain('gpt-4o')
  })
})

describe('DB schema: knowledge_docs 表', () => {
  it('knowledge_docs 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_docs'",
    )
    expect(tables).toHaveLength(1)
  })

  it('chunk_count 默认值为 0', () => {
    db.run("INSERT INTO knowledge_docs (filename) VALUES ('test.pdf')")
    const row = queryOne('SELECT chunk_count FROM knowledge_docs WHERE filename = ?', ['test.pdf'])
    expect(row!.chunk_count).toBe(0)
  })
})

describe('DB schema: knowledge_chunks 表', () => {
  it('knowledge_chunks 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_chunks'",
    )
    expect(tables).toHaveLength(1)
  })

  it('doc_id 外键关联 knowledge_docs 并级联删除', () => {
    const doc = queryOne('SELECT id FROM knowledge_docs WHERE filename = ?', ['test.pdf'])
    db.run('INSERT INTO knowledge_chunks (doc_id, content, chunk_index) VALUES (?,?,?)', [
      doc!.id,
      'chunk content',
      0,
    ])
    db.run('DELETE FROM knowledge_docs WHERE id = ?', [doc!.id])
    const row = queryOne('SELECT COUNT(*) as c FROM knowledge_chunks WHERE doc_id = ?', [doc!.id])
    expect(row!.c).toBe(0)
  })
})

describe('DB schema: settings 表', () => {
  it('settings 表存在', () => {
    const tables = queryAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'",
    )
    expect(tables).toHaveLength(1)
  })

  it('key 为主键', () => {
    const columns = queryAll('PRAGMA table_info(settings)')
    const keyCol = columns.find((c) => c.name === 'key')
    expect(keyCol).toBeDefined()
    expect(keyCol!.pk).toBe(1)
  })

  it('key 唯一约束', () => {
    db.run("INSERT INTO settings (key, value) VALUES ('theme', 'dark')")
    expect(() => {
      db.run("INSERT INTO settings (key, value) VALUES ('theme', 'light')")
    }).toThrow()
  })
})

// ─────────────────────────────────────────────
// Query pattern tests (验证 IPC 中使用的 SQL 语法)
// ─────────────────────────────────────────────

describe('DB 查询模式: problems', () => {
  it('problems-list 基础查询可执行', () => {
    const result = queryAll(
      `SELECT p.*, (SELECT COUNT(*) FROM submissions s WHERE s.problem_id = p.id AND s.status = 'accepted') as solved
       FROM problems p WHERE 1=1 ORDER BY p.id ASC`,
    )
    expect(Array.isArray(result)).toBe(true)
  })

  it('problems-list 按 difficulty 过滤', () => {
    const result = queryAll(
      'SELECT p.* FROM problems p WHERE p.difficulty = ? ORDER BY p.id ASC',
      ['easy'],
    )
    for (const row of result) {
      expect(row.difficulty).toBe('easy')
    }
  })

  it('problems-list 按 tag 模糊匹配', () => {
    const result = queryAll(
      'SELECT p.* FROM problems p WHERE p.tags LIKE ? ORDER BY p.id ASC',
      ['%sort%'],
    )
    expect(Array.isArray(result)).toBe(true)
  })

  it('problems-get 查询可执行', () => {
    const result = queryOne('SELECT * FROM problems WHERE id = ?', [1])
    expect(result === undefined || typeof result === 'object').toBe(true)
  })
})

describe('DB 查询模式: submissions', () => {
  it('problems-submissions 查询可执行', () => {
    const result = queryAll(
      'SELECT * FROM submissions WHERE problem_id = ? ORDER BY created_at DESC LIMIT 20',
      [1],
    )
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('DB 查询模式: mistakes', () => {
  it('mistakes-list 联合查询可执行', () => {
    const result = queryAll(
      `SELECT m.*, p.title, p.difficulty, p.tags
       FROM mistakes m
       JOIN problems p ON m.problem_id = p.id
       ORDER BY m.updated_at DESC`,
    )
    expect(Array.isArray(result)).toBe(true)
  })

  it('mistakes-get 联合查询可执行', () => {
    const result = queryOne(
      `SELECT m.*, p.title, p.description, p.difficulty, p.tags, p.starter_code
       FROM mistakes m
       JOIN problems p ON m.problem_id = p.id
       WHERE m.id = ?`,
      [1],
    )
    expect(result === undefined || typeof result === 'object').toBe(true)
  })
})

describe('DB 查询模式: chat', () => {
  it('chat-sessions-list 查询可执行', () => {
    const result = queryAll('SELECT * FROM chat_sessions ORDER BY updated_at DESC')
    expect(Array.isArray(result)).toBe(true)
  })

  it('chat-presets-list 查询可执行', () => {
    const result = queryAll(
      'SELECT * FROM prompt_presets ORDER BY is_builtin DESC, id ASC',
    )
    expect(Array.isArray(result)).toBe(true)
  })

  it('memories 查询可执行', () => {
    const result = queryAll(
      'SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC, id DESC',
    )
    expect(Array.isArray(result)).toBe(true)
  })
})

describe('DB 外键约束', () => {
  it('开启外键约束', () => {
    const result = queryOne('PRAGMA foreign_keys')
    expect(result!.foreign_keys).toBe(1)
  })
})
