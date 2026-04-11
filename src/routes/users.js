const express = require('express');
const { body, validationResult } = require('express-validator');
const { Pool } = require('pg');
const { requireInternalSecret } = require('../middleware/auth');

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

/**
 * POST /api/users/upsert
 * 由 NextAuth 伺服器端呼叫（使用 x-internal-secret）
 * 建立或取得已存在的使用者，回傳 userId
 */
router.post(
  '/upsert',
  requireInternalSecret,
  [
    body('email').optional().isEmail(),
    body('provider').notEmpty().isString(),
    body('providerAccountId').notEmpty().isString(),
    body('name').optional().isString(),
    body('image').optional().isURL(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, provider, providerAccountId, name, image } = req.body;

    try {
      // 以 email 或 (provider + providerAccountId) 查找或建立使用者
      const result = await pool.query(
        `INSERT INTO users (display_name, email, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET
           display_name = COALESCE(EXCLUDED.display_name, users.display_name),
           avatar_url   = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
           updated_at   = NOW()
         RETURNING id`,
        [name || email || providerAccountId, email || null, image || null]
      );

      const userId = result.rows[0].id;
      return res.json({ userId });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
