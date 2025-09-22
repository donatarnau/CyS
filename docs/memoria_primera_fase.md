# Memoria — Primera Fase (Node.js)

## 1. Tecnologías
- **Node.js 18+**
- **Express** + **Multer** (subida de ficheros)
- **sqlite3** (metadatos)
- Criptografía: módulo **crypto** de Node

## 2. Diseño
- **AES-128-GCM** por archivo (clave aleatoria de 16 bytes, nonce de 12 bytes).
- **RSA 2048** para envolver la clave AES por archivo (**OAEP-SHA256**).
- **Clave privada protegida con AES-128-GCM**: contraseña → PBKDF2-HMAC-SHA256 (200k) → clave 128-bit; se almacena JSON con `salt`, `nonce`, `tag`, `ciphertext` en base64.
- **SQLite** guarda metadatos: ruta original, ruta cifrada, nonce, clave AES envuelta (base64), algoritmo y fecha.

## 3. Seguridad
- GCM garantiza confidencialidad e integridad.
- OAEP-SHA256 evita debilidades del RSA clásico.
- La clave privada nunca se persiste en claro.

## 4. Mejoras futuras
- Multiusuario y roles.
- Firma de metadatos y/o MAC adicional.
- Empaquetar nonce junto al `.enc` para portabilidad sin BD.
