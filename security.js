'use strict';
/**
 * Security middleware for Index (student-facing site):
 *  - strict response headers (CSP, HSTS, COOP, ...)
 *  - same-origin check on state-changing API calls (CSRF defence in depth on top of SameSite cookies)
 *  - in-memory rate limits (generous per-IP numbers because a whole school can share one public IP)
 *  - sign-in lockout per account name (the real brute-force protection)
 *  - JSON error handler that never leaks stack traces
 */
const crypto = require('crypto');

function makeLimiter({ windowMs, max, keyFn, message }) {
  const hits = new Map();
  const timer = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k); }, Math.max(30000, windowMs));
  if (timer.unref) timer.unref();
  return (req, res, next) => {
    const key = keyFn(req), now = Date.now();
    let e = hits.get(key);
    if (!e || now - e.start > windowMs) { e = { start: now, n: 0 }; hits.set(key, e); }
    e.n++;
    if (e.n > max) {
      res.setHeader('Retry-After', String(Math.ceil((e.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: message || 'Too many requests. Please slow down and try again shortly.' });
    }
    next();
  };
}
const ipKey = req => 'ip:' + (req.ip || 'unknown');
function sessionOrIpKey(req) {
  const m = /(?:^|;\s*)([^=;]*session[^=;]*)=([^;]+)/i.exec(req.headers.cookie || '');
  return m ? 's:' + crypto.createHash('sha256').update(m[2]).digest('hex').slice(0, 24) : ipKey(req);
}

/** Sign-in lockout: after `max` failures for the same account name within the window, refuse further attempts for the rest of the window. */
function makeLockout({ windowMs = 15 * 60 * 1000, max = 8 } = {}) {
  const fails = new Map();
  const norm = s => String(s || '').trim().toLowerCase().slice(0, 120);
  return {
    locked(id) { const e = fails.get(norm(id)); return !!(e && Date.now() - e.start < windowMs && e.n >= max); },
    fail(id) { const k = norm(id), now = Date.now(); let e = fails.get(k); if (!e || now - e.start > windowMs) e = { start: now, n: 0 }; e.n++; fails.set(k, e); if (fails.size > 20000) fails.clear(); },
    ok(id) { fails.delete(norm(id)); }
  };
}

function securityHeaders({ production }) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",   // the app uses inline scripts; everything else below is locked down
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join('; ');
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (production || req.secure || req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/api/')) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); }
    next();
  };
}

/** Reject cross-site browser requests that change data. Requests without an Origin header (curl, server-to-server webhooks) are left alone. */
function sameOriginWrites({ publicBaseUrl }) {
  let baseHost = ''; try { baseHost = publicBaseUrl ? new URL(publicBaseUrl).host : ''; } catch (e) { /* ignore */ }
  return (req, res, next) => {
    if (!/^(POST|PUT|PATCH|DELETE)$/.test(req.method) || !req.path.startsWith('/api/')) return next();
    const origin = req.headers.origin; if (!origin) return next();
    let host = ''; try { host = new URL(origin).host; } catch (e) { return res.status(403).json({ error: 'Blocked cross-site request.' }); }
    if (host === req.headers.host || (baseHost && host === baseHost)) return next();
    return res.status(403).json({ error: 'Blocked cross-site request.' });
  };
}

function errorHandlers() {
  return {
    notFoundApi: (req, res, next) => req.path.startsWith('/api/') ? res.status(404).json({ error: 'Not found.' }) : next(),
    error: (err, req, res, next) => { // eslint-disable-line no-unused-vars
      if (res.headersSent) return next(err);
      const status = Number(err && (err.status || err.statusCode)) || 500;
      if (status >= 500) console.error('Unhandled error:', req.method, req.path, err && err.message);
      const msg = status === 413 ? 'That request is too large.' : status === 400 ? 'Bad request.' : 'Something went wrong. Please try again.';
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: msg });
    }
  };
}

module.exports = { makeLimiter, makeLockout, securityHeaders, sameOriginWrites, errorHandlers, ipKey, sessionOrIpKey };
