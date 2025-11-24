// public/login.js

// Helper para POST JSON (copiado de app.js)
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
        // Devolvemos la respuesta completa para manejar errores
        return res;
    } finally { clearTimeout(t); }
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginMsg = document.getElementById('loginMsg');
    const registerForm = document.getElementById('registerForm');
    const regMsg = document.getElementById('regMsg');
    const regButton = document.getElementById('regButton');

    // --- Manejador de Login ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginMsg.textContent = 'Verificando...';
        const username = document.getElementById('loginUser').value;
        const password = document.getElementById('loginPass').value;

        try {
            const res = await postJSON('/api/login', { username, password });
            const data = await res.json();

            if (res.ok) {
                loginMsg.textContent = '¡Éxito! Redirigiendo...';
                // Redirigir al dashboard (index.html)
                window.location.href = '/'; 
            } else {
                loginMsg.textContent = `❌ Error: ${data.error || 'Fallo en el login'}`;
            }
        } catch (err) {
            loginMsg.textContent = `❌ Error de red: ${err.message}`;
        }
    });

    // --- Manejador de Registro ---
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUser').value;
        const password = document.getElementById('regPass').value;
        const passwordConf = document.getElementById('regPassConf').value;

        if (password !== passwordConf) {
            regMsg.textContent = '❌ Las contraseñas no coinciden';
            return;
        }
        if (password.length < 8) {
            regMsg.textContent = '❌ La contraseña debe tener al menos 8 caracteres';
            return;
        }

        regMsg.textContent = 'Registrando y generando claves (esto puede tardar)...';
        regButton.disabled = true;

        try {
            // Aumentamos el timeout para el registro porque generar claves RSA tarda
            const res = await postJSON('/api/register', { username, password }, 60000); 
            const data = await res.json();

            if (res.ok) {
                regMsg.textContent = '¡Éxito! Redirigiendo...';
                // Redirigir al dashboard (index.html)
                window.location.href = '/';
            } else {
                regMsg.textContent = `❌ Error: ${data.error || 'Fallo en el registro'}`;
            }
        } catch (err) {
            regMsg.textContent = `❌ Error de red: ${err.message}`;
        } finally {
            regButton.disabled = false;
        }
    });
});