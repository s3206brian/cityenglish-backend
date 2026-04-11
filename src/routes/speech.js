const express = require('express');
const { body, validationResult } = require('express-validator');
const { transcribeAudio } = require('../services/googleStt');
const { saveSession } = require('../db/sessionRepository');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/evaluate-speech
 * 接收 Base64 音檔，呼叫 Google STT V2，回傳文字與 wordConfidence
 *
 * Request body:
 * {
 *   audioBase64: string,       // Base64 編碼的音檔
 *   encoding: string,          // 音訊格式，預設 'WEBM_OPUS'
 *   sampleRateHertz: number,   // 取樣率，預設 48000
 *   targetPhrase: string,      // 目標短語（用於比對準確度）
 *   locationId: string,        // 景點 ID（台東景點代號）
 *   userId: string,            // 使用者 ID（可選）
 * }
 *
 * Response:
 * {
 *   transcript: string,
 *   confidence: number,
 *   wordConfidence: [{ word: string, confidence: number }],
 *   missedWords: string[],      // 未正確發音的單字
 *   score: number,              // 0-100 綜合評分
 *   sessionId: string,
 * }
 */
router.post(
  '/evaluate-speech',
  [
    body('audioBase64')
      .notEmpty()
      .withMessage('audioBase64 is required')
      .isString()
      .withMessage('audioBase64 must be a string'),
    body('encoding')
      .optional()
      .isIn(['WEBM_OPUS', 'LINEAR16', 'FLAC', 'MP3', 'OGG_OPUS'])
      .withMessage('Invalid audio encoding'),
    body('sampleRateHertz')
      .optional()
      .isInt({ min: 8000, max: 48000 })
      .withMessage('sampleRateHertz must be between 8000 and 48000'),
    body('targetPhrase')
      .notEmpty()
      .withMessage('targetPhrase is required')
      .isString(),
    body('locationId').optional().isString(),
    body('userId').optional().isString(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      audioBase64,
      encoding = 'WEBM_OPUS',
      sampleRateHertz = 48000,
      targetPhrase,
      locationId,
      userId,
    } = req.body;

    try {
      // 呼叫 Google STT V2
      const sttResult = await transcribeAudio({
        audioBase64,
        encoding,
        sampleRateHertz,
        targetPhrase,
      });

      const { transcript, confidence, wordConfidence } = sttResult;

      // 計算錯誤單字（與 targetPhrase 比對）
      const targetWords = targetPhrase.toLowerCase().split(/\s+/);
      const missedWords = targetWords.filter((word) => {
        const matched = wordConfidence.find(
          (wc) => wc.word.toLowerCase() === word
        );
        return !matched || matched.confidence < 0.6;
      });

      // 綜合評分（0-100）
      const avgWordConf =
        wordConfidence.length > 0
          ? wordConfidence.reduce((sum, wc) => sum + wc.confidence, 0) /
            wordConfidence.length
          : 0;
      const coverageRate =
        targetWords.length > 0
          ? (targetWords.length - missedWords.length) / targetWords.length
          : 0;
      const score = Math.round((avgWordConf * 0.5 + coverageRate * 0.5) * 100);

      // 儲存練習記錄
      let sessionId = null;
      if (userId) {
        sessionId = await saveSession({
          userId,
          locationId,
          targetPhrase,
          transcript,
          score,
          wordConfidence,
        });
      }

      return res.json({
        transcript,
        confidence,
        wordConfidence,
        missedWords,
        score,
        sessionId,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/user-progress/:userId
 * 查詢使用者的練習歷程
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
