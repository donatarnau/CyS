// src/db.js
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_name TEXT NOT NULL,
  output_path TEXT NOT NULL,
  rsa_encrypted_key BLOB NOT NULL,
  nonce BLOB NOT NULL,
  tag BLOB NOT NULL,
  aes_algo TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

export async function openDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec(SCHEMA);
  return db;
}

export async function addFile(db, { original_name, output_path, rsa_encrypted_key, nonce, tag, aes_algo }) {
  const created_at = new Date().toISOString();
  await db.run(
    `INSERT INTO files (original_name, output_path, rsa_encrypted_key, nonce, tag, aes_algo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [original_name, output_path, rsa_encrypted_key, nonce, tag, aes_algo, created_at]
  );
}

export async function getByOutput(db, output_path) {
  return db.get(`SELECT * FROM files WHERE output_path = ?`, [output_path]);
}

export async function listAll(db) {
  return db.all(`SELECT id, original_name, output_path, aes_algo, created_at FROM files ORDER BY created_at DESC`);
}
