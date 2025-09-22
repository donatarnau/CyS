# Secure Media (Node.js) — Fase 1

Servicio y CLI en **Node.js** para **cifrar archivos multimedia** con **AES-128-GCM (clave distinta por archivo)**.
Las **claves AES** se protegen cifrándolas con **RSA-OAEP-SHA256** (clave pública). La **clave privada RSA** se guarda **cifrada con AES-128-GCM**, derivada de contraseña con **PBKDF2-HMAC-SHA256 (200k)**.

Incluye un **frontend HTML/CSS/JS** para subir archivos y probar el sistema desde el navegador.

## Requisitos
- Node.js 18+
- `npm install`

## Scripts útiles
```bash
npm run init-keys       # Genera par RSA y cifra la clave privada (pedirá contraseña por consola)
npm run encrypt -- -i archivo.jpg carpeta/  # Cifra (recursivo en carpetas)
npm run list            # Lista entradas
npm run decrypt -- -i encrypted/archivo.jpg.enc  # Descifra (pedirá contraseña)
npm start               # Levanta el servidor y el frontend en http://localhost:3000
```

## Endpoints principales (servidor)
- `POST /api/init`  { password } → genera par de claves y guarda `keys/public_key.pem` y `keys/private_key.enc`.
- `POST /api/encrypt`  (form-data con `file`) → cifra y guarda en `encrypted/`.
- `POST /api/decrypt`  { encPath, password } → descifra y escribe en `decrypted/` devolviendo nombre.
- `GET /api/list` → lista metadatos de la base SQLite `keys/keys.db`.

Frontend disponible en `/`.

## Nota
Para producción, protege estos endpoints con autenticación; esta Fase 1 es con fines docentes.
