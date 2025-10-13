// src/cryptoUtils.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// -------- AES-128-GCM helpers --------
export function aes128Encrypt(plaintextBuf, keyBuf, nonceBuf = null, aad = null) {
  if (keyBuf.length !== 16) throw new Error('AES-128 key must be 16 bytes');
  const iv = nonceBuf || crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-128-gcm', keyBuf, iv);
  if (aad) cipher.setAAD(aad);
  const enc = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce: iv, ciphertext: enc, tag };
}

export function aes128Decrypt(nonceBuf, ciphertextBuf, tagBuf, keyBuf, aad = null) {
  if (keyBuf.length !== 16) throw new Error('AES-128 key must be 16 bytes');
  const decipher = crypto.createDecipheriv('aes-128-gcm', keyBuf, nonceBuf);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tagBuf);
  const dec = Buffer.concat([decipher.update(ciphertextBuf), decipher.final()]);
  return dec;
}

// -------- RSA helpers --------
export function generateRsaKeypair(bits = 2048) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  return { publicKey, privateKey };
}

// cryptoUtils.js - función rsaPublicEncrypt
export function rsaPublicEncrypt(publicKeyPem, data) {
  try {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      buffer
    );
  } catch (error) {
    console.error('Error en rsaPublicEncrypt:', error);
    throw new Error(`Fallo en cifrado RSA: ${error.message}`);
  }
}

// cryptoUtils.js - función rsaPrivateDecrypt
export function rsaPrivateDecrypt(privateKeyPem, encryptedData) {
  try {
    const buffer = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData, 'base64');
    return crypto.privateDecrypt(
      {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      buffer
    );
  } catch (error) {
    console.error('Error en rsaPrivateDecrypt:', error);
    throw new Error(`Fallo en descifrado RSA: ${error.message}`);
  }
}
// -------- Protect private key with AES-128-GCM + PBKDF2 --------
export function protectPrivateKeyWithPassword(privateKeyPem, password, iters = 200_000) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iters, 16, 'sha256'); // 128-bit
  const { nonce, ciphertext, tag } = aes128Encrypt(Buffer.from(privateKeyPem, 'utf8'), key);
  return {
    salt_b64: salt.toString('base64'),
    nonce_b64: nonce.toString('base64'),
    tag_b64: tag.toString('base64'),
    ciphertext_b64: ciphertext.toString('base64'),
    kdf_iters: iters
  };
}

export function recoverPrivateKeyFromPassword(blob, password) {
  const salt = Buffer.from(blob.salt_b64, 'base64');
  const nonce = Buffer.from(blob.nonce_b64, 'base64');
  const tag = Buffer.from(blob.tag_b64, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext_b64, 'base64');
  const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, blob.kdf_iters, 16, 'sha256');
  const pem = aes128Decrypt(nonce, ciphertext, tag, key);
  return pem.toString('utf8');
}
