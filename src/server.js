// src/server.js
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { openDb, addFile, getByOutput, listAll } from './db.js';
import {
  aes128Encrypt, aes128Decrypt,
  generateRsaKeypair, rsaPublicEncrypt, rsaPrivateDecrypt,
  protectPrivateKeyWithPassword, recoverPrivateKeyFromPassword
} from './cryptoUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
const KEYS_DIR = path.join(__dirname, '..', 'keys');
const OUT_ENC = path.join(__dirname, '..', 'encrypted');
const OUT_DEC = path.join(__dirname, '..', 'decrypted');
const DB_PATH = path.join(__dirname, '..', 'keys', 'keys.db');

if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
if (!fs.existsSync(OUT_ENC)) fs.mkdirSync(OUT_ENC, { recursive: true });
if (!fs.existsSync(OUT_DEC)) fs.mkdirSync(OUT_DEC, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Static frontend ---
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  '/encrypted',
  express.static(OUT_ENC, {
    dotfiles: 'deny',
    fallthrough: false,
    maxAge: '1h'
  })
);

// --- API ---

// Init keys

app.post('/api/init', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'password requerido' });
        
        const pubKeyPath = path.join(KEYS_DIR, 'public_key.pem');
        const privKeyPath = path.join(KEYS_DIR, 'private_key.enc');
        
        // ✅ VERIFICAR si las claves ya existen
        if (fs.existsSync(pubKeyPath) && fs.existsSync(privKeyPath)) {
            return res.status(400).json({ 
                ok: false,
                error: 'Las claves ya existen. No se pueden regenerar.',
                code: 'KEYS_ALREADY_EXIST'
            });
        }
        
        const { publicKey, privateKey } = generateRsaKeypair(2048);
        const blob = protectPrivateKeyWithPassword(privateKey, password);
        fs.writeFileSync(pubKeyPath, publicKey);
        fs.writeFileSync(privKeyPath, JSON.stringify(blob, null, 2));
        
        return res.json({ 
            ok: true, 
            message: 'Par RSA generado y clave privada protegida.' 
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Encrypt upload
app.get('/api/download/:name', (req, res) => {
  const safe = path.basename(req.params.name); // evita path traversal
  const file = path.join(OUT_ENC, safe);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ ok: false, error: 'No encontrado' });
  }
  res.download(file, safe);
});

app.post('/api/encrypt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file requerido (multipart/form-data)' });
    const pubPem = fs.readFileSync(path.join(KEYS_DIR, 'public_key.pem'), 'utf8');
    const aesKey = cryptoRandom(16);
    const { nonce, ciphertext, tag } = aes128Encrypt(req.file.buffer, aesKey);

    const outName = req.file.originalname + '.enc';
    const outPath = path.join(OUT_ENC, outName);
    fs.writeFileSync(outPath, ciphertext);

    // ✅ Cambio importante: cifrar solo la clave AES (16 bytes)
    const wrapped = rsaPublicEncrypt(pubPem, aesKey);
    
    const db = await openDb(DB_PATH);
    await addFile(db, {
      original_name: req.file.originalname,
      output_path: outPath,
      rsa_encrypted_key: wrapped.toString('base64'),
      nonce: nonce.toString('base64'),
      tag: tag.toString('base64'),
      aes_algo: 'AES-128-GCM'
    });

    return res.json({
      ok: true,
      encryptedPath: outPath,
      outName,
      url: `/encrypted/${encodeURIComponent(outName)}`,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


// Decrypt
app.post('/api/decrypt', async (req, res) => {
  try {
    const { id, password } = req.body;
    if (!id || !password) {
      return res.status(400).json({ error: 'id y password requeridos' });
    }

    // Leer y descifrar la clave privada RSA
    const blobPath = path.join(KEYS_DIR, 'private_key.enc');
    if (!fs.existsSync(blobPath)) {
      return res.status(404).json({ error: 'No se encontró private_key.enc. Ejecuta /api/init primero.' });
    }
    const blob = JSON.parse(fs.readFileSync(blobPath, 'utf8'));
    const privPem = recoverPrivateKeyFromPassword(blob, password);

    // Abrir DB y buscar el archivo por id
    const db = await openDb(DB_PATH);
    const row = await db.get(
      `SELECT * FROM files WHERE id = ?`,
      [id]
    );
    if (!row) return res.status(404).json({ error: 'No hay metadatos para ese archivo' });

    console.log('Descifrando archivo ID:', id);
    console.log('Clave RSA cifrada (base64 length):', row.rsa_encrypted_key.length);

    // Descifrar clave AES y luego el archivo
    const aesKey = rsaPrivateDecrypt(privPem, row.rsa_encrypted_key);
    console.log('Clave AES descifrada (length):', aesKey.length);

    const ct = fs.readFileSync(row.output_path);
    const pt = aes128Decrypt(
      Buffer.from(row.nonce, 'base64'),
      ct,
      Buffer.from(row.tag, 'base64'),
      aesKey
    );

    // Guardar archivo descifrado en la carpeta decrypted
    const outName = row.original_name;
    const outPath = path.join(OUT_DEC, outName);
    fs.writeFileSync(outPath, pt);

    return res.json({ ok: true, decryptedPath: outPath, outName });

  } catch (e) {
    console.error('Error descifrando:', e);
    return res.status(500).json({ error: e.message });
  }
});


// List
app.get('/api/list', async (_req, res) => {
  try {
    const db = await openDb(DB_PATH);
    const rows = await listAll(db);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/check-keys', (req, res) => {
    try {
        const pubKeyPath = path.join(KEYS_DIR, 'public_key.pem');
        const privKeyPath = path.join(KEYS_DIR, 'private_key.enc');
        
        const keysExist = fs.existsSync(pubKeyPath) && fs.existsSync(privKeyPath);
        
        return res.json({ 
            keysExist,
            publicKeyExists: fs.existsSync(pubKeyPath),
            privateKeyExists: fs.existsSync(privKeyPath)
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// Verificar si una contraseña es correcta para las claves existentes
app.post('/api/verify-password', (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'password requerido' });
        }

        const privKeyPath = path.join(KEYS_DIR, 'private_key.enc');
        
        // Verificar que existe la clave privada cifrada
        if (!fs.existsSync(privKeyPath)) {
            return res.json({ 
                ok: false, 
                error: 'No hay claves existentes. Debes ejecutar /api/init primero.' 
            });
        }

        // Intentar descifrar la clave privada con la contraseña proporcionada
        const blob = JSON.parse(fs.readFileSync(privKeyPath, 'utf8'));
        const privPem = recoverPrivateKeyFromPassword(blob, password);
        
        // Si llegamos aquí sin errores, la contraseña es correcta
        return res.json({ 
            ok: true, 
            message: 'Contraseña correcta' 
        });
        
    } catch (e) {
        // Si hay error al descifrar, la contraseña es incorrecta
        return res.json({ 
            ok: false, 
            error: 'Contraseña incorrecta' 
        });
    }
});


app.listen(PORT, () => console.log(`Secure Media server running at http://localhost:${PORT}`));

import crypto from 'crypto';
function cryptoRandom(n) { return crypto.randomBytes(n); }
