CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT CHECK(difficulty IN ('easy','medium','hard')),
  tags TEXT DEFAULT '[]',
  languages TEXT DEFAULT '["python"]',
  examples TEXT DEFAULT '[]',
  test_cases TEXT DEFAULT '[]',
  starter_code TEXT DEFAULT '{}',
  source TEXT DEFAULT 'custom',
  tracks TEXT DEFAULT '[]',
  platform TEXT DEFAULT 'internal',
  mode TEXT DEFAULT 'oj',
  exam_style TEXT DEFAULT 'acm',
  year INTEGER,
  official_url TEXT,
  estimated_time INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER REFERENCES problems(id),
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT CHECK(status IN ('accepted','wrong_answer','compile_error','runtime_error','timeout')),
  passed_cases INTEGER DEFAULT 0,
  total_cases INTEGER DEFAULT 0,
  duration_ms INTEGER,
  execution_time_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mistakes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER REFERENCES problems(id) UNIQUE,
  error_count INTEGER DEFAULT 1,
  error_types TEXT DEFAULT '[]',
  last_wrong_code TEXT,
  correct_code TEXT,
  ai_analysis TEXT,
  review_count INTEGER DEFAULT 0,
  next_review_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  is_default INTEGER DEFAULT 0,
  task_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  model TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  file_type TEXT,
  content TEXT,
  chunk_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER REFERENCES knowledge_docs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding TEXT,
  chunk_index INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '新对话',
  system_prompt TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompt_presets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  is_builtin INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  pinned INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  confidence REAL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  event_data TEXT DEFAULT '{}',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for frequently queried columns
CREATE INDEX IF NOT EXISTS idx_problems_source ON problems(source);
CREATE INDEX IF NOT EXISTS idx_problems_platform ON problems(platform);
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_problems_mode ON problems(mode);
CREATE INDEX IF NOT EXISTS idx_submissions_problem_status ON submissions(problem_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_problem_id ON submissions(problem_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_problem_id ON mistakes(problem_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc_id ON knowledge_chunks(doc_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(session_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_enabled_pinned ON memories(enabled, pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
CREATE INDEX IF NOT EXISTS idx_memories_content_lower ON memories(lower(content));
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp);

---------------------------------------------------------------------------
-- DevLearnerAI tables (course / lesson / achievement / review tracking)
---------------------------------------------------------------------------

-- Course/Lesson progress tracking
CREATE TABLE IF NOT EXISTS lesson_progress (
  lesson_id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  module_id TEXT,
  status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed')),
  completed INTEGER DEFAULT 0,
  last_opened TEXT,
  completed_at TEXT
);

-- Lesson notes with tags and code snippets
CREATE TABLE IF NOT EXISTS lesson_notes (
  lesson_id TEXT PRIMARY KEY,
  content TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  code_snippets TEXT DEFAULT '[]',
  updated_at TEXT
);

-- Achievement definitions
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT,
  threshold INTEGER DEFAULT 1
);

-- Achievement progress tracking
CREATE TABLE IF NOT EXISTS achievement_progress (
  achievement_id TEXT PRIMARY KEY REFERENCES achievements(id),
  current_value INTEGER DEFAULT 0,
  unlocked INTEGER DEFAULT 0,
  unlocked_at TEXT
);

-- Spaced repetition schedule (SM-2 algorithm)
CREATE TABLE IF NOT EXISTS review_schedule (
  exercise_id TEXT PRIMARY KEY,
  interval_days REAL DEFAULT 1,
  ease_factor REAL DEFAULT 2.5,
  repetitions INTEGER DEFAULT 0,
  next_review TEXT,
  last_reviewed TEXT
);

-- Exercise drafts (auto-save)
CREATE TABLE IF NOT EXISTS exercise_drafts (
  exercise_id TEXT PRIMARY KEY,
  title TEXT,
  code TEXT,
  updated_at TEXT
);

-- Exercise timer/hint tracking
CREATE TABLE IF NOT EXISTS exercise_timers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id TEXT NOT NULL,
  duration_sec REAL,
  difficulty TEXT,
  recorded_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for DevLearnerAI tables
CREATE INDEX IF NOT EXISTS idx_lesson_progress_track ON lesson_progress(track_id, completed);
CREATE INDEX IF NOT EXISTS idx_review_schedule_next ON review_schedule(next_review);
CREATE INDEX IF NOT EXISTS idx_achievement_progress_unlocked ON achievement_progress(unlocked);
CREATE INDEX IF NOT EXISTS idx_exercise_timers_exercise ON exercise_timers(exercise_id);
