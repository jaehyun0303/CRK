const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cookie1234';
const DB_PATH = path.join(__dirname, 'data', 'registrations.json');

const COURSES = {
  cookie_sa: { name: '쿠키사', image: '/images/cookie-sa.jpg' },
  cookie_sigansa: { name: '쿠키시간사', image: '/images/cookie-sigansa.jpg' },
  cookie_oejeonsa: { name: '쿠키외전사', image: '/images/cookie-oejeonsa.jpg' },
};

const PRICE_BY_COUNT = { 1: 15000, 2: 28000, 3: 39000 };

function loadDB() {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveDB(records) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/courses', (req, res) => {
  res.json({ courses: COURSES, priceByCount: PRICE_BY_COUNT });
});

app.post('/api/register', (req, res) => {
  const { studentId, name, courses } = req.body || {};

  if (typeof studentId !== 'string' || !studentId.trim()) {
    return res.status(400).json({ error: '학번을 입력해주세요.' });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: '이름을 입력해주세요.' });
  }
  if (!Array.isArray(courses) || courses.length < 1 || courses.length > 3) {
    return res.status(400).json({ error: '선택과목을 1개 이상 3개 이하로 선택해주세요.' });
  }
  const uniqueCourses = [...new Set(courses)];
  if (uniqueCourses.some((c) => !COURSES[c])) {
    return res.status(400).json({ error: '올바르지 않은 과목이 포함되어 있습니다.' });
  }

  const amount = PRICE_BY_COUNT[uniqueCourses.length];
  const record = {
    id: crypto.randomUUID(),
    studentId: studentId.trim(),
    name: name.trim(),
    courses: uniqueCourses,
    amount,
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
    paidAt: null,
  };

  const records = loadDB();
  records.push(record);
  saveDB(records);

  res.status(201).json({ registration: record });
});

app.get('/api/register/:id', (req, res) => {
  const record = loadDB().find((r) => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: '수강신청 내역을 찾을 수 없습니다.' });
  res.json({ registration: record });
});

app.post('/api/register/:id/confirm-payment', (req, res) => {
  const records = loadDB();
  const record = records.find((r) => r.id === req.params.id);
  if (!record) return res.status(404).json({ error: '수강신청 내역을 찾을 수 없습니다.' });

  record.status = 'completed';
  record.paidAt = new Date().toISOString();
  saveDB(records);

  res.json({ registration: record });
});

function requireAdmin(req, res, next) {
  const key = req.get('x-admin-key');
  if (key !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
  }
  next();
}

app.get('/api/admin/registrations', requireAdmin, (req, res) => {
  const records = loadDB().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ registrations: records });
});

app.listen(PORT, () => {
  console.log(`쿠키사 수강신청 사이트가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
