const speech = require('@google-cloud/speech');

// Google STT V2 client
const client = new speech.SpeechClient({
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  // 若有設定 GOOGLE_APPLICATION_CREDENTIALS 環境變數，SDK 會自動讀取
});

const RECOGNIZER_ID = 'cityenglish-recognizer';
const LOCATION = 'global';

/**
 * 呼叫 Google Speech-to-Text V2 API
 * @param {object} params
 * @param {string} params.audioBase64   - Base64 編碼的音訊資料
 * @param {string} params.encoding      - 音訊格式 (WEBM_OPUS, LINEAR16, ...)
 * @param {number} params.sampleRateHertz
 * @param {string} params.targetPhrase  - 目標短語（用於 speech_context boost）
 * @returns {{ transcript, confidence, wordConfidence[] }}
 */
async function transcribeAudio({
  audioBase64,
  encoding = 'WEBM_OPUS',
  sampleRateHertz = 48000,
  targetPhrase = '',
}) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID environment variable is not set');
  }

  // 建立辨識器名稱 (V2 格式)
  const recognizerName = `projects/${projectId}/locations/${LOCATION}/recognizers/_`;

  const request = {
    recognizer: recognizerName,
    config: {
      languageCodes: ['en-US'],
      model: 'long',               // 支援 wordConfidence 的模型
      features: {
        enableWordConfidence: true,
        enableWordTimeOffsets: false,
        profanityFilter: false,
        enableAutomaticPunctuation: true,
      },
      // 針對景點名稱給予提示，提高辨識準確度
      speechContexts: targetPhrase
        ? [
            {
              phrases: targetPhrase.split(/\s+/),
              boost: 15,
            },
          ]
        : [],
      autoDecodingConfig: {},      // V2 auto 解碼（依 encoding 欄位判斷）
    },
    configMask: {
      paths: ['language_codes', 'model', 'features', 'speech_contexts'],
    },
    content: audioBase64,          // Base64 字串
  };

  // 若使用 explicit audio encoding（非 auto）
  if (encoding && encoding !== 'AUTO') {
    request.config.explicitDecodingConfig = {
      encoding,
      sampleRateHertz,
      audioChannelCount: 1,
    };
    delete request.config.autoDecodingConfig;
  }

  const [response] = await client.recognize(request);

  if (!response.results || response.results.length === 0) {
    return { transcript: '', confidence: 0, wordConfidence: [] };
  }

  // 取最佳結果
  const bestResult = response.results[0];
  const alternative = bestResult.alternatives[0];

  const transcript = alternative.transcript || '';
  const confidence = alternative.confidence || 0;

  // 整理 word-level confidence
  const wordConfidence = (alternative.words || []).map((w) => ({
    word: w.word,
    confidence: w.confidence || 0,
  }));

  return { transcript, confidence, wordConfidence };
}

module.exports = { transcribeAudio };
