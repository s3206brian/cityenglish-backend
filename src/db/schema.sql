-- CityEnglish PostgreSQL Schema
-- 在 Supabase SQL Editor 執行此檔案

-- =====================
-- 城市景點表
-- =====================
CREATE TABLE IF NOT EXISTS locations (
  id          TEXT        PRIMARY KEY,   -- e.g. 'taitung_tiehua'
  city        TEXT        NOT NULL,
  name_zh     TEXT        NOT NULL,
  name_en     TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- 練習 session 表
-- user_id 直接對應 Supabase auth.users.id
-- =====================
CREATE TABLE IF NOT EXISTS practice_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  location_id     TEXT        REFERENCES locations(id) ON DELETE SET NULL,
  target_phrase   TEXT        NOT NULL,
  transcript      TEXT,
  score           SMALLINT    CHECK (score BETWEEN 0 AND 100),
  word_confidence JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id    ON practice_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_location   ON practice_sessions(location_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON practice_sessions(created_at DESC);

-- =====================
-- 單字進度表（每個使用者 × 每個單字）
-- =====================
CREATE TABLE IF NOT EXISTS word_progress (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word            TEXT        NOT NULL,
  location_id     TEXT        REFERENCES locations(id) ON DELETE SET NULL,
  attempt_count   INT         NOT NULL DEFAULT 0,
  best_confidence FLOAT       CHECK (best_confidence BETWEEN 0 AND 1),
  last_practiced  TIMESTAMPTZ,
  mastered        BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, word)
);

CREATE INDEX IF NOT EXISTS idx_word_progress_user    ON word_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_word_progress_mastered ON word_progress(user_id, mastered);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_word_progress_updated_at ON word_progress;
CREATE TRIGGER trg_word_progress_updated_at
  BEFORE UPDATE ON word_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================
-- Row Level Security
-- =====================
ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_progress ENABLE ROW LEVEL SECURITY;

-- 使用者只能讀寫自己的資料
DROP POLICY IF EXISTS "own sessions" ON practice_sessions;
CREATE POLICY "own sessions" ON practice_sessions
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own word progress" ON word_progress;
CREATE POLICY "own word progress" ON word_progress
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- locations 表公開讀取
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read locations" ON locations;
CREATE POLICY "public read locations" ON locations FOR SELECT USING (true);

-- =====================
-- 景點初始資料
-- =====================
INSERT INTO locations (id, city, name_zh, name_en, description) VALUES
  -- 台東
  ('taitung_tiehua',        '台東', '鐵花村',         'Tiehua Music Village',     '台東最具特色的文創音樂聚落'),
  ('taitung_forest',        '台東', '台東森林公園',   'Taitung Forest Park',      '市區內的珍貴綠肺，擁有琵琶湖'),
  ('taitung_zhiben',        '台東', '知本溫泉',       'Zhiben Hot Springs',       '台東知名溫泉度假區'),
  ('taitung_green_island',  '台東', '綠島',           'Green Island',             '浮潛與海底溫泉著名離島'),
  ('taitung_sanxiantai',    '台東', '三仙台',         'Sanxiantai',               '以八拱橋連接的珊瑚礁島嶼景點'),
  -- 台南
  ('tainan_chihkan',        '台南', '赤崁樓',         'Chihkan Tower',            '荷蘭東印度公司1653年建造的歷史堡壘'),
  ('tainan_anping',         '台南', '安平古堡',       'Anping Fort',              '台灣最古老的堡壘，建於1624年'),
  ('tainan_shennong',       '台南', '神農街',         'Shennong Street',          '保存完整的清朝老街，紅燈籠點綴'),
  ('tainan_confucius',      '台南', '台南孔廟',       'Tainan Confucius Temple',  '台灣首學，建於1665年'),
  ('tainan_garden_night_market', '台南', '花園夜市', 'Garden Night Market',       '台灣最大夜市之一，逾400個攤位'),
  -- 花蓮
  ('hualien_taroko',        '花蓮', '太魯閣國家公園', 'Taroko National Park',     '立霧溪侵蝕大理石峽谷的自然奇觀'),
  ('hualien_qixingtan',     '花蓮', '七星潭',         'Qixingtan Beach',          '新月形礫石海灘，太平洋壯闊景色'),
  ('hualien_pine_garden',   '花蓮', '松園別館',       'Pine Garden',              '日式殖民別墅，百年松林環繞'),
  ('hualien_dongdamen',     '花蓮', '東大門夜市',     'Dongdamen Night Market',   '花蓮最大夜市，原住民風味小吃'),
  ('hualien_liyu_lake',     '花蓮', '鯉魚潭',         'Liyu Lake',                '台灣東部最大淡水湖，山水倒影如畫')
ON CONFLICT (id) DO UPDATE
  SET name_zh = EXCLUDED.name_zh,
      name_en = EXCLUDED.name_en,
      description = EXCLUDED.description;
