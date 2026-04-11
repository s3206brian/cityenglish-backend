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

    // 插入 session
    const sessionRes = await client.query(
      `INSERT INTO practice_sessions
         (user_id, location_id, target_phrase, transcript, score, word_confidence)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [userId, locationId, targetPhrase, transcript, score, JSON.stringify(wordConfidence)]
    );
    const sessionId = sessionRes.rows[0].id;

    // 更新每個單字的進度
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
 */
async function getUserProgress(userId) {
  const [sessionsRes, wordRes] = await Promise.all([
    pool.query(
      `SELECT ps.id, ps.location_id, l.name_en, ps.target_phrase,
              ps.transcript, ps.score, ps.created_at
       FROM practice_sessions ps
       LEFT JOIN locations l ON l.id = ps.location_id
       WHERE ps.user_id = $1
       ORDER BY ps.created_at DESC
       LIMIT 50`,
      [userId]
    ),
    pool.query(
      `SELECT word, best_confidence, attempt_count, mastered, last_practiced
       FROM word_progress
       WHERE user_id = $1
       ORDER BY last_practiced DESC`,
      [userId]
    ),
  ]);

  return {
    sessions: sessionsRes.rows,
    wordProgress: wordRes.rows,
  };
}

module.exports = { saveSession, getUserProgress };
