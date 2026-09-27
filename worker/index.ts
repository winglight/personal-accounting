import { betterAuth } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getDefaultTemplates } from '../src/utils/promptTemplates';

type Env = { DB: D1Database; ASSETS: Fetcher; BETTER_AUTH_SECRET: string; ADMIN_EMAIL: string; ADMIN_PASSWORD: string };
type Variables = { userId: string };
// D1 rows and versioned action payloads are validated at their API boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
type WorkerContext = Context<{ Bindings: Env; Variables: Variables }>;
const now = () => new Date().toISOString();
const ADMIN_COOKIE = 'pa_admin_session';

const authFor = (env: Env, request: Request) => {
  const url = new URL(request.url);
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: url.origin,
    trustedOrigins: [url.origin],
    emailAndPassword: { enabled: true, autoSignIn: true, minPasswordLength: 8 },
    advanced: { useSecureCookies: url.protocol === 'https:' },
  });
};

app.use('/api/*', async (c, next) => {
  c.header('cache-control', 'no-store');
  if (c.req.path.startsWith('/api/auth/') || c.req.path.startsWith('/api/admin/')) return next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: '请求来源无效' }, 403);
  }
  const session = await authFor(c.env, c.req.raw).api.getSession({ headers: c.req.raw.headers });
  if (!session?.user?.id) return c.json({ error: '请先登录' }, 401);
  c.set('userId', session.user.id);
  await next();
});

app.on(['GET', 'POST'], '/api/auth/*', c => authFor(c.env, c.req.raw).handler(c.req.raw));

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const signAdminToken = async (email: string, secret: string) => {
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ email, exp: Date.now() + 8 * 60 * 60 * 1000 })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `${payload}.${base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))))}`;
};
const verifyAdminToken = async (token: string | undefined, env: Env) => {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = await signAdminTokenPayload(payload, env.BETTER_AUTH_SECRET);
  if (!(await safeEqual(signature, expected))) return false;
  try {
    const encoded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')), x => x.charCodeAt(0))));
    return parsed.email === env.ADMIN_EMAIL && Number(parsed.exp) > Date.now();
  } catch { return false; }
};
const signAdminTokenPayload = async (payload: string, secret: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))));
};
const safeEqual = async (left: string, right: string) => {
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  let different = 0; for (let i = 0; i < a.length; i++) different |= a[i] ^ b[i];
  return different === 0;
};

app.post('/api/admin/login', async c => {
  const input = await c.req.json<{ email?: string; password?: string }>();
  if (!(await safeEqual(input.email || '', c.env.ADMIN_EMAIL)) || !(await safeEqual(input.password || '', c.env.ADMIN_PASSWORD))) return c.json({ error: '管理员账号或密码错误' }, 401);
  setCookie(c, ADMIN_COOKIE, await signAdminToken(c.env.ADMIN_EMAIL, c.env.BETTER_AUTH_SECRET), { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 8 * 60 * 60 });
  return c.json({ authenticated: true, email: c.env.ADMIN_EMAIL });
});
app.get('/api/admin/session', async c => {
  const authenticated = await verifyAdminToken(getCookie(c, ADMIN_COOKIE), c.env);
  return c.json({ authenticated, email: authenticated ? c.env.ADMIN_EMAIL : '' });
});

app.use('/api/admin/*', async (c, next) => {
  if (c.req.path === '/api/admin/login' || c.req.path === '/api/admin/session') return next();
  if (!(await verifyAdminToken(getCookie(c, ADMIN_COOKIE), c.env))) return c.json({ error: '请先以管理员身份登录' }, 401);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const origin = c.req.header('origin'); if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: '请求来源无效' }, 403);
  }
  await next();
});
app.post('/api/admin/logout', c => { deleteCookie(c, ADMIN_COOKIE, { path: '/' }); return c.json({ ok: true }); });

app.get('/api/admin/users', async c => {
  const rows = await c.env.DB.prepare(`SELECT u.id,u.name,u.email,u.createdAt,u.updatedAt,
    (SELECT COUNT(*) FROM transactions t WHERE t.user_id=u.id) transaction_count,
    (SELECT COUNT(*) FROM financial_accounts a WHERE a.user_id=u.id) account_count
    FROM user u ORDER BY u.createdAt DESC`).all<Json>();
  return c.json({ users: rows.results });
});

