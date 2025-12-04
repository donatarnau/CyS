// src/server.js
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import session from 'express-session';
import connectSqlite from 'connect-sqlite3';

import {
  openDb,
  createUser, getUserByUsername, getUserById,
  addFile, getFileById, listFilesByOwner,
  addShare, getShare, listFilesSharedWithUser
} from './db.js';

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

// Asegurar que existen las carpetas
if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
if (!fs.existsSync(OUT_ENC)) fs.mkdirSync(OUT_ENC, { recursive: true });
if (!fs.existsSync(OUT_DEC)) fs.mkdirSync(OUT_DEC, { recursive: true });

const storage = multer.memoryStorage();
const upload = multer({ storage });
const BCRYPT_ROUNDS = 12;

// Configuración de Sesión
const SQLiteStore = connectSqlite(session);

app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: path.join(__dirname, '..', 'keys'),
        table: 'sessions'
    }),
    secret: 'un_secreto_muy_fuerte_para_cys',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}));

// Middleware de Autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado. Debes iniciar sesión.' });
    }
};


// Frontend Estático
// Servir la app principal (index.html) solo si está autenticado
app.use(
    '/',
    (req, res, next) => {
        if (req.path === '/' || req.path === '/index.html') {
            if (req.session.userId) {
                next();
            } else {
                res.redirect('/login.html');
            }
        } else {
            next();
        }
    },
    express.static(path.join(__dirname, '..', 'public'))
);

// Servir archivos descifrados (solo para descargas)
app.use('/decrypted', isAuthenticated, express.static(OUT_DEC));

// API de Autenticación

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || password.length < 8) {
            return res.status(400).json({ error: 'Usuario y contraseña (mín 8 caracteres) requeridos' });
        }

        const db = await openDb(DB_PATH);
        const existingUser = await getUserByUsername(db, username);
        if (existingUser) {
            return res.status(409).json({ error: 'El nombre de usuario ya existe' });
        }

        // Hashear la contraseña del usuario
        const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Generar el par de claves RSA para el usuario
        const { publicKey, privateKey } = generateRsaKeypair(2048);

        // Proteger la clave privada RSA del usuario con su propia contraseña
        const blob = protectPrivateKeyWithPassword(privateKey, password);
        const encrypted_private_key_rsa = JSON.stringify(blob);

        // Guardar usuario en la BD
        const userId = await createUser(db, {
            username,
            password_hash,
            public_key_rsa: publicKey,
            encrypted_private_key_rsa
        });

        // Iniciar sesión automáticamente
        req.session.userId = userId;
        req.session.username = username;

        res.status(201).json({ ok: true, message: 'Usuario registrado e iniciado sesión', userId });
    } catch (e) {
        console.error('Error en /api/register:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        }

        const db = await openDb(DB_PATH);
        const user = await getUserByUsername(db, username);
        if (!user) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // Verificar el hash de la contraseña
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // Iniciar sesión guardando en la sesión
        req.session.userId = user.id;
        req.session.username = user.username;

        res.json({ ok: true, message: 'Inicio de sesión correcto' });
    } catch (e) {
        console.error('Error en /api/login:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'No se pudo cerrar sesión' });
        }
        res.clearCookie('connect.sid');
        res.json({ ok: true, message: 'Sesión cerrada' });
    });
});

app.get('/api/session', (req, res) => {
    if (req.session.userId) {
        res.json({ ok: true, userId: req.session.userId, username: req.session.username });
    } else {
        res.json({ ok: false });
    }
});

// API de Archivos

