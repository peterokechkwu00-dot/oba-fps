const buckets = new Map();

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Returns true if the request is allowed, false if it should be rejected.
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    b = { start: now, n: 0 };
    buckets.set(key, b);
  }
  b.n++;
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now - v.start >= windowMs) buckets.delete(k);
  }
  return b.n <= limit;
}

export function tooMany(res) {
  res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
}
