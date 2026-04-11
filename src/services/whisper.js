const { OpenAI, toFile } = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 用 Levenshtein distance 判斷兩個字是否相似
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * 比對 targetPhrase 與 transcript，產生逐字 confidence
 */
function scoreWords(targetPhrase, transcript) {
  const normalize = (s) =>
    s.toLowerCase().replace(/[^a-z\s]/g, '').trim();

  const targetWords = normalize(targetPhrase).split(/\s+/);
  const spokenWords = normalize(transcript).split(/\s+/);

  return targetWords.map((word) => {
    // 完全符合
    if (spokenWords.includes(word)) {
      return { word, confidence: 0.95 };
    }
    // 拼法相近（編輯距離 ≤ 1）
    const close = spokenWords.find((sw) => levenshtein(sw, word) <= 1);
    if (close) {
      return { word, confidence: 0.75 };
    }
    // 部分符合（長字包含短字，排除空字串誤判）
    const partial = spokenWords.find(
      (sw) => sw.length > 0 && (sw.includes(word) || word.includes(sw))
    );
    if (partial && word.length > 3) {
      return { word, confidence: 0.55 };
    }
    return { word, confidence: 0.15 };
  });
}

/**
 * 呼叫 OpenAI Whisper 轉錄音訊，並比對目標短語產生評分
 * @param {object} params
 * @param {string} params.audioBase64 - Base64 音訊
 * @param {string} params.targetPhrase - 目標短語
 * @returns {{ transcript, confidence, wordConfidence[], score, missedWords[] }}
 */
async function transcribeAudio({ audioBase64, targetPhrase }) {
  const buffer = Buffer.from(audioBase64, 'base64');
  const file = await toFile(buffer, 'audio.webm', { type: 'audio/webm' });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
    response_format: 'text',
  });

  const transcript = (typeof transcription === 'string' ? transcription : transcription.text ?? '').trim();
  console.log('[Whisper] transcript:', transcript);

  // 逐字評分
  const wordConfidence = scoreWords(targetPhrase, transcript);

  // 整體 confidence（所有字的平均）
  const avgConf = wordConfidence.reduce((s, w) => s + w.confidence, 0) / wordConfidence.length;

  // 未通過的字（confidence < 0.6）
  const missedWords = wordConfidence
    .filter((w) => w.confidence < 0.6)
    .map((w) => w.word);

  // 覆蓋率（有說到的字 / 總字數）
  const coverageRate = (wordConfidence.length - missedWords.length) / wordConfidence.length;

  // 綜合分數
  const score = Math.round((avgConf * 0.6 + coverageRate * 0.4) * 100);

  return {
    transcript,
    confidence: avgConf,
    wordConfidence,
    missedWords,
    score: Math.min(score, 100),
  };
}

module.exports = { transcribeAudio };
