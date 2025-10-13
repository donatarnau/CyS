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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally { clearTimeout(t); }
}

async function postForm(url, formData, timeoutMs = 300000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { method: 'POST', body: formData, signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally { clearTimeout(t); }
}

document.addEventListener('DOMContentLoaded', () => {

    const fileInput = document.getElementById('file');
    const encMsg = document.getElementById('encMsg');
    const popup = document.getElementById('popup');
    const popupForm = document.getElementById('popupForm');
    const refreshBtn = document.getElementById('refresh');
    const cifrarBtn = document.getElementById('cifrar'); // ⚠️ Botón principal de “Cifrar”



    async function refreshList() {
        try {
            const res = await fetch('/api/list');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const rows = await res.json();
            const ul = document.getElementById('list');
            ul.innerHTML = '';

            rows.forEach(r => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <h2>${r.id}. ${r.original_name}</h2>
                    <p>Cifrado con ${r.aes_algo}</p>
                `;

                const btn = document.createElement('button');
                btn.classList.add('dcr');
                btn.textContent = 'Descifrar';
                btn.addEventListener('click', () => mostrarPopup(false, r.id));
                console.log(r.id);

                li.appendChild(btn);
                ul.appendChild(li);
            });
        } catch (e) {
            console.error('Error cargando lista:', e);
            document.getElementById('list').innerHTML = '<li>❌ No se pudo cargar la lista</li>';
        }
    }



    function closePopup() {
        popup.style.display = 'none';
        popupForm.innerHTML = '';
        fileInput.value = '';
        document.getElementById('malPass').textContent = '';
    }

    function mostrarPopup(isEncrypt, fileId) {
        popupForm.innerHTML = '';
        popupForm.innerHTML += '<input type="password" id="pwd" required placeholder="Contraseña">'

        if (isEncrypt) {

            const f = fileInput.files[0];
            if (!f) { encMsg.textContent = "⚠️ Selecciona un archivo antes de cifrar."; return; }

            popupForm.innerHTML += `   
                <button type="submit">Cifrar</button>    
        `
        } else {

            popupForm.innerHTML += `   
                <button type="submit">Descifrar</button>    
        `
        }

        console.log(fileId);

        popupForm.onsubmit = async (e) => {
            e.preventDefault();
            if (isEncrypt) await cifrarArchivo();
            else await descifrarArchivo(fileId);
        };

        const cancelBtn = document.getElementById('closePopup');
        cancelBtn.addEventListener('click', closePopup);

        popup.style.display = 'flex';

    }

    async function cifrarArchivo() {
        try {
            const f = fileInput.files[0];
            const password = document.getElementById('pwd').value;
            if (!password || password.length < 8) {
                document.getElementById('malPass').textContent = 'Minimo 8 caracteres';
                return;
            }



            // comprobar si hay claves

            const checkResponse = await fetch('/api/check-keys');
            const checkResult = await checkResponse.json();

            if (!checkResult.keysExist) {
                // GENERAMOS CLAVES
                console.log('Genero nuevas claves');

                const initOut = await postJSON('/api/init', { password });
                encMsg.textContent = '⏳ Generando claves...';
                if (!initOut.ok) { encMsg.textContent = initOut.error || "Error al generar claves"; return; }
            } else {
                // SE VERIFICA LA CONTRASEÑA
                console.log('Te pido tu contraseña de antes');

                const verifyOut = await postJSON('/api/verify-password', { password });
                if (!verifyOut.ok) {
                    document.getElementById('malPass').textContent = 'Contraseña incorrecta';
                    return;
                }
            }

            console.log('Me ejecutas');

            encMsg.textContent = '⏳ Cifrando y subiendo...';
            const fd = new FormData();
            fd.append('file', f);

            const out = await postForm('/api/encrypt', fd);
            encMsg.textContent = out.ok ? ('✅ Cifrado: ' + out.outName) : (out.error || 'Error');

            if (out.ok) refreshList();

            closePopup();
        } catch (err) {
            console.error('Fallo cifrando:', err);
            encMsg.textContent = (err.name === 'AbortError')
                ? '⏱️ Tiempo de espera agotado. ¿Servidor ocupado?'
                : ('❌ Error: ' + (err.message || err));
        }
    }

    async function descifrarArchivo(id) {
        try {
            const password = document.getElementById('pwd').value;
            if (!password || password.length < 8) {
                document.getElementById('malPass').textContent = 'Minimo 8 caracteres';
                return;
            }

            encMsg.textContent = '⏳ Descifrando archivo...';

            // Llamada a tu endpoint de descifrado
            const decOut = await postJSON('/api/decrypt', { id, password });

            if (!decOut.ok) {
                encMsg.textContent = decOut.error || 'Error al descifrar';
                return;
            }

            // Mostrar resultado y permitir descarga
            encMsg.textContent = `✅ Archivo descifrado: ${decOut.outName}`;

            // Crear enlace de descarga dinámico
            const downloadLink = document.createElement('a');

            // URL del archivo descifrado
            const dlUrl = decOut.outName
                ? `/decrypted/${encodeURIComponent(decOut.outName)}`
                : null;

            downloadLink.href = dlUrl;
            downloadLink.download = decOut.outName || 'archivo.desc';
            downloadLink.style.display = 'none'; // oculto porque se descargará automáticamente

            // Añadir al DOM temporalmente
            document.body.appendChild(downloadLink);

            // Descargar automáticamente
            downloadLink.click();

            // Remover el enlace del DOM
            document.body.removeChild(downloadLink);
            refreshList();
            closePopup();

        } catch (err) {
            console.error('Fallo descifrando:', err);
            encMsg.textContent =
                err.name === 'AbortError'
                    ? '⏱️ Tiempo de espera agotado. ¿Servidor ocupado?'
                    : '❌ Error: ' + (err.message || err);
        }
    }

    // Permite cerrar el popup haciendo click fuera
    popup.addEventListener('click', e => {
        if (e.target === popup) closePopup();
    });

    refreshBtn.addEventListener('click', refreshList);
    cifrarBtn.addEventListener('click', () => mostrarPopup(true, -1)); // ← Abre popup para cifrar
    refreshList();
});
