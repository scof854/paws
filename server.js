import 'dotenv/config';
import express from 'express';
import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT) || 3000;
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const bookingsPath = path.join(rootDir, 'data', 'bookings.jsonl');

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(rootDir, { index: false }));

app.get('/', (req, res) => {
  res.sendFile(path.join(rootDir, 'pawfecto(1).html'));
});

app.post('/api/bookings', async (req, res) => {
  const booking = normalizeBooking(req.body);
  const errors = validateBooking(booking);

  if (errors.length > 0) {
    return res.status(400).json({ ok: false, message: errors[0] });
  }

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...booking
  };

  try {
    await saveBooking(record);
    await sendTelegram(record);
    res.status(201).json({ ok: true, message: 'Заявка принята' });
  } catch (error) {
    console.error('Booking error:', error.message);
    res.status(500).json({ ok: false, message: 'Не удалось отправить заявку. Попробуйте позже.' });
  }
});

app.listen(port, () => {
  console.log(`Pawfecto backend started: http://localhost:${port}`);
});

function normalizeBooking(body) {
  return {
    name: clean(body.name),
    phone: clean(body.phone),
    pet: clean(body.pet),
    animal: clean(body.animal),
    service: clean(body.service),
    date: clean(body.date),
    time: clean(body.time)
  };
}

function validateBooking(booking) {
  const errors = [];

  if (!booking.name) errors.push('Укажите имя');
  if (!booking.phone) errors.push('Укажите телефон');
  if (!booking.pet) errors.push('Укажите питомца');
  if (!booking.animal) errors.push('Выберите вид животного');
  if (!booking.service) errors.push('Выберите пакет услуги');
  if (!booking.date) errors.push('Выберите дату');
  if (!booking.time) errors.push('Выберите время');
  if (booking.phone && !/^[+()\d\s-]{7,24}$/.test(booking.phone)) errors.push('Проверьте телефон');

  return errors;
}

function clean(value) {
  return String(value ?? '').trim().slice(0, 200);
}

async function saveBooking(record) {
  await mkdir(path.dirname(bookingsPath), { recursive: true });
  await appendFile(bookingsPath, `${JSON.stringify(record)}\n`, 'utf8');
}

async function sendTelegram(record) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('Telegram variables are not configured; booking saved locally only.');
    return;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      parse_mode: 'HTML',
      text: formatTelegramMessage(record)
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Telegram API returned ${response.status}: ${details}`);
  }
}

function formatTelegramMessage(record) {
  return [
    '<b>Новая заявка Pawfecto</b>',
    '',
    `<b>Имя:</b> ${escapeHtml(record.name)}`,
    `<b>Телефон:</b> ${escapeHtml(record.phone)}`,
    `<b>Питомец:</b> ${escapeHtml(record.pet)}`,
    `<b>Вид животного:</b> ${escapeHtml(record.animal)}`,
    `<b>Услуга:</b> ${escapeHtml(record.service)}`,
    `<b>Дата:</b> ${escapeHtml(record.date)}`,
    `<b>Время:</b> ${escapeHtml(record.time)}`,
    '',
    `<b>ID:</b> ${escapeHtml(record.id)}`
  ].join('\n');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
