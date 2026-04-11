const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role key 可驗證任何 JWT
);

/**
 * 驗證 Supabase Access Token
 * 從 Authorization: Bearer <token> 取出 token，向 Supabase 確認身份
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = { userId: user.id, email: user.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Auth error' });
  }
}

/** 後端服務間內部呼叫的 secret 驗證 */
function requireInternalSecret(req, res, next) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret && req.headers['x-internal-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = { requireAuth, requireInternalSecret };