app.post('/api/admin/users', async c => {
  const input = await c.req.json<{ name?: string; email?: string; password?: string }>();
  if (!input.name?.trim() || !input.email?.trim() || !input.password || input.password.length < 8) return c.json({ error: '姓名、邮箱及至少 8 位密码不能为空' }, 400);
  await authFor(c.env, c.req.raw).api.signUpEmail({ body: { name: input.name.trim(), email: input.email.trim().toLowerCase(), password: input.password } });
  return c.json({ ok: true });
});

app.patch('/api/admin/users/:id', async c => {
  const input = await c.req.json<{ name?: string; email?: string; password?: string }>();
  const userId = c.req.param('id'); const timestamp = Date.now();
  const user = await c.env.DB.prepare('SELECT * FROM user WHERE id=?').bind(userId).first<Json>();
  if (!user) return c.json({ error: '用户不存在' }, 404);
  if (input.password && input.password.length < 8) return c.json({ error: '密码至少 8 位' }, 400);
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return c.json({ error: '邮箱格式无效' }, 400);
  await c.env.DB.prepare('UPDATE user SET name=?,email=?,updatedAt=? WHERE id=?').bind(input.name?.trim() || user.name, input.email?.trim().toLowerCase() || user.email, timestamp, userId).run();
  if (input.password) {
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE account SET password=?,updatedAt=? WHERE userId=? AND providerId='credential'`).bind(await hashPassword(input.password), timestamp, userId),
      c.env.DB.prepare('DELETE FROM session WHERE userId=?').bind(userId),
    ]);
  }
  return c.json({ ok: true });
});

app.delete('/api/admin/users/:id', async c => {
  const result = await c.env.DB.prepare('DELETE FROM user WHERE id=?').bind(c.req.param('id')).run();
  if (!changed(result)) return c.json({ error: '用户不存在' }, 404);
  return c.json({ ok: true });
});

const defaultCategories = [
  ['1', 'Catering', 'expense', 'Utensils', 1], ['2', 'Traffic', 'expense', 'Bus', 2],
  ['3', 'Shopping', 'expense', 'ShoppingBag', 3], ['4', 'Entertainment', 'expense', 'Film', 4],
  ['5', 'Medical', 'expense', 'Activity', 5], ['6', 'Education', 'expense', 'Book', 6],
  ['101', 'Salary', 'income', 'Banknote', 1], ['102', 'Bonus', 'income', 'Gift', 2],
  ['103', 'Investment', 'income', 'TrendingUp', 3],
] as const;
const defaultAccounts = [
  ['1', 'Cash', 'cash', 1], ['2', 'Bank Card', 'bank', 0], ['3', 'WeChat', 'wechat', 0], ['4', 'Alipay', 'alipay', 0],
] as const;

async function ensureDefaults(db: D1Database, userId: string) {
  const timestamp = now();
  const templates = getDefaultTemplates();
  const statements = defaultCategories.map(([id, name, type, icon, sortOrder]) => db.prepare(
    'INSERT OR IGNORE INTO categories (user_id,id,name,type,icon,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
  ).bind(userId, id, name, type, icon, sortOrder, timestamp, timestamp));
  statements.push(...defaultAccounts.map(([id, name, type, isMain]) => db.prepare(
    'INSERT OR IGNORE INTO financial_accounts (user_id,id,name,type,currency,balance_minor,is_main,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
  ).bind(userId, id, name, type, 'CNY', 0, isMain, timestamp, timestamp)));
  statements.push(db.prepare(`INSERT OR IGNORE INTO user_settings
    (user_id,language,main_currency,ai_enabled,ai_api_url,ai_token,ai_text_model,ai_image_model,ai_text_template,ai_image_template,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(userId, 'zh', 'CNY', 0, 'https://open.bigmodel.cn/api/paas/v4/chat/completions', '', 'glm-5.3-flash', 'glm-4.6v-flashx', templates.text, templates.image, timestamp, timestamp));
  await db.batch(statements);
}

const minor = (value: unknown, field = '金额', allowNegative = false) => {
  const number = typeof value === 'number' ? value : Number(value);
  const integer = Math.round(number * 100);
  if (!Number.isFinite(number) || (!allowNegative && number < 0) || !Number.isSafeInteger(integer) || Math.abs(number - integer / 100) > 1e-9) {
    throw new Error(`${field}必须是最多两位小数${allowNegative ? '' : '的非负数'}`);
  }
  return integer;
};
const fromMinor = (value: unknown) => Number(value || 0) / 100;
const bool = (value: unknown) => value ? 1 : 0;
const parseDelete = (payload: unknown) => {
  if (typeof payload !== 'string') throw new Error('无效删除请求');
  try { return JSON.parse(payload) as { id: string; version?: number }; }
  catch { return { id: payload, version: undefined }; }
};
const changed = (result: D1Result) => Number(result.meta?.changes || 0) > 0;

async function getData(db: D1Database, userId: string) {
  await ensureDefaults(db, userId);
  const [categoryRows, accountRows, transactionRows, attachmentRows, rateRows, settings] = await Promise.all([
    db.prepare('SELECT * FROM categories WHERE user_id=? ORDER BY sort_order,id').bind(userId).all<Json>(),
    db.prepare('SELECT * FROM financial_accounts WHERE user_id=? ORDER BY is_main DESC,created_at,id').bind(userId).all<Json>(),
    db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY booked_date DESC,created_at DESC').bind(userId).all<Json>(),
    db.prepare('SELECT transaction_id,position,path FROM transaction_attachments WHERE user_id=? ORDER BY transaction_id,position').bind(userId).all<Json>(),
    db.prepare('SELECT * FROM exchange_rates WHERE user_id=? ORDER BY currency').bind(userId).all<Json>(),
    db.prepare('SELECT * FROM user_settings WHERE user_id=?').bind(userId).first<Json>(),
  ]);
  const attachmentMap = new Map<string, string[]>();
  for (const row of attachmentRows.results) attachmentMap.set(row.transaction_id, [...(attachmentMap.get(row.transaction_id) || []), row.path]);
  return {
    categories: categoryRows.results.map(r => ({ id: r.id, name: r.name, type: r.type, parentId: r.parent_id || undefined, icon: r.icon || undefined, sortOrder: r.sort_order, version: r.version })),
    accounts: accountRows.results.map(r => ({ id: r.id, name: r.name, type: r.type, currency: r.currency, balance: fromMinor(r.balance_minor), isMain: Boolean(r.is_main), exchangeRate: r.exchange_rate == null ? undefined : Number(r.exchange_rate), color: r.color || undefined, version: r.version })),
    transactions: transactionRows.results.map(r => ({
      id: r.id, date: r.booked_date, type: r.type, categoryId: r.category_id || '', subcategoryId: r.subcategory_id || undefined,
      amount: fromMinor(r.amount_minor), project: r.project || undefined, accountId: r.account_id, targetAccountId: r.target_account_id || undefined,
      payer: r.payer || undefined, note: r.note || undefined, attachments: attachmentMap.get(r.id), receiptId: r.receipt_id || undefined,
      receiptItemIndex: r.receipt_item_index ?? undefined,
      receiptMeta: r.receipt_merchant || r.receipt_date || r.receipt_total_minor != null || r.receipt_currency ? { merchant: r.receipt_merchant || undefined, date: r.receipt_date || undefined, total: r.receipt_total_minor == null ? undefined : fromMinor(r.receipt_total_minor), currency: r.receipt_currency || undefined } : undefined,
      createdAt: r.created_at, updatedAt: r.updated_at, version: r.version,
    })),
    exchangeRates: rateRows.results.map(r => ({ currency: r.currency, rate: Number(r.rate), updatedAt: r.updated_at })),
    settings: {
      language: settings!.language, mainCurrency: settings!.main_currency,
      aiConfig: { enabled: Boolean(settings!.ai_enabled), apiUrl: settings!.ai_api_url, token: settings!.ai_token, textModel: settings!.ai_text_model, imageModel: settings!.ai_image_model, templates: { text: settings!.ai_text_template, image: settings!.ai_image_template } },
      lastSyncTime: settings!.last_sync_time || undefined, version: settings!.version,
    },
    lastUpdated: settings!.updated_at,
  };
}

app.get('/api/data', async c => c.json(await getData(c.env.DB, c.get('userId'))));

const categoryStatement = (db: D1Database, userId: string, category: Json, timestamp: string, upsert = false) => db.prepare(upsert
  ? `INSERT INTO categories (user_id,id,name,type,parent_id,icon,sort_order,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,type=excluded.type,parent_id=excluded.parent_id,icon=excluded.icon,sort_order=excluded.sort_order,version=excluded.version,updated_at=excluded.updated_at`
  : 'INSERT INTO categories (user_id,id,name,type,parent_id,icon,sort_order,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
).bind(userId, category.id, String(category.name || '').trim(), category.type, category.parentId || null, category.icon || null, Number(category.sortOrder || 0), Number(category.version || 1), category.createdAt || timestamp, timestamp);

const accountStatement = (db: D1Database, userId: string, account: Json, timestamp: string, upsert = false, forcedBalance?: number) => db.prepare(upsert
  ? `INSERT INTO financial_accounts (user_id,id,name,type,currency,balance_minor,is_main,exchange_rate,color,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,type=excluded.type,currency=excluded.currency,balance_minor=excluded.balance_minor,is_main=excluded.is_main,exchange_rate=excluded.exchange_rate,color=excluded.color,version=excluded.version,updated_at=excluded.updated_at`
  : 'INSERT INTO financial_accounts (user_id,id,name,type,currency,balance_minor,is_main,exchange_rate,color,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
).bind(userId, account.id, String(account.name || '').trim(), account.type, String(account.currency || 'CNY').toUpperCase(), forcedBalance ?? minor(account.balance ?? 0, '账户余额', true), bool(account.isMain), account.exchangeRate == null ? null : String(account.exchangeRate), account.color || null, Number(account.version || 1), account.createdAt || timestamp, timestamp);

const transactionStatement = (db: D1Database, userId: string, tx: Json, timestamp: string, upsert = false) => {
  if (!tx.accountId) throw new Error('请选择转出账户');
  if (tx.type === 'transfer' && (!tx.targetAccountId || tx.targetAccountId === tx.accountId)) throw new Error('转入账户必须与转出账户不同');
  if (!['income', 'expense', 'transfer'].includes(tx.type)) throw new Error('交易类型无效');
  const receipt = tx.receiptMeta || {};
  return db.prepare(upsert
    ? `INSERT INTO transactions (user_id,id,booked_date,type,category_id,subcategory_id,amount_minor,project,account_id,target_account_id,payer,note,receipt_id,receipt_item_index,receipt_merchant,receipt_date,receipt_total_minor,receipt_currency,version,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET booked_date=excluded.booked_date,type=excluded.type,category_id=excluded.category_id,subcategory_id=excluded.subcategory_id,amount_minor=excluded.amount_minor,project=excluded.project,account_id=excluded.account_id,target_account_id=excluded.target_account_id,payer=excluded.payer,note=excluded.note,receipt_id=excluded.receipt_id,receipt_item_index=excluded.receipt_item_index,receipt_merchant=excluded.receipt_merchant,receipt_date=excluded.receipt_date,receipt_total_minor=excluded.receipt_total_minor,receipt_currency=excluded.receipt_currency,version=excluded.version,updated_at=excluded.updated_at`
    : `INSERT INTO transactions (user_id,id,booked_date,type,category_id,subcategory_id,amount_minor,project,account_id,target_account_id,payer,note,receipt_id,receipt_item_index,receipt_merchant,receipt_date,receipt_total_minor,receipt_currency,version,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(userId, tx.id, tx.date, tx.type, tx.type === 'transfer' ? null : tx.categoryId || null, tx.type === 'transfer' ? null : tx.subcategoryId || null, minor(tx.amount), tx.project || null, tx.accountId, tx.type === 'transfer' ? tx.targetAccountId : null, tx.payer || null, tx.note || null, tx.receiptId || null, tx.receiptItemIndex ?? null, receipt.merchant || null, receipt.date || null, receipt.total == null ? null : minor(receipt.total, '小票总额'), receipt.currency || null, Number(tx.version || 1), tx.createdAt || timestamp, timestamp);
};

async function attachmentStatements(db: D1Database, userId: string, tx: Json, timestamp: string) {
  return (Array.isArray(tx.attachments) ? tx.attachments : []).map((path: unknown, position: number) => {
    if (typeof path !== 'string' || path.length > 1_500_000) throw new Error('附件格式无效或过大');
    return db.prepare('INSERT INTO transaction_attachments (user_id,transaction_id,position,path,created_at) VALUES (?,?,?,?,?)').bind(userId, tx.id, position, path, timestamp);
  });
}

async function loadRow(db: D1Database, table: string, userId: string, id: string) {
  return db.prepare(`SELECT * FROM ${table} WHERE user_id=? AND id=?`).bind(userId, id).first<Json>();
}

app.post('/api/actions', async c => {
  const userId = c.get('userId');
  const action = await c.req.json<Json>();
  const db = c.env.DB;
  const timestamp = now();
  let result: D1Result | undefined;
  switch (action.type) {
    case 'ADD_CATEGORY': await categoryStatement(db, userId, action.payload, timestamp).run(); break;
    case 'UPDATE_CATEGORY': {
      const old = await loadRow(db, 'categories', userId, action.payload.id); if (!old) return c.json({ error: '分类不存在' }, 404);
      const item = { id: old.id, name: old.name, type: old.type, parentId: old.parent_id, icon: old.icon, sortOrder: old.sort_order, ...action.payload.category };
      result = await db.prepare('UPDATE categories SET name=?,type=?,parent_id=?,icon=?,sort_order=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?').bind(item.name, item.type, item.parentId || null, item.icon || null, item.sortOrder, timestamp, userId, item.id, action.payload.category.version || old.version).run(); break;
    }
    case 'DELETE_CATEGORY': { const item = parseDelete(action.payload); result = await db.prepare('DELETE FROM categories WHERE user_id=? AND id=? AND version=?').bind(userId, item.id, item.version || -1).run(); break; }
    case 'ADD_ACCOUNT': await accountStatement(db, userId, action.payload, timestamp).run(); break;
    case 'UPDATE_ACCOUNT': {
      const old = await loadRow(db, 'financial_accounts', userId, action.payload.id); if (!old) return c.json({ error: '账户不存在' }, 404);
      const item = { id: old.id, name: old.name, type: old.type, currency: old.currency, balance: fromMinor(old.balance_minor), isMain: Boolean(old.is_main), exchangeRate: old.exchange_rate, color: old.color, ...action.payload.account };
      result = await db.prepare('UPDATE financial_accounts SET name=?,type=?,currency=?,balance_minor=?,is_main=?,exchange_rate=?,color=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?').bind(item.name, item.type, item.currency, minor(item.balance, '账户余额', true), bool(item.isMain), item.exchangeRate == null ? null : String(item.exchangeRate), item.color || null, timestamp, userId, item.id, action.payload.account.version || old.version).run(); break;
    }
    case 'DELETE_ACCOUNT': { const item = parseDelete(action.payload); result = await db.prepare('DELETE FROM financial_accounts WHERE user_id=? AND id=? AND version=?').bind(userId, item.id, item.version || -1).run(); break; }
    case 'ADD_TRANSACTION': {
      const tx = action.payload; await db.batch([transactionStatement(db, userId, tx, timestamp), ...(await attachmentStatements(db, userId, tx, timestamp))]); break;
    }
    case 'UPDATE_TRANSACTION': {
      const old = await loadRow(db, 'transactions', userId, action.payload.id); if (!old) return c.json({ error: '交易不存在' }, 404);
      const current = (await getData(db, userId)).transactions.find((x: Json) => x.id === action.payload.id)!;
      const tx = { ...current, ...action.payload.transaction };
      if (!tx.accountId) throw new Error('请选择转出账户');
      if (!['income', 'expense', 'transfer'].includes(tx.type)) throw new Error('交易类型无效');
      if (tx.type === 'transfer' && (!tx.targetAccountId || tx.targetAccountId === tx.accountId)) throw new Error('转入账户必须与转出账户不同');
      const receipt = tx.receiptMeta || {};
      const update = db.prepare(`UPDATE transactions SET booked_date=?,type=?,category_id=?,subcategory_id=?,amount_minor=?,project=?,account_id=?,target_account_id=?,payer=?,note=?,receipt_id=?,receipt_item_index=?,receipt_merchant=?,receipt_date=?,receipt_total_minor=?,receipt_currency=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND version=?`).bind(tx.date, tx.type, tx.type === 'transfer' ? null : tx.categoryId || null, tx.type === 'transfer' ? null : tx.subcategoryId || null, minor(tx.amount), tx.project || null, tx.accountId, tx.type === 'transfer' ? tx.targetAccountId : null, tx.payer || null, tx.note || null, tx.receiptId || null, tx.receiptItemIndex ?? null, receipt.merchant || null, receipt.date || null, receipt.total == null ? null : minor(receipt.total, '小票总额'), receipt.currency || null, timestamp, userId, tx.id, action.payload.transaction.version || old.version);
      const results = await db.batch([update, db.prepare('DELETE FROM transaction_attachments WHERE user_id=? AND transaction_id=?').bind(userId, tx.id), ...(await attachmentStatements(db, userId, tx, timestamp))]);
      result = results[0]; break;
    }
    case 'DELETE_TRANSACTION': { const item = parseDelete(action.payload); result = await db.prepare('DELETE FROM transactions WHERE user_id=? AND id=? AND version=?').bind(userId, item.id, item.version || -1).run(); break; }
    case 'UPDATE_SETTINGS': {
      const old = await db.prepare('SELECT * FROM user_settings WHERE user_id=?').bind(userId).first<Json>(); if (!old) return c.json({ error: '设置不存在' }, 404);
      const input = action.payload; const ai = input.aiConfig || { enabled: old.ai_enabled, apiUrl: old.ai_api_url, token: old.ai_token, textModel: old.ai_text_model, imageModel: old.ai_image_model, templates: { text: old.ai_text_template, image: old.ai_image_template } };
      result = await db.prepare(`UPDATE user_settings SET language=?,main_currency=?,ai_enabled=?,ai_api_url=?,ai_token=?,ai_text_model=?,ai_image_model=?,ai_text_template=?,ai_image_template=?,last_sync_time=?,version=version+1,updated_at=? WHERE user_id=? AND version=?`).bind(input.language || old.language, input.mainCurrency || old.main_currency, bool(ai.enabled), ai.apiUrl, ai.token, ai.textModel, ai.imageModel, ai.templates.text, ai.templates.image, input.lastSyncTime || old.last_sync_time, timestamp, userId, input.version || old.version).run(); break;
    }
    case 'UPDATE_RATES': {
      const statements = [db.prepare('DELETE FROM exchange_rates WHERE user_id=?').bind(userId), ...action.payload.map((rate: Json) => db.prepare('INSERT INTO exchange_rates (user_id,currency,rate,updated_at) VALUES (?,?,?,?)').bind(userId, rate.currency, String(rate.rate), rate.updatedAt || timestamp))];
      await db.batch(statements); break;
    }
    default: return c.json({ error: '不支持的操作' }, 400);
  }
  if (result && !changed(result)) return c.json({ error: '数据已在其他页面更新，请重试' }, 409);
  return c.json({ ok: true as const });
});

async function batches(db: D1Database, statements: D1PreparedStatement[], size = 75) {
  for (let i = 0; i < statements.length; i += size) await db.batch(statements.slice(i, i + size));
}

const handleImport = async (c: WorkerContext) => {
  const userId = c.get('userId');
  await ensureDefaults(c.env.DB, userId);
  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > 5_000_000) return c.json({ error: '导入文件不能超过 5MB' }, 413);
  const sourceHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const existing = await c.env.DB.prepare('SELECT * FROM import_batches WHERE user_id=? AND source_hash=?').bind(userId, sourceHash).first<Json>();
  if (existing?.status === 'completed') return c.json({ duplicate: true, categories: existing.category_count, accounts: existing.account_count, transactions: existing.transaction_count, exchangeRates: existing.exchange_rate_count });
  let data: Json;
  try { data = JSON.parse(raw); } catch { return c.json({ error: '本地数据不是有效 JSON' }, 400); }
  const categories = Array.isArray(data.categories) ? data.categories : [];
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const rates = Array.isArray(data.exchangeRates) ? data.exchangeRates : [];
  if (categories.length > 5000 || accounts.length > 1000 || transactions.length > 50000 || rates.length > 500) return c.json({ error: '导入数据数量超出限制' }, 400);
  const batchId = existing?.id || crypto.randomUUID();
  const timestamp = now();
  await c.env.DB.prepare(`INSERT INTO import_batches (id,user_id,source_hash,status,created_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,source_hash) DO UPDATE SET status='processing',error_message=NULL`).bind(batchId, userId, sourceHash, 'processing', timestamp).run();
  try {
    const sortedCategories = [...categories].sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));
    await batches(c.env.DB, sortedCategories.map(item => categoryStatement(c.env.DB, userId, item, timestamp, true)));
    await batches(c.env.DB, accounts.map(item => accountStatement(c.env.DB, userId, item, timestamp, true, 0)));
    const txStatements: D1PreparedStatement[] = [];
    for (const tx of transactions) {
      txStatements.push(transactionStatement(c.env.DB, userId, tx, timestamp, true));
      txStatements.push(c.env.DB.prepare('DELETE FROM transaction_attachments WHERE user_id=? AND transaction_id=?').bind(userId, tx.id));
      txStatements.push(...await attachmentStatements(c.env.DB, userId, tx, timestamp));
    }
    await batches(c.env.DB, txStatements);
    await batches(c.env.DB, accounts.map(item => accountStatement(c.env.DB, userId, item, timestamp, true)));
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM exchange_rates WHERE user_id=?').bind(userId), ...rates.map(rate => c.env.DB.prepare('INSERT INTO exchange_rates (user_id,currency,rate,updated_at) VALUES (?,?,?,?)').bind(userId, rate.currency, String(rate.rate), rate.updatedAt || timestamp))]);
    if (data.settings) {
      const ai = data.settings.aiConfig || {}; const templates = ai.templates || getDefaultTemplates();
      await c.env.DB.prepare(`UPDATE user_settings SET language=?,main_currency=?,ai_enabled=?,ai_api_url=?,ai_token=?,ai_text_model=?,ai_image_model=?,ai_text_template=?,ai_image_template=?,version=version+1,updated_at=? WHERE user_id=?`).bind(data.settings.language === 'en' ? 'en' : 'zh', data.settings.mainCurrency || 'CNY', bool(ai.enabled), ai.apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions', ai.token || '', ai.textModel || 'glm-5.3-flash', ai.imageModel || 'glm-4.6v-flashx', templates.text, templates.image, timestamp, userId).run();
    }
    await c.env.DB.prepare(`UPDATE import_batches SET status='completed',category_count=?,account_count=?,transaction_count=?,exchange_rate_count=?,completed_at=? WHERE id=? AND user_id=?`).bind(categories.length, accounts.length, transactions.length, rates.length, timestamp, batchId, userId).run();
    return c.json({ duplicate: false, categories: categories.length, accounts: accounts.length, transactions: transactions.length, exchangeRates: rates.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await c.env.DB.prepare(`UPDATE import_batches SET status='failed',error_message=? WHERE id=? AND user_id=?`).bind(message.slice(0, 500), batchId, userId).run();
    throw error;
  }
};

app.post('/api/import', c => c.json({ error: '只有管理员可以导入数据；请下载本地备份并交由管理员为指定用户导入' }, 403));
app.post('/api/admin/users/:id/import', async c => {
  const targetUserId = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT id FROM user WHERE id=?').bind(targetUserId).first<Json>();
  if (!target) return c.json({ error: '目标用户不存在' }, 404);
  c.set('userId', targetUserId);
  return handleImport(c);
});

app.onError((error, c) => {
  console.error(JSON.stringify({ event: 'request_error', path: c.req.path, message: error.message, stack: error.stack }));
  const status = /必须|无效|请选择|不同|不存在/.test(error.message) ? 400 : 500;
  return c.json({ error: status === 400 ? error.message : '服务器暂时无法处理请求' }, status);
});

app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
export default app;
