import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import db from './db.js';
import { scanImage, writeReminder } from './ai.js';

const app = express();
const port = Number(process.env.PORT || 5000);
const price = Number(process.env.PRICE_PER_SCAN || 2);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, callback) => callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) });
app.use(cors());
app.use(express.json());

function levenshtein(first, second) {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= second.length; column += 1) current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (first[row - 1] === second[column - 1] ? 0 : 1));
    previous.splice(0, previous.length, ...current);
  }
  return previous[second.length];
}
function normalizeName(name) { return name.toLowerCase().replace(/\s+/g, ''); }
function existingCustomers() { return db.prepare('SELECT MIN(customer) AS customer FROM entries GROUP BY customer COLLATE NOCASE').all().map((row) => row.customer); }

app.post('/api/scan', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Please upload a JPEG, PNG or WebP image.' });
    const result = await scanImage(req.file.buffer, req.file.mimetype, existingCustomers());
    const customers = existingCustomers();
    result.rows = result.rows.map((row) => {
      const match = customers.find((customer) => levenshtein(normalizeName(row.customer), normalizeName(customer)) <= 2);
      return match ? { ...row, customer: match, matched: true } : row;
    });
    db.prepare('INSERT INTO scans (rows_found, mode) VALUES (?, ?)').run(result.rows.length, result.mode);
    res.json(result);
  } catch (error) { next(error); }
});

app.post('/api/entries', (req, res, next) => {
  try {
    if (!Array.isArray(req.body.rows)) return res.status(400).json({ error: 'Rows must be an array.' });
    const rows = req.body.rows.map((row, index) => {
      const customer = String(row.customer || '').trim();
      const amount = Number(row.amount);
      const type = row.type || 'credit';
      if (!customer || !Number.isFinite(amount) || amount <= 0 || !['credit', 'payment'].includes(type)) throw new Error(`Invalid row ${index + 1}: customer, positive amount and valid type are required.`);
      return { customer, amount, type, date: String(row.date || ''), note: String(row.note || '') };
    });
    const insert = db.prepare('INSERT INTO entries (customer, amount, type, date, note) VALUES (@customer, @amount, @type, @date, @note)');
    db.transaction(() => rows.forEach((row) => insert.run(row)))();
    res.status(201).json({ saved: rows.length });
  } catch (error) { next(error); }
});

app.get('/api/ledger', (_req, res, next) => {
  try {
    const customers = db.prepare("SELECT MIN(customer) AS customer, SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END) AS balance, COUNT(*) AS entries, MAX(date) AS last_date FROM entries GROUP BY customer COLLATE NOCASE ORDER BY balance DESC").all();
    const entries = db.prepare('SELECT * FROM entries ORDER BY date DESC, id DESC').all();
    const totalOwed = customers.reduce((total, customer) => total + Math.max(0, customer.balance), 0);
    res.json({ customers, entries, totalOwed });
  } catch (error) { next(error); }
});

app.delete('/api/entries/:id', (req, res, next) => { try { db.prepare('DELETE FROM entries WHERE id = ?').run(req.params.id); res.json({ deleted: true }); } catch (error) { next(error); } });
app.post('/api/reminder', async (req, res, next) => { try { const { name, amount, shop, language = 'en' } = req.body; if (!name || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'Name and a positive amount are required.' }); if (!['en', 'hi', 'kn'].includes(language)) return res.status(400).json({ error: 'Unsupported language.' }); res.json(await writeReminder({ name, amount: Number(amount), shop: shop || 'My Shop', language })); } catch (error) { next(error); } });
app.get('/api/usage', (_req, res, next) => { try { const scans = db.prepare('SELECT COUNT(*) AS count FROM scans').get().count; res.json({ scans, price, total: scans * price }); } catch (error) { next(error); } });
app.use((error, _req, res, _next) => { console.error(error); const message = error.code === 'LIMIT_FILE_SIZE' ? 'Image is over 5 MB.' : error.message || 'Something went wrong.'; res.status(error.status || 500).json({ error: message }); });
app.listen(port, () => console.log(`Udhaar server listening on http://localhost:${port}`));
