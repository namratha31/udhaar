import 'dotenv/config';

const sampleRows = [
  { customer: 'Ramesh', amount: 420, type: 'credit', date: '', note: 'Groceries' },
  { customer: 'Sunita Devi', amount: 275, type: 'credit', date: '', note: 'Rice and oil' },
  { customer: 'Mohammed Ali', amount: 150, type: 'payment', date: '', note: 'Jama' },
  { customer: 'Ramesh', amount: 100, type: 'payment', date: '', note: 'Paid back' },
  { customer: 'Kavya', amount: 680, type: 'credit', date: '', note: 'Monthly provisions' }
];

export function provider() {
  const configured = process.env.AI_PROVIDER;
  if (configured === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (configured === 'anthropic' && process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return 'mock';
}

async function callLLM(prompt, image) {
  const active = provider();
  if (active === 'gemini') {
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const parts = [{ text: prompt }];
    if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.buffer.toString('base64') } });
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini request failed');
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  }
  const content = image ? [{ type: 'image', source: { type: 'base64', media_type: image.mime, data: image.buffer.toString('base64') } }, { type: 'text', text: prompt }] : [{ type: 'text', text: prompt }];
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 2000, messages: [{ role: 'user', content }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Anthropic request failed');
  return data.content?.map((part) => part.text || '').join('') || '';
}

function parseRows(text) {
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('AI returned no rows');
  const rows = JSON.parse(text.slice(start, end + 1));
  return rows.map((row) => ({
    customer: String(row.customer || '').trim(), amount: Math.abs(Number(row.amount)),
    type: row.type === 'payment' ? 'payment' : 'credit',
    date: /^\\d{4}-\\d{2}-\\d{2}$/.test(row.date) ? row.date : '', note: String(row.note || '').trim(),
    confidence: Math.max(0, Math.min(1, Number(row.confidence ?? 0.5)))
  })).filter((row) => row.customer && row.amount > 0);
}

const scanPrompt = `You are reading a photo of a handwritten shop credit notebook (udhaar khata). Extract every line item. Return ONLY a JSON array, no markdown. Each item must be {customer:string, amount:number, type:'credit'|'payment', date:'YYYY-MM-DD' or '', note:string, confidence:number}. credit means goods taken on credit; payment means paid back. Amount is a plain number in rupees. Skip unreadable lines. Handwriting may be English, Hindi or Kannada. Write names in English letters. Never guess an unclear amount; lower confidence.`;

export async function scanImage(buffer, mime, knownCustomers = []) {
  if (provider() === 'mock') return { rows: sampleRows.map((row) => ({ ...row, confidence: 0.96 })), mode: 'mock' };
  try {
    const names = knownCustomers.length ? ` Known customers: ${knownCustomers.join(', ')}. Use an exact known spelling when appropriate.` : '';
    return { rows: parseRows(await callLLM(scanPrompt + names, { buffer, mime })), mode: provider() };
  } catch (error) {
    console.error(error);
    return { rows: sampleRows.map((row) => ({ ...row, confidence: 0.5 })), mode: 'mock', warning: `AI unavailable, showing sample data: ${error.message}` };
  }
}

const templates = {
  en: (name, amount, shop) => `Hello ${name}, this is a friendly reminder from ${shop}. Your pending balance is Rs ${amount}. Please pay when convenient. Thank you!`,
  hi: (name, amount, shop) => `नमस्ते ${name}, ${shop} की ओर से यह एक विनम्र याद दिलाना है। आपका बकाया Rs ${amount} है। सुविधा होने पर भुगतान कर दें। धन्यवाद!`,
  kn: (name, amount, shop) => `ನಮಸ್ಕಾರ ${name}, ಇದು ${shop} ನಿಂದ ಆತ್ಮೀಯ ನೆನಪಿಸುವಿಕೆ. ನಿಮ್ಮ ಬಾಕಿ ಮೊತ್ತ Rs ${amount}. ಅನುಕೂಲವಾದಾಗ ಪಾವತಿಸಿ. ಧನ್ಯವಾದಗಳು!`
};

export async function writeReminder({ name, amount, shop, language }) {
  if (provider() === 'mock') return { message: templates[language](name, amount, shop), mode: 'mock' };
  try {
    const languageName = language === 'hi' ? 'Hindi' : language === 'kn' ? 'Kannada' : 'English';
    const text = await callLLM(`Write a short, polite WhatsApp payment reminder in ${languageName} from a small shopkeeper to a regular customer. Shop: ${shop}; customer: ${name}; pending amount: Rs ${amount}. Warm and respectful, never threatening. Max 3 sentences. Return only the message text.`, null);
    return { message: text.trim(), mode: provider() };
  } catch { return { message: templates[language](name, amount, shop), mode: 'mock' }; }
}
