-- CityEnglish PostgreSQL Schema
-- 追蹤使用者發音練習進度

-- 啟用 UUID 擴充
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- 使用者表
-- =====================
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  display_name  TEXT        NOT NULL,
  email         TEXT        UNIQUE,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- 城市景點表
-- =====================
CREATE TABLE IF NOT EXISTS locations (
  id            TEXT        PRIMARY KEY,   -- e.g. 'taitung_tiehua'
  city          TEXT        NOT NULL,      -- e.g. '台東'
  name_zh       TEXT        NOT NULL,      -- 鐵花村
  name_en       TEXT        NOT NULL,      -- Tiehua Music Village
  description   TEXT,
  vocabulary    JSONB,                     -- 相關單字與例句
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- 練習 session 表
-- =====================
CREATE TABLE IF NOT EXISTS practice_sessions (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID        REFERENCES users(id) ON DELETE SET NULL,
  location_id    TEXT        REFERENCES locations(id) ON DELETE SET NULL,
  target_phrase  TEXT        NOT NULL,
  transcript     TEXT,                    -- STT 辨識結果
  score          SMALLINT    CHECK (score BETWEEN 0 AND 100),
  word_confidence JSONB,                  -- [{ word, confidence }]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_location_id ON practice_sessions(location_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON practice_sessions(created_at DESC);

-- =====================
-- 單字進度表（每個使用者 × 每個單字）
-- =====================
CREATE TABLE IF NOT EXISTS word_progress (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word            TEXT        NOT NULL,
  location_id     TEXT        REFERENCES locations(id) ON DELETE SET NULL,
  attempt_count   INT         NOT NULL DEFAULT 0,
  best_confidence FLOAT       CHECK (best_confidence BETWEEN 0 AND 1),
  last_practiced  TIMESTAMPTZ,
  mastered        BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, word)
);

CREATE INDEX IF NOT EXISTS idx_word_progress_user_id ON word_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_word_progress_mastered ON word_progress(user_id, mastered);

-- =====================
-- 更新 updated_at 的 trigger
-- =====================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_word_progress_updated_at
  BEFORE UPDATE ON word_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================
-- 初始景點資料（台東）
-- =====================
INSERT INTO locations (id, city, name_zh, name_en, description) VALUES
  ('taitung_tiehua',    '台東', '鐵花村',       'Tiehua Music Village',      '台東最具特色的文創音樂聚落'),
  ('taitung_forest',    '台東', '台東森林公園', 'Taitung Forest Park',       '市區內的珍貴綠肺，擁有琵琶湖'),
  ('taitung_zhiben',    '台東', '知本溫泉',     'Zhiben Hot Springs',        '台東知名溫泉度假區'),
  ('taitung_green_island', '台東', '綠島',      'Green Island',              '浮潛與海底溫泉著名離島'),
  ('taitung_sanxiantai', '台東', '三仙台',      'Sanxiantai',                '以八拱橋連接的珊瑚礁島嶼景點')
ON CONFLICT (id) DO NOTHING;
