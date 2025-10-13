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

    document.getElementById('refresh').addEventListener('click', refreshList);

    async function refreshList() {
        try {
            const res = await fetch('/api/list');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const rows = await res.json();
            const ul = document.getElementById('list');
            ul.innerHTML = '';
            rows.forEach(r => {
                const li = document.createElement('li');

                // INNER HTML

                li.innerHTML = `
                <h2>${r.id}. ${r.original_name}</h2>
                <p>Cifrado con ${r.aes_algo}</p>
                <button class="dcr" onclick="mostrarPopup(false,${r.id})">Descrifrar</button>
    `
                ul.appendChild(li);
            });
        } catch (e) {
            console.error('Error cargando lista:', e);
            document.getElementById('list').innerHTML = '<li>❌ No se pudo cargar la lista</li>';
        }
    }

    refreshList();

    function closePopup() {
        document.getElementById('popup').style.display = 'none';
        document.getElementById('pwd').value = '';
    }

    function mostrarPopup(type, num) {

        document.getElementById('popup').style.display = 'flex';

        if (type) {
            document.getElementById('popupForm').innerHTML = `   
            <input type="password" id="pwd" required placeholder="Contraseña">
            <button onclick="await cifrarArchivo();">Cifrar</button>    
        `
        } else {
            document.getElementById('popupForm').innerHTML = `   
            <input type="password" id="pwd" required placeholder="Contraseña">
            <button onclick="descifrarArchivo(${num});">Descifrar</button>    
        `
        }
    }

    async function cifrarArchivo() {

        try {
            const password = document.getElementById('pwd').value;
            const f = fileInput.files[0];

            if (!f) { encMsg.textContent = "⚠️ Selecciona un archivo antes de cifrar."; return; }
            if (!password || password.length < 8) { encMsg.textContent = "⚠️ La contraseña debe tener 8 o más caracteres."; return; }

            encMsg.textContent = '⏳ Generando claves...';
            const initOut = await postJSON('/api/init', { password });
            if (!initOut.ok) { encMsg.textContent = initOut.error || "Error al generar claves"; return; }

            encMsg.textContent = '⏳ Cifrando y subiendo...';
            const fd = new FormData();
            fd.append('file', f);

            const out = await postForm('/api/encrypt', fd);
            encMsg.textContent = out.ok ? ('✅ Cifrado: ' + out.outName) : (out.error || 'Error');

            if (out.ok) {

                refreshList();
            }

            // cerrar popup y limpiar
            popup.style.display = 'none';
            document.getElementById('pwd').value = '';
        } catch (err) {
            console.error('Fallo cifrando:', err);
            encMsg.textContent = (err.name === 'AbortError')
                ? '⏱️ Tiempo de espera agotado. ¿Servidor ocupado?'
                : ('❌ Error: ' + (err.message || err));
        }

    }

    function descifrarArchivo(id) {

    }

    window.mostrarPopup = mostrarPopup;
    window.cifrarArchivo = cifrarArchivo;
    window.descifrarArchivo = descifrarArchivo;
});

