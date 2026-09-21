const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'registrations.json');
const MONGODB_URI = process.env.MONGODB_URI;

let collectionPromise = null;

function getCollection() {
  if (!collectionPromise) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGODB_URI);
    collectionPromise = client
      .connect()
      .then((c) => c.db(process.env.MONGODB_DB || 'crk').collection('registrations'));
  }
  return collectionPromise;
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

function stripMongoId(record) {
  if (!record) return record;
  const { _id, ...rest } = record;
  return rest;
}

async function listRegistrations() {
  if (MONGODB_URI) {
    const col = await getCollection();
    const records = await col.find({}).toArray();
    return records.map(stripMongoId);
  }
  return loadFileDB();
}

async function insertRegistration(record) {
  if (MONGODB_URI) {
    const col = await getCollection();
    await col.insertOne({ ...record });
    return record;
  }
  const records = loadFileDB();
  records.push(record);
  saveFileDB(records);
  return record;
}

async function findRegistration(id) {
  if (MONGODB_URI) {
    const col = await getCollection();
    const record = await col.findOne({ id });
    return stripMongoId(record);
  }
  return loadFileDB().find((r) => r.id === id) || null;
}

async function updateRegistration(id, updates) {
  if (MONGODB_URI) {
    const col = await getCollection();
    const result = await col.findOneAndUpdate(
      { id },
      { $set: updates },
      { returnDocument: 'after' }
    );
    return stripMongoId(result);
  }
  const records = loadFileDB();
  const record = records.find((r) => r.id === id);
  if (!record) return null;
  Object.assign(record, updates);
  saveFileDB(records);
  return record;
}

module.exports = {
  usingMongo: Boolean(MONGODB_URI),
  listRegistrations,
  insertRegistration,
  findRegistration,
  updateRegistration,
};
