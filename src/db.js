// src/db.js
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const SCHEMA_USERS = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  public_key_rsa TEXT NOT NULL,
  encrypted_private_key_rsa TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const SCHEMA_FILES = `
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  original_name TEXT NOT NULL,
  output_path TEXT NOT NULL,
  
  -- Clave AES cifrada con la Clave Pública RSA del PROPIETARIO
  encrypted_aes_key_for_owner BLOB NOT NULL, 
  
  nonce BLOB NOT NULL,
  tag BLOB NOT NULL,
  aes_algo TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id)
);
`;

const SCHEMA_SHARES = `
CREATE TABLE IF NOT EXISTS file_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  owner_user_id INTEGER NOT NULL,
  recipient_user_id INTEGER NOT NULL,

  -- Clave AES (la misma del archivo) cifrada con la Clave Pública RSA del DESTINATARIO
  encrypted_aes_key_for_recipient BLOB NOT NULL,
  
  created_at TEXT NOT NULL,
  FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id),
  FOREIGN KEY(recipient_user_id) REFERENCES users(id)
);
`;

export async function openDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  
  // Habilitar claves foráneas (importante para la integridad de los datos)
  await db.exec('PRAGMA foreign_keys = ON;');
  
  // Ejecutar todos los esquemas
  await db.exec(SCHEMA_USERS);
  await db.exec(SCHEMA_FILES);
  await db.exec(SCHEMA_SHARES);
  
  console.log('Base de datos y esquemas (Fase 2) listos.');
  return db;
}

// --- Funciones de Usuarios ---

export async function createUser(db, { username, password_hash, public_key_rsa, encrypted_private_key_rsa }) {
  const created_at = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO users (username, password_hash, public_key_rsa, encrypted_private_key_rsa, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [username, password_hash, public_key_rsa, encrypted_private_key_rsa, created_at]
  );
  return result.lastID;
}

export async function getUserByUsername(db, username) {
  return db.get(`SELECT * FROM users WHERE username = ?`, [username]);
}

export async function getUserById(db, id) {
  return db.get(`SELECT id, username, public_key_rsa, encrypted_private_key_rsa, created_at FROM users WHERE id = ?`, [id]);
}

// --- Funciones de Archivos ---

export async function addFile(db, { owner_user_id, original_name, output_path, encrypted_aes_key_for_owner, nonce, tag, aes_algo }) {
  const created_at = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO files (owner_user_id, original_name, output_path, encrypted_aes_key_for_owner, nonce, tag, aes_algo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [owner_user_id, original_name, output_path, encrypted_aes_key_for_owner, nonce, tag, aes_algo, created_at]
  );
  return result.lastID;
}

export async function getFileById(db, id) {
    return db.get(`SELECT * FROM files WHERE id = ?`, [id]);
}

export async function listFilesByOwner(db, owner_user_id) {
  return db.all(`
    SELECT id, original_name, output_path, aes_algo, created_at 
    FROM files 
    WHERE owner_user_id = ? 
    ORDER BY created_at DESC`, 
    [owner_user_id]
  );
}

// --- Funciones de Compartir ---

export async function addShare(db, { file_id, owner_user_id, recipient_user_id, encrypted_aes_key_for_recipient }) {
    const created_at = new Date().toISOString();
    await db.run(
        `INSERT INTO file_shares (file_id, owner_user_id, recipient_user_id, encrypted_aes_key_for_recipient, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [file_id, owner_user_id, recipient_user_id, encrypted_aes_key_for_recipient, created_at]
    );
}

export async function getShare(db, file_id, recipient_user_id) {
    return db.get(
        `SELECT * FROM file_shares WHERE file_id = ? AND recipient_user_id = ?`,
        [file_id, recipient_user_id]
    );
}

export async function listFilesSharedWithUser(db, recipient_user_id) {
    // Esta consulta une la tabla de compartidos con la de archivos
    // para obtener los detalles del archivo y quién lo compartió (el propietario)
    return db.all(`
        SELECT
            f.id,
            f.original_name,
            f.aes_algo,
            u.username AS owner_username,
            s.created_at
        FROM file_shares s
        JOIN files f ON s.file_id = f.id
        JOIN users u ON s.owner_user_id = u.id
        WHERE s.recipient_user_id = ?
        ORDER BY s.created_at DESC
    `, [recipient_user_id]);
}

// --- Funciones antiguas (adaptadas o eliminadas) ---
// getByOutput y listAll ya no son necesarias en el modo multiusuario,
// las reemplazamos por getFileById, listFilesByOwner y listFilesSharedWithUser.