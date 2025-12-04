// public/app.js

// Funciones auxiliares para API
async function postJSON(url, data, timeoutMs = 30000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: ctrl.signal
        });
        return res;
    } finally { clearTimeout(t); }
}

async function postForm(url, formData, timeoutMs = 300000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: 'POST', body: formData, signal: ctrl.signal });
        return res;
    } finally { clearTimeout(t); }
}

// Estado de la Aplicación
let currentUser = null;

// Elementos del DOM
const $ = (id) => document.getElementById(id);
const fileInput = $('file');
const encMsg = $('encMsg');
const popup = $('popup');
const popupTitle = $('popupTitle');
const popupMsg = $('popupMsg');
const popupForm = $('popupForm');
const closePopupBtn = $('closePopup');
const cifrarBtn = $('cifrarBtn');
const logoutBtn = $('logoutBtn');
const refreshMyFilesBtn = $('refreshMyFilesBtn');
const refreshSharedBtn = $('refreshSharedBtn');
const myFilesList = $('myFilesList');
const sharedFilesList = $('sharedFilesList');
const usernameDisplay = $('usernameDisplay');

// Lógica de Popups

function closePopup() {
    popup.style.display = 'none';
    popupForm.innerHTML = '';
    popupMsg.textContent = '';
    fileInput.value = '';
}

/**
 * Muestra un popup dinámico
 * @param {'password' | 'share'} type El tipo de popup
 * @param {string} title Título del popup
 * @param {object} context Objeto con datos (ej. { fileId, fileName })
 * @param {function} onSubmit Lógica a ejecutar al enviar el formulario
 */
function mostrarPopup(type, title, context, onSubmit) {
    popupTitle.textContent = title;
    popupMsg.textContent = '';
    popupForm.innerHTML = '';

    if (type === 'password') {
        popupForm.innerHTML = `
            <label for="pwd">Contraseña</label>
            <input type="password" id="pwd" required>
            <button type="submit">Confirmar</button>
        `;
    } 
    
    if (type === 'share') {
        popupForm.innerHTML = `
            <p>Compartiendo archivo: <strong>${context.fileName}</strong></p>
            <label for="shareUser">Nombre de usuario destinatario</label>
            <input type="text" id="shareUser" required>
            <label for="pwd">Tu Contraseña (para autorizar la compartición)</label>
            <input type="password" id="pwd" required>
            <button type="submit">Compartir</button>
        `;
    }

    popupForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitButton = popupForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Procesando...';
        
        try {
            await onSubmit(e);
        } catch (err) {
            popupMsg.textContent = `❌ Error: ${err.message}`;
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Confirmar';
        }
    };

    popup.style.display = 'flex';
    popup.querySelector('input').focus();
}

// Lógica de Cifrado

async function cifrarArchivo() {
    const f = fileInput.files[0];
    if (!f) {
        encMsg.textContent = '⚠️ Selecciona un archivo antes de cifrar.';
        return;
    }

    mostrarPopup('password', 'Confirmar Contraseña para Cifrar', {}, async () => {
        const password = $('pwd').value;
        if (!password) {
            popupMsg.textContent = 'La contraseña es obligatoria';
            return;
        }

        popupMsg.textContent = '⏳ Cifrando y subiendo... (puede tardar)';
        
        const fd = new FormData();
        fd.append('file', f);
        fd.append('password', password);

        const res = await postForm('/api/encrypt', fd);
        const data = await res.json();

        if (res.ok) {
            encMsg.textContent = `✅ Cifrado: ${data.outName}`;
            await refreshMyFiles();
            closePopup();
        } else {
            popupMsg.textContent = `❌ Error: ${data.error}`;
        }
    });
}

// Lógica de Descifrado

async function descifrarArchivo(fileId, fileName) {
    mostrarPopup('password', 'Contraseña para Descifrar', {}, async () => {
        const password = $('pwd').value;
        if (!password) {
            popupMsg.textContent = 'La contraseña es obligatoria';
            return;
        }

        popupMsg.textContent = '⏳ Descifrando archivo...';

        const res = await postJSON('/api/decrypt', { id: fileId, password });
        const data = await res.json();

        if (res.ok) {
            const dlUrl = `/decrypted/${encodeURIComponent(data.outName)}`;
            
            const downloadLink = document.createElement('a');
            downloadLink.href = dlUrl;
            downloadLink.download = data.outName;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);

            closePopup();
        } else {
            popupMsg.textContent = `❌ Error: ${data.error}`;
        }
    });
}

