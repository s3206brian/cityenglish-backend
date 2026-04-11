const express = require('express');
const { body, validationResult } = require('express-validator');
const { transcribeAudio } = require('../services/whisper');
const { saveSession } = require('../db/sessionRepository');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/evaluate-speech
 * 接收 Base64 音檔，呼叫 OpenAI Whisper，回傳逐字評分
 *
 * Request body:
 * {
 *   audioBase64: string,    // Base64 編碼的音檔
 *   targetPhrase: string,   // 目標短語
 *   locationId: string,     // 景點 ID（可選）
 *   userId: string,         // 使用者 ID（可選）
 * }
 */
router.post(
  '/evaluate-speech',
  [
    body('audioBase64').notEmpty().isString().withMessage('audioBase64 is required'),
    body('targetPhrase').notEmpty().isString().withMessage('targetPhrase is required'),
    body('locationId').optional().isString(),
    body('userId').optional().isString(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { audioBase64, targetPhrase, locationId, userId } = req.body;

    try {
      const { transcript, confidence, wordConfidence, missedWords, score } =
        await transcribeAudio({ audioBase64, targetPhrase });

      // 儲存練習記錄（需登入）
      let sessionId = null;
      if (userId) {
        try {
          sessionId = await saveSession({
            userId,
            locationId,
            targetPhrase,
            transcript,
            score,
            wordConfidence,
          });
        } catch (saveErr) {
          console.error('[saveSession error]', saveErr.message);
        }
      }

      return res.json({ transcript, confidence, wordConfidence, missedWords, score, sessionId });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/user-progress/:userId
 */
router.get('/user-progress/:userId', requireAuth, async (req, res, next) => {
  try {
    const { getUserProgress } = require('../db/sessionRepository');
    const progress = await getUserProgress(req.params.userId);
    res.json(progress);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
