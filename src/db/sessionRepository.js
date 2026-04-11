const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

/**
 * 儲存練習 session，並更新 word_progress
 */
async function saveSession({ userId, locationId, targetPhrase, transcript, score, wordConfidence }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      `INSERT INTO practice_sessions
         (user_id, location_id, target_phrase, transcript, score, word_confidence)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, locationId, targetPhrase, transcript, score, JSON.stringify(wordConfidence)]
    );
    const sessionId = sessionRes.rows[0].id;

    for (const { word, confidence } of wordConfidence) {
      await client.query(
        `INSERT INTO word_progress (user_id, word, location_id, attempt_count, best_confidence, last_practiced, mastered)
         VALUES ($1, $2, $3, 1, $4, NOW(), $5)
         ON CONFLICT (user_id, word) DO UPDATE SET
           attempt_count   = word_progress.attempt_count + 1,
           best_confidence = GREATEST(word_progress.best_confidence, $4),
           last_practiced  = NOW(),
           mastered        = (GREATEST(word_progress.best_confidence, $4) >= 0.85)`,
        [userId, word.toLowerCase(), locationId, confidence, confidence >= 0.85]
      );
    }

    await client.query('COMMIT');
    return sessionId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 查詢使用者練習歷程
 * 回傳：sessions（最近50筆）、wordProgress、locationScores（每個景點最高分）
 */
async function getUserProgress(userId) {
  const [sessionsRes, wordRes, locationRes] = await Promise.all([
    // 最近 50 筆練習記錄
    pool.query(
      `SELECT ps.id, ps.location_id, l.name_zh, l.name_en, l.city,
              ps.target_phrase, ps.transcript, ps.score, ps.created_at
       FROM practice_sessions ps
       LEFT JOIN locations l ON l.id = ps.location_id
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC
       LIMIT 50`,
      [userId]
    ),
    // 單字掌握度
    pool.query(
      `SELECT wp.word, wp.best_confidence, wp.attempt_count, wp.mastered,
              wp.last_practiced, wp.location_id
       FROM word_progress wp
       WHERE wp.user_id = $1
       ORDER BY wp.last_practiced DESC`,
      [userId]
    ),
    // 每個景點：最高分、練習次數、最後練習時間
    pool.query(
      `SELECT ps.location_id, l.name_zh, l.name_en, l.city,
              MAX(ps.score)          AS best_score,
              COUNT(*)               AS attempt_count,
              MAX(ps.created_at)     AS last_practiced
       FROM practice_sessions ps
       LEFT JOIN locations l ON l.id = ps.location_id
       WHERE ps.user_id = $1
       GROUP BY ps.location_id, l.name_zh, l.name_en, l.city
       ORDER BY l.city, ps.location_id`,
      [userId]
    ),
  ]);

  return {
    sessions: sessionsRes.rows,
    wordProgress: wordRes.rows,
    locationScores: locationRes.rows,
  };
}

/**
 * 城市排行榜：該城市內最高分前 20 名
 * @param {string} city  e.g. '台東' | '台南' | '花蓮'
 */
async function getCityLeaderboard(city) {
  const res = await pool.query(
    `SELECT
       au.id                                              AS user_id,
       COALESCE(au.raw_user_meta_data->>'full_name',
                au.email)                                AS display_name,
       au.raw_user_meta_data->>'avatar_url'              AS avatar_url,
       MAX(ps.score)                                     AS best_score,
       COUNT(*)::int                                     AS attempt_count,
       MAX(ps.created_at)                                AS last_practiced
     FROM practice_sessions ps
     JOIN auth.users         au ON au.id = ps.user_id
     JOIN locations           l  ON l.id  = ps.location_id
     WHERE l.city = $1
     GROUP BY au.id, au.raw_user_meta_data, au.email
     ORDER BY best_score DESC, attempt_count DESC
     LIMIT 20`,
    [city]
  );
  return res.rows;
}

module.exports = { saveSession, getUserProgress, getCityLeaderboard };