// Lógica de Compartir

async function compartirArchivo(fileId, fileName) {
    mostrarPopup('share', 'Compartir Archivo', { fileId, fileName }, async () => {
        const recipientUsername = $('shareUser').value;
        const ownerPassword = $('pwd').value;

        if (!recipientUsername || !ownerPassword) {
            popupMsg.textContent = 'Todos los campos son obligatorios';
            return;
        }

        popupMsg.textContent = 'Procesando compartición...';

        const res = await postJSON('/api/share', {
            fileId,
            recipientUsername,
            ownerPassword
        });
        const data = await res.json();

        if (res.ok) {
            popupMsg.textContent = `✅ ¡Compartido con ${recipientUsername}!`;
            setTimeout(closePopup, 1500);
        } else {
            popupMsg.textContent = `❌ Error: ${data.error}`;
        }
    });
}

// Lógica de Listado de Archivos

async function refreshMyFiles() {
    myFilesList.innerHTML = '<li>Cargando mis archivos...</li>';
    try {
        const res = await fetch('/api/my-files');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const files = await res.json();
        myFilesList.innerHTML = '';

        if (files.length === 0) {
            myFilesList.innerHTML = '<li>No tienes archivos cifrados.</li>';
            return;
        }

        files.forEach(f => {
            const li = document.createElement('li');
            li.innerHTML = `
                <h3>${f.original_name}</h3>
                <div class="file-info">
                    <span>${f.aes_algo}</span>
                    <span>Subido: ${new Date(f.created_at).toLocaleString()}</span>
                </div>
                <div class="file-actions">
                    <button class="btn btn-download" data-id="${f.id}" data-name="${f.original_name}">Descifrar</button>
                    <button class="btn btn-share" data-id="${f.id}" data-name="${f.original_name}">Compartir</button>
                    </div>
            `;
            myFilesList.appendChild(li);
        });

        myFilesList.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => descifrarArchivo(btn.dataset.id, btn.dataset.name));
        });
        myFilesList.querySelectorAll('.btn-share').forEach(btn => {
            btn.addEventListener('click', () => compartirArchivo(btn.dataset.id, btn.dataset.name));
        });

    } catch (e) {
        myFilesList.innerHTML = `<li>❌ No se pudo cargar la lista: ${e.message}</li>`;
    }
}

async function refreshSharedFiles() {
    sharedFilesList.innerHTML = '<li>Cargando archivos compartidos...</li>';
    try {
        const res = await fetch('/api/shared-with-me');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const files = await res.json();
        sharedFilesList.innerHTML = '';

        if (files.length === 0) {
            sharedFilesList.innerHTML = '<li>Nadie ha compartido archivos contigo.</li>';
            return;
        }

        files.forEach(f => {
            const li = document.createElement('li');
            li.innerHTML = `
                <h3>${f.original_name}</h3>
                <div class="file-info">
                    <span>De: <strong>${f.owner_username}</strong></span>
                    <span>Compartido: ${new Date(f.created_at).toLocaleString()}</span>
                </div>
                <div class="file-actions">
                    <button class="btn btn-download" data-id="${f.id}" data-name="${f.original_name}">Descifrar</button>
                </div>
            `;
            sharedFilesList.appendChild(li);
        });

        sharedFilesList.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => descifrarArchivo(btn.dataset.id, btn.dataset.name));
        });

    } catch (e) {
        sharedFilesList.innerHTML = `<li>❌ No se pudo cargar la lista: ${e.message}</li>`;
    }
}


// Lógica de Autenticación y Arranque

async function checkSession() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (data.ok) {
            currentUser = data;
            usernameDisplay.textContent = currentUser.username;
            await refreshMyFiles();
            await refreshSharedFiles();
        } else {
            window.location.href = '/login.html';
        }
    } catch (e) {
        console.error('Error de sesión, redirigiendo a login', e);
        window.location.href = '/login.html';
    }
}

async function logout() {
    await postJSON('/api/logout', {});
    window.location.href = '/login.html';
}

// Inicialización de la App
document.addEventListener('DOMContentLoaded', () => {
    cifrarBtn.addEventListener('click', cifrarArchivo);
    logoutBtn.addEventListener('click', logout);
    refreshMyFilesBtn.addEventListener('click', refreshMyFiles);
    refreshSharedBtn.addEventListener('click', refreshSharedFiles);
    closePopupBtn.addEventListener('click', closePopup);
    
    popup.addEventListener('click', e => {
        if (e.target === popup) closePopup();
    });

    checkSession();
});