const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'registrations.json');
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

let clientPromise = null;

function getClient() {
  if (!clientPromise) {
    const { createClient } = require('@libsql/client');
    const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
    clientPromise = client
      .execute(
        `CREATE TABLE IF NOT EXISTS registrations (
          id TEXT PRIMARY KEY,
          studentId TEXT NOT NULL,
          name TEXT NOT NULL,
          courses TEXT NOT NULL,
          amount INTEGER NOT NULL,
          status TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          claimedAt TEXT,
          confirmedAt TEXT
        )`
      )
      .then(() => client);
  }
  return clientPromise;
}

function rowToRecord(row) {
  return {
    id: row.id,
    studentId: row.studentId,
    name: row.name,
    courses: JSON.parse(row.courses),
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.createdAt,
    claimedAt: row.claimedAt,
    confirmedAt: row.confirmedAt,
  };
}

function loadFileDB() {
  if (!fs.existsSync(DB_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveFileDB(records) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

async function listRegistrations() {
  if (TURSO_URL) {
    const client = await getClient();
    const result = await client.execute('SELECT * FROM registrations');
    return result.rows.map(rowToRecord);
  }
  return loadFileDB();
}

async function insertRegistration(record) {
  if (TURSO_URL) {
    const client = await getClient();
    await client.execute({
      sql: `INSERT INTO registrations
              (id, studentId, name, courses, amount, status, createdAt, claimedAt, confirmedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        record.id,
        record.studentId,
        record.name,
        JSON.stringify(record.courses),
        record.amount,
        record.status,
        record.createdAt,
        record.claimedAt,
        record.confirmedAt,
      ],
    });
    return record;
  }
  const records = loadFileDB();
  records.push(record);
  saveFileDB(records);
  return record;
}

async function findRegistration(id) {
  if (TURSO_URL) {
    const client = await getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM registrations WHERE id = ?',
      args: [id],
    });
    return result.rows[0] ? rowToRecord(result.rows[0]) : null;
  }
  return loadFileDB().find((r) => r.id === id) || null;
}

async function findByStudentId(studentId) {
  if (TURSO_URL) {
    const client = await getClient();
    const result = await client.execute({
      sql: 'SELECT * FROM registrations WHERE studentId = ? LIMIT 1',
      args: [studentId],
    });
    return result.rows[0] ? rowToRecord(result.rows[0]) : null;
  }
  return loadFileDB().find((r) => r.studentId === studentId) || null;
}

async function updateRegistration(id, updates) {
  if (TURSO_URL) {
    const client = await getClient();
    const fields = Object.keys(updates);
    const setClause = fields.map((f) => `${f} = ?`).join(', ');
    const args = fields.map((f) => updates[f]);
    await client.execute({
      sql: `UPDATE registrations SET ${setClause} WHERE id = ?`,
      args: [...args, id],
    });
    return findRegistration(id);
  }
  const records = loadFileDB();
  const record = records.find((r) => r.id === id);
  if (!record) return null;
  Object.assign(record, updates);
  saveFileDB(records);
  return record;
}

module.exports = {
  usingTurso: Boolean(TURSO_URL),
  listRegistrations,
  insertRegistration,
  findRegistration,
  findByStudentId,
  updateRegistration,
};
