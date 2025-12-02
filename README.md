# 🔐 Secure Media — Sistema de Cifrado de Archivos Multimedia

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=nodedotjs)
![Express](https://img.shields.io/badge/Express-4.19-000000?style=for-the-badge&logo=express)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

**Sistema completo de cifrado de archivos multimedia con arquitectura híbrida AES-128-GCM + RSA-OAEP**

[Características](#-características-principales) • [Instalación](#-instalación) • [Uso](#-uso) • [Arquitectura](#-arquitectura-de-seguridad) • [API](#-documentación-de-la-api)

</div>

---

## 📋 Tabla de Contenidos

- [Descripción General](#-descripción-general)
- [Características Principales](#-características-principales)
- [Arquitectura de Seguridad](#-arquitectura-de-seguridad)
- [Tecnologías Utilizadas](#-tecnologías-utilizadas)
- [Instalación](#-instalación)
- [Uso](#-uso)
  - [Interfaz de Línea de Comandos (CLI)](#interfaz-de-línea-de-comandos-cli)
  - [Interfaz Web](#interfaz-web)
  - [API REST](#api-rest)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Documentación de la API](#-documentación-de-la-api)
- [Seguridad](#-seguridad)
- [Desarrollo](#-desarrollo)

---

## 🎯 Descripción General

**Secure Media** es una solución completa de cifrado de archivos multimedia desarrollada en Node.js que implementa un sistema de criptografía híbrida para garantizar la máxima seguridad en el almacenamiento y compartición de archivos sensibles.

El sistema combina:
- **Cifrado simétrico** AES-128-GCM para archivos (rendimiento y seguridad)
- **Cifrado asimétrico** RSA-2048-OAEP para protección de claves
- **Derivación de claves** con PBKDF2-HMAC-SHA256 (200.000 iteraciones)
- **Gestión multiusuario** con sistema de autenticación y compartición segura
- **Triple interfaz**: CLI, API REST y aplicación web

### 🎓 Proyecto Académico
Este proyecto fue desarrollado como parte de la asignatura **Criptografía y Seguridad** de la Universidad, implementando conceptos avanzados de:
- Criptografía simétrica y asimétrica
- Gestión de claves y certificados
- Funciones de derivación de claves (KDF)
- Modos de operación autenticados (AEAD)
- Arquitecturas de seguridad en aplicaciones web

---

## ✨ Características Principales

### 🔒 Seguridad Robusta
- **Cifrado AES-128-GCM** con autenticación integrada (AEAD)
- **Claves únicas** por archivo (rotación automática)
- **RSA-OAEP-SHA256** para envoltorio de claves
- **PBKDF2-HMAC-SHA256** con 200.000 iteraciones para derivación de claves
- **Protección de claves privadas** mediante cifrado simétrico
- **Sesiones seguras** con cookies httpOnly

### 👥 Sistema Multiusuario (Fase 2)
- **Registro e inicio de sesión** con bcrypt (12 rondas)
- **Pares de claves RSA individuales** por usuario
- **Compartición segura** entre usuarios (re-cifrado de claves AES)
- **Control de acceso** basado en sesiones
- **Gestión de permisos** a nivel de archivo

### 🚀 Triple Interfaz
1. **CLI (Command Line Interface)**
   - Herramienta `smtool` para automatización
   - Operaciones batch y scripting
   - Procesamiento recursivo de directorios

2. **API REST**
   - Endpoints documentados y organizados
   - Autenticación basada en sesiones
   - Formato JSON estándar

3. **Interfaz Web**
   - Dashboard intuitivo y responsivo
   - Cifrado y descifrado en un click
   - Gestión visual de archivos compartidos
   - Feedback en tiempo real

### 📦 Gestión Completa
- **Subida y cifrado** automático de archivos
- **Descifrado on-demand** con validación de contraseña
- **Listado de archivos** propios y compartidos
- **Compartición segura** entre usuarios registrados
- **Metadatos protegidos** en SQLite
- **Almacenamiento organizado** por tipo de operación

---

## 🏗️ Arquitectura de Seguridad

### Flujo de Cifrado Híbrido

El sistema implementa un esquema de cifrado híbrido que combina las ventajas de la criptografía simétrica y asimétrica:

1. **Generación de Clave Simétrica**: Cuando un usuario sube un archivo, el sistema genera una clave AES-128 única y aleatoria de 16 bytes específicamente para ese archivo. Esta práctica garantiza que cada archivo tenga su propia clave, minimizando el riesgo en caso de compromiso.

2. **Cifrado del Archivo**: El archivo original se cifra usando **AES-128-GCM** con la clave generada. Este modo de operación autenticado (AEAD) proporciona tanto confidencialidad como autenticación de datos, generando un nonce de 12 bytes y un tag de autenticación de 16 bytes.

3. **Almacenamiento del Archivo Cifrado**: El contenido cifrado se guarda en el directorio `encrypted/` con extensión `.enc`, asegurando una separación clara entre archivos originales y cifrados.

4. **Protección de la Clave AES**: La clave AES utilizada para cifrar el archivo se protege mediante cifrado asimétrico. Se cifra utilizando la **clave pública RSA** del usuario propietario con el esquema **RSA-OAEP-SHA256**, que añade padding aleatorio y previene ataques de texto cifrado elegido.

5. **Persistencia de Metadatos**: En la base de datos SQLite se almacenan los metadatos críticos: nombre original del archivo, ruta del archivo cifrado, la clave AES envuelta (cifrada con RSA), el nonce, el tag de autenticación y la marca temporal. Esta información es esencial para el proceso de descifrado posterior.

### Protección de Claves Privadas

Las claves privadas RSA de los usuarios nunca se almacenan en texto plano. El sistema implementa un robusto mecanismo de protección:

1. **Derivación de Clave desde Contraseña**: Cuando un usuario se registra y proporciona su contraseña, el sistema utiliza **PBKDF2-HMAC-SHA256** con 200.000 iteraciones para derivar una clave de cifrado de 16 bytes. Se genera un salt aleatorio de 16 bytes único para cada usuario, que se almacena junto con la clave privada cifrada.

2. **Cifrado de la Clave Privada**: La clave privada RSA (en formato PEM) se cifra usando **AES-128-GCM** con la clave derivada de la contraseña del usuario. Este proceso genera un nonce y un tag de autenticación.

3. **Almacenamiento Seguro**: Se almacena un objeto JSON conteniendo el salt, el nonce, el tag de autenticación y el texto cifrado (todos en formato base64). Solo conociendo la contraseña correcta es posible derivar la clave de descifrado y recuperar la clave privada RSA.

4. **Verificación en el Descifrado**: Cada vez que el usuario necesita descifrar un archivo o compartirlo, debe proporcionar su contraseña. El sistema deriva la clave, intenta descifrar la clave privada RSA y valida la autenticación mediante el tag GCM. Si la contraseña es incorrecta, el descifrado falla y se rechaza la operación.

### Sistema de Compartición Segura

La compartición de archivos entre usuarios mantiene la seguridad extremo a extremo mediante re-cifrado de claves:

1. **Solicitud de Compartición**: Cuando el usuario A (propietario) desea compartir un archivo con el usuario B (destinatario), debe autenticarse proporcionando su contraseña para demostrar que tiene autorización.

2. **Recuperación de la Clave AES**: El sistema utiliza la contraseña del usuario A para descifrar su clave privada RSA. Con esta clave privada, se descifra la clave AES envuelta que protege el archivo en cuestión, obteniendo así la clave AES en texto plano.

3. **Re-cifrado para el Destinatario**: La clave AES recuperada se cifra nuevamente, pero esta vez utilizando la **clave pública RSA del usuario B**. Este proceso garantiza que solo el usuario B pueda descifrar la clave AES usando su propia clave privada.

4. **Registro de la Compartición**: Se crea un nuevo registro en la tabla `file_shares` de la base de datos, almacenando el ID del archivo, los IDs de ambos usuarios (propietario y destinatario), y la clave AES cifrada específicamente para el usuario B.

5. **Acceso del Destinatario**: Cuando el usuario B desea acceder al archivo compartido, proporciona su contraseña para descifrar su propia clave privada RSA. Con ella, descifra la clave AES específica del archivo compartido y puede proceder a descifrar el contenido del archivo.

Este mecanismo asegura que el archivo permanece cifrado en todo momento y que cada usuario solo puede acceder a él mediante sus propias credenciales, sin necesidad de compartir contraseñas o claves directamente.

---

## 🛠️ Tecnologías Utilizadas

### Backend
- **Node.js** 18+ - Runtime de JavaScript
- **Express.js** 4.19 - Framework web minimalista
- **SQLite3** 5.1 - Base de datos embebida
- **Crypto (built-in)** - Módulo nativo de criptografía de Node.js

### Gestión de Archivos
- **Multer** 1.4.5-lts.1 - Middleware para multipart/form-data
- **FS (built-in)** - Sistema de archivos nativo

### Autenticación y Sesiones
- **bcrypt** 6.0.0 - Hashing de contraseñas
- **express-session** 1.18.2 - Gestión de sesiones
- **connect-sqlite3** 0.9.16 - Store de sesiones en SQLite

### CLI
- **Commander.js** 12.1.0 - Framework para CLI
- **Readline (built-in)** - Entrada interactiva

### Frontend
- **HTML5 / CSS3 / Vanilla JavaScript**
- **Fetch API** - Comunicación con backend
- **FormData API** - Envío de archivos

---

## 📥 Instalación

### Prerrequisitos

```bash
# Verificar versión de Node.js (requiere 18 o superior)
node --version

# Verificar npm
npm --version
```

### Pasos de Instalación

1. **Clonar el repositorio**
```bash
git clone <url-del-repositorio>
cd CyS
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Verificar estructura de directorios**
```bash
# El sistema creará automáticamente estas carpetas si no existen:
# - keys/        (claves y base de datos)
# - encrypted/   (archivos cifrados)
# - decrypted/   (archivos descifrados)
# - subidos/     (archivos temporales del servidor)
```

4. **Inicializar el sistema (Fase 1 - Opcional)**
```bash
# Solo si usas la CLI sin el sistema multiusuario
npm run init-keys
# Se te pedirá crear una contraseña maestra
```

---

## 🚀 Uso

### Interfaz de Línea de Comandos (CLI)

La herramienta `smtool` permite operaciones desde la terminal:

#### Inicializar Claves (Solo Fase 1)
```bash
npm run init-keys
# o directamente:
node src/cli.js init
```
Genera un par de claves RSA-2048 y protege la clave privada con contraseña.

#### Cifrar Archivos
```bash
# Cifrar un archivo
npm run encrypt -- -i foto.jpg

# Cifrar múltiples archivos
npm run encrypt -- -i imagen1.png imagen2.jpg documento.pdf

# Cifrar carpeta completa (recursivo)
npm run encrypt -- -i mi_carpeta/
```

Los archivos cifrados se guardan en `encrypted/` con extensión `.enc`.

#### Listar Archivos Cifrados
```bash
npm run list
```
Muestra todos los metadatos almacenados en la base de datos.

#### Descifrar Archivos
```bash
npm run decrypt -- -i encrypted/foto.jpg.enc
```
Solicita la contraseña y guarda el archivo descifrado en `decrypted/`.

### Interfaz Web

#### 1. Iniciar el Servidor
```bash
npm start
# Servidor escuchando en http://localhost:3000
```

#### 2. Crear Cuenta de Usuario
- Accede a `http://localhost:3000/login.html`
- Haz clic en "Registrarse"
- Completa el formulario:
  - **Usuario**: nombre único
  - **Contraseña**: mínimo 8 caracteres (se recomienda usar mayúsculas, minúsculas, números y símbolos)
- El sistema generará automáticamente tu par de claves RSA

#### 3. Iniciar Sesión
- Ingresa tus credenciales
- Serás redirigido al dashboard principal

#### 4. Dashboard Principal

**Sección 1: Cifrar y Subir Archivo**
- Selecciona un archivo desde tu sistema
- Haz clic en "Cifrar y Subir"
- El archivo se cifrará automáticamente con una clave AES única
- La clave AES se protegerá con tu clave pública RSA

**Sección 2: Mis Archivos**
- Lista todos tus archivos cifrados
- Opciones por archivo:
  - **Descargar**: descifra y descarga (requiere contraseña)
  - **Compartir**: permite compartir con otro usuario

**Sección 3: Archivos Compartidos Conmigo**
- Lista archivos que otros usuarios han compartido contigo
- Puedes descargarlos usando tu contraseña

#### 5. Compartir Archivos
- En "Mis Archivos", haz clic en "Compartir" junto al archivo deseado
- Ingresa el nombre de usuario del destinatario
- Ingresa tu contraseña para autorizar la operación
- El sistema re-cifrará la clave AES con la clave pública del destinatario

### API REST

El servidor expone endpoints RESTful para integración con otras aplicaciones.

#### Autenticación Requerida
Todos los endpoints (excepto login y registro) requieren una sesión activa.

Ver sección [Documentación de la API](#-documentación-de-la-api) para detalles completos.

---

## 📚 Documentación de la API

### Base URL
```
http://localhost:3000/api
```

### Autenticación

#### POST `/api/register`
Registrar nuevo usuario.

**Request Body:**
```json
{
  "username": "usuario123",
  "password": "miContraseña123"
}
```

**Response (201):**
```json
{
  "message": "Usuario registrado con éxito",
  "userId": 1
}
```

**Errores:**
- `400`: Usuario ya existe
- `500`: Error del servidor

---

#### POST `/api/login`
Iniciar sesión.

**Request Body:**
```json
{
  "username": "usuario123",
  "password": "miContraseña123"
}
```

**Response (200):**
```json
{
  "message": "Login exitoso",
  "userId": 1,
  "username": "usuario123"
}
```

**Errores:**
- `401`: Credenciales inválidas

---

#### POST `/api/logout`
Cerrar sesión.

**Response (200):**
```json
{
  "message": "Sesión cerrada"
}
```

---

### Gestión de Archivos

#### POST `/api/encrypt`
Cifrar y subir archivo (requiere autenticación).

**Request:**
- Content-Type: `multipart/form-data`
- Field: `file` (archivo a cifrar)

**Response (200):**
```json
{
  "message": "Archivo cifrado exitosamente",
  "fileId": 42,
  "encryptedPath": "encrypted/abc123-archivo.jpg.enc"
}
```

**Errores:**
- `401`: No autenticado
- `400`: No se proporcionó archivo
- `500`: Error de cifrado

---

#### POST `/api/decrypt`
Descifrar archivo (requiere autenticación).

**Request Body:**
```json
{
  "fileId": 42,
  "password": "miContraseña123"
}
```

**Response (200):**
```json
{
  "message": "Archivo descifrado",
  "downloadPath": "/decrypted/archivo.jpg"
}
```

**Errores:**
- `401`: No autenticado
- `403`: No tienes acceso a este archivo
- `401`: Contraseña incorrecta
- `500`: Error de descifrado

---

#### GET `/api/my-files`
Listar archivos propios (requiere autenticación).

**Response (200):**
```json
{
  "files": [
    {
      "id": 42,
      "original_name": "foto.jpg",
      "output_path": "encrypted/abc123-foto.jpg.enc",
      "created_at": "2025-12-02T10:30:00.000Z",
      "aes_algo": "AES-128-GCM"
    }
  ]
}
```

---

#### GET `/api/shared-with-me`
Listar archivos compartidos conmigo (requiere autenticación).

**Response (200):**
```json
{
  "files": [
    {
      "share_id": 15,
      "file_id": 42,
      "original_name": "documento.pdf",
      "owner_username": "usuario456",
      "created_at": "2025-12-02T11:00:00.000Z"
    }
  ]
}
```

---

### Compartición

#### POST `/api/share`
Compartir archivo con otro usuario (requiere autenticación).

**Request Body:**
```json
{
  "fileId": 42,
  "recipientUsername": "usuario456",
  "password": "miContraseña123"
}
```

**Response (200):**
```json
{
  "message": "Archivo compartido exitosamente",
  "shareId": 15
}
```

**Errores:**
- `401`: No autenticado
- `403`: No eres propietario del archivo
- `404`: Usuario destinatario no encontrado
- `401`: Contraseña incorrecta
- `400`: Ya compartido con este usuario

---

## 🔒 Seguridad

### Algoritmos y Parámetros

| Componente | Algoritmo | Parámetros |
|------------|-----------|------------|
| **Cifrado de archivos** | AES-128-GCM | Clave 128-bit, Nonce 96-bit, Tag 128-bit |
| **Cifrado asimétrico** | RSA-OAEP | Módulo 2048-bit, Padding OAEP, Hash SHA-256 |
| **Derivación de claves** | PBKDF2-HMAC-SHA256 | 200.000 iteraciones, Salt 128-bit |
| **Hash de contraseñas** | bcrypt | 12 rondas (factor de coste 2^12) |
| **Sesiones** | express-session | Cookie httpOnly, SameSite |

### Buenas Prácticas Implementadas

✅ **Claves únicas por archivo** - Cada archivo tiene su propia clave AES

✅ **Modo autenticado (AEAD)** - GCM proporciona integridad y autenticación

✅ **Padding seguro** - OAEP previene ataques de texto cifrado elegido

✅ **KDF robusto** - PBKDF2 con 200k iteraciones resiste fuerza bruta

✅ **Protección de claves privadas** - Nunca se almacenan en claro

✅ **Sesiones seguras** - Cookies httpOnly previenen XSS

✅ **Claves foráneas** - Integridad referencial en SQLite

✅ **Separación de privilegios** - Control de acceso por usuario

---

## 💻 Desarrollo

### Scripts Disponibles

```bash
# Iniciar servidor (producción)
npm start

# Iniciar servidor (desarrollo, con nodemon si está instalado)
npm run dev

# Inicializar claves RSA (CLI)
npm run init-keys

# Cifrar archivos (CLI)
npm run encrypt -- -i <archivos>

# Descifrar archivos (CLI)
npm run decrypt -- -i <archivo.enc>

# Listar metadatos (CLI)
npm run list
```

### Variables de Entorno

Puedes configurar el puerto del servidor:

```bash
# Linux/Mac
export PORT=8080
npm start

# Windows (PowerShell)
$env:PORT=8080; npm start
```

### Depuración

```bash
# Node.js con inspector
node --inspect src/server.js

# Luego conecta con Chrome DevTools en:
# chrome://inspect
```

---

## ‍🎓 Autores

**Proyecto Académico** - Criptografía y Seguridad  
Universidad - 2025

**Equipo de Desarrollo:**
- Santino Campessi Lojo
- Mario Laguna Contreras
- Arnau Donat Garcia
- Asier Garcia Mateo de Ocaña
- Pablo Juarez Peydró
