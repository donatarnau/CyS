// src/cli.js
#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';
import {
  generateRsaKeypair, protectPrivateKeyWithPassword, recoverPrivateKeyFromPassword,
  aes128Encrypt, aes128Decrypt, rsaPublicEncrypt, rsaPrivateDecrypt
} from './cryptoUtils.js';
import { openDb, addFile, getByOutput, listAll } from './db.js';
import crypto from 'crypto';
import { statSync, readdirSync } from 'fs';

const program = new Command();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEYS_DIR = path.join(__dirname, '..', 'keys');
const OUT_ENC = path.join(__dirname, '..', 'encrypted');
const OUT_DEC = path.join(__dirname, '..', 'decrypted');
const DB_PATH = path.join(__dirname, '..', 'keys', 'keys.db');
[KEYS_DIR, OUT_ENC, OUT_DEC].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

function promptHidden(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    process.stdout.write(query);
    // Turn off echo:
    const setRaw = process.stdin.isTTY && process.stdin.setRawMode;
    if (setRaw) process.stdin.setRawMode(true);
    let input = '';
    const onData = (char) => {
      char = char + '';
      switch (char) {
        case '\n': case '\r': case '\u0004':
          process.stdout.write('\n');
          process.stdin.removeListener('data', onData);
          if (setRaw) process.stdin.setRawMode(false);
          rl.close();
          resolve(input);
          break;
        case '\u0003':
          process.exit();
        default:
          process.stdout.write('*');
          input += char;
          break;
      }
    };
    process.stdin.on('data', onData);
  });
}

program
  .name('smtool')
  .description('Secure Media CLI (Fase 1)')
  .version('1.0.0');

program
  .command('init')
  .description('Generar par RSA y proteger clave privada con AES-128-GCM (PBKDF2)')
  .action(async () => {
    const password = await promptHidden('Crea una contraseña: ');
    if (!password) { console.error('La contraseña no puede estar vacía'); process.exit(1); }
    const { publicKey, privateKey } = generateRsaKeypair(2048);
    const blob = protectPrivateKeyWithPassword(privateKey, password);
    fs.writeFileSync(path.join(KEYS_DIR, 'public_key.pem'), publicKey);
    fs.writeFileSync(path.join(KEYS_DIR, 'private_key.enc'), JSON.stringify(blob, null, 2));
    console.log(`Par RSA generado en ${KEYS_DIR}`);
  });

program
  .command('encrypt')
  .description('Cifrar archivos/carpetas (recursivo)')
  .option('-i, --input <paths...>', 'Archivos/carpetas a cifrar')
  .action(async (opts) => {
    const inputs = opts.input || [];
    if (inputs.length === 0) { console.error('Debes indicar al menos un archivo o carpeta'); process.exit(1); }
    const pubPem = fs.readFileSync(path.join(KEYS_DIR, 'public_key.pem'), 'utf8');
    const db = await openDb(DB_PATH);

    const handlePath = (p) => {
      const st = statSync(p);
      if (st.isDirectory()) {
        readdirSync(p).forEach(name => handlePath(path.join(p, name)));
        return;
      }
      const buf = fs.readFileSync(p);
      const aesKey = crypto.randomBytes(16);
      const { nonce, ciphertext, tag } = aes128Encrypt(buf, aesKey);
      const outName = path.basename(p) + '.enc';
      const outPath = path.join(OUT_ENC, outName);
      fs.writeFileSync(outPath, ciphertext);
      const wrapped = rsaPublicEncrypt(pubPem, aesKey);
      addFile(db, {
        original_name: path.basename(p),
        output_path: outPath,
        rsa_encrypted_key: wrapped,
        nonce, tag, aes_algo: 'AES-128-GCM'
      });
      console.log(`[OK] ${p} -> ${outPath}`);
    };

    inputs.forEach(handlePath);
  });

program
  .command('decrypt')
  .description('Descifrar un archivo cifrado (.enc)')
  .option('-i, --input <encPath>', 'Ruta al archivo cifrado (.enc)')
  .action(async (opts) => {
    const encPath = opts.input;
    if (!encPath) { console.error('Debes indicar --input'); process.exit(1); }
    const password = await promptHidden('Contraseña: ');
    const blob = JSON.parse(fs.readFileSync(path.join(KEYS_DIR, 'private_key.enc'), 'utf8'));
    const privPem = recoverPrivateKeyFromPassword(blob, password);
    const db = await openDb(DB_PATH);
    const row = await getByOutput(db, path.resolve(encPath));
    if (!row) { console.error('No hay metadatos para ese archivo'); process.exit(1); }
    const aesKey = rsaPrivateDecrypt(privPem, row.rsa_encrypted_key);
    const ct = fs.readFileSync(row.output_path);
    const pt = aes128Decrypt(row.nonce, ct, row.tag, aesKey);
    const outPath = path.join(OUT_DEC, row.original_name);
    fs.writeFileSync(outPath, pt);
    console.log(`[OK] ${encPath} -> ${outPath}`);
  });

program
  .command('list')
  .description('Listar entradas de la base de metadatos')
  .action(async () => {
    const db = await openDb(DB_PATH);
    const rows = await listAll(db);
    if (rows.length === 0) { console.log('(vacío)'); return; }
    console.log('ID | Original -> Cifrado | Algoritmo | Fecha (UTC)');
    rows.forEach(r => console.log(`${r.id} | ${r.original_name} -> ${r.output_path} | ${r.aes_algo} | ${r.created_at}`));
  });

program.parse();
