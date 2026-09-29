const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const developmentSecret = crypto.randomBytes(32).toString('hex');

const getTokenSecret = () => process.env.AUTH_TOKEN_SECRET || (process.env.NODE_ENV === 'production' ? null : developmentSecret);

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
};

const verifyPassword = (password, passwordHash) => {
  const [algorithm, salt, storedHash] = String(passwordHash || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !storedHash) return false;

  const candidateHash = crypto.scryptSync(String(password), salt, 64);
  const expectedHash = Buffer.from(storedHash, 'hex');
  return candidateHash.length === expectedHash.length && crypto.timingSafeEqual(candidateHash, expectedHash);
};

const createAccessToken = (subject, role) => {
  const secret = getTokenSecret();
  if (!secret) throw new Error('AUTH_TOKEN_SECRET must be configured in production.');

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: String(subject), role, iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const verifyAccessToken = (token) => {
  const secret = getTokenSecret();
  if (!secret) return null;

  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) return null;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  let received;
  try {
    received = Buffer.from(signature, 'base64url');
  } catch (error) {
    return null;
  }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!['admin', 'driver', 'student'].includes(claims.role) || !claims.sub || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch (error) {
    return null;
  }
};

const createDriverToken = (driverId) => createAccessToken(driverId, 'driver');

const verifyDriverToken = (token) => {
  const claims = verifyAccessToken(token);
  return claims?.role === 'driver' ? claims : null;
};

module.exports = { createAccessToken, createDriverToken, hashPassword, verifyAccessToken, verifyDriverToken, verifyPassword };