// Endpoint para subir y cifrar un archivo
app.post('/api/encrypt', isAuthenticated, upload.single('file'), async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.session.userId;
        
        if (!req.file) return res.status(400).json({ error: 'file requerido' });
        if (!password) return res.status(400).json({ error: 'password requerido para confirmar' });

        const db = await openDb(DB_PATH);
        
        // Verificar la contraseña del usuario (como medida de seguridad)
        const user = await getUserById(db, userId);
        const userDb = await getUserByUsername(db, user.username);
        const match = await bcrypt.compare(password, userDb.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }
        
        // Generar clave AES aleatoria para este archivo
        const aesKey = crypto.randomBytes(16);
        
        // Cifrar el archivo con AES-GCM
        const { nonce, ciphertext, tag } = aes128Encrypt(req.file.buffer, aesKey);

        const outName = `${crypto.randomBytes(16).toString('hex')}-${req.file.originalname}.enc`;
        const outPath = path.join(OUT_ENC, outName);
        fs.writeFileSync(outPath, ciphertext);

        // Cifrar la clave AES con la clave pública RSA del propietario
        const wrappedKey = rsaPublicEncrypt(user.public_key_rsa, aesKey);

        // Guardar metadatos en la BD
        await addFile(db, {
            owner_user_id: userId,
            original_name: req.file.originalname,
            output_path: outPath,
            encrypted_aes_key_for_owner: wrappedKey.toString('base64'),
            nonce: nonce.toString('base64'),
            tag: tag.toString('base64'),
            aes_algo: 'AES-128-GCM'
        });

        return res.json({
            ok: true,
            message: 'Archivo cifrado y guardado',
            outName: req.file.originalname,
        });
    } catch (e) {
        console.error('Error en /api/encrypt:', e);
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para descifrar un archivo (propio o compartido)
app.post('/api/decrypt', isAuthenticated, async (req, res) => {
    try {
        const { id, password } = req.body;
        const userId = req.session.userId;

        if (!id || !password) {
            return res.status(400).json({ error: 'id y password requeridos' });
        }

        const db = await openDb(DB_PATH);
        
        // Obtener los datos del usuario actual
        const user = await getUserById(db, userId);
        const userDb = await getUserByUsername(db, user.username);
        
        // Verificar la contraseña del usuario
        const match = await bcrypt.compare(password, userDb.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        // Descifrar la clave privada RSA del usuario
        const blob = JSON.parse(user.encrypted_private_key_rsa);
        const userPrivateRsaKey = recoverPrivateKeyFromPassword(blob, password);

        // Obtener los metadatos del archivo
        const file = await getFileById(db, id);
        if (!file) {
            return res.status(404).json({ error: 'Archivo no encontrado' });
        }

        let encryptedAesKeyB64;

        // Comprobar permisos: ¿Es el propietario?
        if (file.owner_user_id === userId) {
            encryptedAesKeyB64 = file.encrypted_aes_key_for_owner;
        } else {
            // Si no es propietario, ¿se lo han compartido?
            const share = await getShare(db, id, userId);
            if (share) {
                encryptedAesKeyB64 = share.encrypted_aes_key_for_recipient;
            } else {
                return res.status(403).json({ error: 'Acceso denegado a este archivo' });
            }
        }

        // Descifrar la clave AES del archivo usando la clave privada RSA del usuario
        const aesKey = rsaPrivateDecrypt(userPrivateRsaKey, encryptedAesKeyB64);
        
        // Leer el archivo cifrado del disco
        const ct = fs.readFileSync(file.output_path);
        
        // Descifrar el archivo con la clave AES
        const pt = aes128Decrypt(
            Buffer.from(file.nonce, 'base64'),
            ct,
            Buffer.from(file.tag, 'base64'),
            aesKey
        );

        // Guardar archivo descifrado temporalmente en /decrypted
        const outName = file.original_name;
        const outPath = path.join(OUT_DEC, outName);
        fs.writeFileSync(outPath, pt);

        // Devolver la ruta para descargar
        return res.json({ ok: true, outName });

    } catch (e) {
        console.error('Error en /api/decrypt:', e);
        if (e.message.includes('unsupported state') || e.message.includes('Fallo en descifrado')) {
             return res.status(401).json({ error: 'Contraseña incorrecta o datos corruptos' });
        }
        return res.status(500).json({ error: e.message });
    }
});

// Endpoint para listar archivos propios
app.get('/api/my-files', isAuthenticated, async (req, res) => {
    try {
        const db = await openDb(DB_PATH);
        const rows = await listFilesByOwner(db, req.session.userId);
        return res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para listar archivos compartidos con el usuario
app.get('/api/shared-with-me', isAuthenticated, async (req, res) => {
    try {
        const db = await openDb(DB_PATH);
        const rows = await listFilesSharedWithUser(db, req.session.userId);
        return res.json(rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Endpoint para compartir un archivo
app.post('/api/share', isAuthenticated, async (req, res) => {
    try {
        const { fileId, recipientUsername, ownerPassword } = req.body;
        const ownerUserId = req.session.userId;

        if (!fileId || !recipientUsername || !ownerPassword) {
            return res.status(400).json({ error: 'fileId, recipientUsername y ownerPassword requeridos' });
        }

        if (recipientUsername === req.session.username) {
            return res.status(400).json({ error: 'No puedes compartir un archivo contigo mismo' });
        }

        const db = await openDb(DB_PATH);

        // Verificar la contraseña del propietario
        const ownerUser = await getUserById(db, ownerUserId);
        const ownerUserDb = await getUserByUsername(db, ownerUser.username);
        const match = await bcrypt.compare(ownerPassword, ownerUserDb.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Contraseña de propietario incorrecta' });
        }

        // Obtener la clave privada RSA del propietario
        const ownerBlob = JSON.parse(ownerUser.encrypted_private_key_rsa);
        const ownerPrivateRsaKey = recoverPrivateKeyFromPassword(ownerBlob, ownerPassword);

        // Obtener los metadatos del archivo y verificar que el usuario es el propietario
        const file = await getFileById(db, fileId);
        if (!file || file.owner_user_id !== ownerUserId) {
            return res.status(403).json({ error: 'No eres el propietario de este archivo' });
        }

        // Obtener al usuario destinatario
        const recipientUser = await getUserByUsername(db, recipientUsername);
        if (!recipientUser) {
            return res.status(404).json({ error: 'Usuario destinatario no encontrado' });
        }
        
        // Descifrar la clave AES del archivo usando la clave privada del propietario
        const aesKey = rsaPrivateDecrypt(ownerPrivateRsaKey, file.encrypted_aes_key_for_owner);

        // Cifrar la clave AES con la clave pública RSA del destinatario
        const encryptedKeyForRecipient = rsaPublicEncrypt(recipientUser.public_key_rsa, aesKey);

        // Guardar el registro de compartición en la BD
        await addShare(db, {
            file_id: fileId,
            owner_user_id: ownerUserId,
            recipient_user_id: recipientUser.id,
            encrypted_aes_key_for_recipient: encryptedKeyForRecipient.toString('base64')
        });

        res.json({ ok: true, message: `Archivo compartido con ${recipientUsername}` });

    } catch (e) {
        console.error('Error en /api/share:', e);
        res.status(500).json({ error: e.message });
    }
});


// Iniciar Servidor
app.listen(PORT, () => console.log(`Servidor ejecutándose en http://localhost:${PORT}`));