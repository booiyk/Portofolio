/* Pure ledger calculations. All persisted money values are integer USD cents. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Ledger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ACCOUNT_STATUSES = ['challenge', 'funded', 'failed', 'closed'];
  const PAYOUT_STATUSES = ['received', 'pending'];
  const RECEIPT_LIMIT = 5 * 1024 * 1024;
  function moneyToCents(value) {
    const text = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Gunakan nominal USD, misalnya 149.99, maksimal 2 desimal.');
    const [whole, fraction = ''] = text.split('.');
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(amount) || amount > 99999999999) throw new Error('Nominal terlalu besar.');
    return amount;
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }
  function emptyData() { return { version: 1, accounts: [], costs: [], payouts: [] }; }
  function accountStats(data, accountId) {
    const account = data.accounts.find(a => a.id === accountId);
    if (!account) return { cost: 0, received: 0, pending: 0, net: 0, roi: null, remaining: 0, recovered: 0 };
    const cost = account.priceCents + data.costs.filter(c => c.accountId === accountId).reduce((n, c) => n + c.amountCents, 0);
    const received = data.payouts.filter(p => p.accountId === accountId && p.status === 'received').reduce((n, p) => n + p.amountCents, 0);
    const pending = data.payouts.filter(p => p.accountId === accountId && p.status === 'pending').reduce((n, p) => n + p.amountCents, 0);
    return { cost, received, pending, net: received - cost, roi: cost > 0 ? (received - cost) / cost * 100 : null, remaining: Math.max(cost - received, 0), recovered: cost > 0 ? Math.min(received / cost * 100, 100) : 0 };
  }
  function totals(data, ids) {
    const accounts = ids ? data.accounts.filter(a => ids.includes(a.id)) : data.accounts;
    const sum = accounts.reduce((result, account) => {
      const s = accountStats(data, account.id);
      for (const key of ['cost', 'received', 'pending', 'net']) result[key] += s[key];
      if (s.cost > 0 && s.remaining === 0) result.breakEven += 1;
      return result;
    }, { cost: 0, received: 0, pending: 0, net: 0, breakEven: 0 });
    return { ...sum, count: accounts.length, roi: sum.cost > 0 ? sum.net / sum.cost * 100 : null };
  }
  function transactions(data, ids) {
    const accounts = new Map(data.accounts.filter(a => !ids || ids.includes(a.id)).map(a => [a.id, a]));
    const rows = [];
    for (const a of accounts.values()) rows.push({ id: a.id, accountId: a.id, date: a.date, type: 'purchase', label: 'Pembelian akun', amountCents: a.priceCents, status: 'paid', receipt: a.receipt, note: a.note, account: a });
    for (const c of data.costs) if (accounts.has(c.accountId)) rows.push({ ...c, type: 'cost', status: 'paid', account: accounts.get(c.accountId) });
    for (const p of data.payouts) if (accounts.has(p.accountId)) rows.push({ ...p, type: 'payout', label: p.status === 'received' ? 'Payout diterima' : 'Payout menunggu', account: accounts.get(p.accountId) });
    return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }
  function monthly(data, ids, count = 6, now = new Date()) {
    const rows = transactions(data, ids);
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - count + i + 1, 1, 12);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = rows.filter(r => r.date.slice(0, 7) === key);
      const cost = bucket.filter(r => r.type !== 'payout').reduce((sum, r) => sum + r.amountCents, 0);
      const received = bucket.filter(r => r.type === 'payout' && r.status === 'received').reduce((sum, r) => sum + r.amountCents, 0);
      return { key, date: d, cost, received, net: received - cost };
    });
  }
  function validateData(input) {
    function insist(test, message) { if (!test) throw new Error(`Backup tidak valid: ${message}`); }
    insist(input && typeof input === 'object' && input.version === 1, 'versi tidak didukung.');
    for (const key of ['accounts', 'costs', 'payouts']) insist(Array.isArray(input[key]) && input[key].length <= 20000, `daftar ${key} tidak valid atau terlalu besar.`);
    const ids = new Set();
    const accountIds = new Set();
    const text = (v, max = 200) => typeof v === 'string' && v.length <= max;
    const cents = v => Number.isSafeInteger(v) && v >= 0 && v <= 99999999999;
    function checkBase(row) {
      insist(row && typeof row === 'object', 'baris harus berupa objek.');
      insist(typeof row.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(row.id) && !ids.has(row.id), 'ID kosong, duplikat, atau tidak aman.');
      ids.add(row.id);
      insist(validDate(row.date), 'tanggal tidak valid.');
      insist(row.note === undefined || text(row.note, 10000), 'catatan terlalu panjang.');
      if (row.receipt != null) {
        const r = row.receipt;
        insist(r && text(r.name, 200) && ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(r.type), 'jenis bukti tidak didukung.');
        const prefix = `data:${r.type};base64,`;
        insist(typeof r.data === 'string' && r.data.startsWith(prefix) && r.data.length <= prefix.length + Math.ceil(RECEIPT_LIMIT / 3) * 4, 'bukti rusak atau terlalu besar.');
        const payload = r.data.slice(prefix.length);
        let decoded;
        try { decoded = atob(payload); } catch (_) { insist(false, 'bukti rusak atau terlalu besar.'); }
        insist(decoded.length > 0 && decoded.length <= RECEIPT_LIMIT && btoa(decoded) === payload, 'bukti rusak atau terlalu besar.');
      }
    }
    for (const a of input.accounts) {
      checkBase(a);
      insist(text(a.firm, 100) && a.firm.trim() && text(a.name, 100) && a.name.trim(), 'nama firm atau akun kosong.');
      insist(cents(a.sizeCents) && cents(a.priceCents), 'nilai akun atau biaya tidak valid.');
      insist(ACCOUNT_STATUSES.includes(a.status), 'status akun tidak dikenal.');
      insist(a.order === undefined || text(a.order, 200), 'nomor pesanan tidak valid.');
      accountIds.add(a.id);
    }
    for (const c of input.costs) {
      checkBase(c);
      insist(accountIds.has(c.accountId), 'biaya tidak memiliki akun.');
      insist(cents(c.amountCents) && c.amountCents > 0 && text(c.label, 120) && c.label.trim(), 'biaya tambahan tidak valid.');
    }
    for (const p of input.payouts) {
      checkBase(p);
      insist(accountIds.has(p.accountId), 'payout tidak memiliki akun.');
      insist(cents(p.amountCents) && p.amountCents > 0 && PAYOUT_STATUSES.includes(p.status), 'payout tidak valid.');
    }
    return JSON.parse(JSON.stringify({ version: 1, accounts: input.accounts, costs: input.costs, payouts: input.payouts }));
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  return { ACCOUNT_STATUSES, PAYOUT_STATUSES, RECEIPT_LIMIT, moneyToCents, validDate, emptyData, accountStats, totals, transactions, monthly, validateData, escapeHtml };
});
