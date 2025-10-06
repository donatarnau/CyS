document.addEventListener('DOMContentLoaded', () => {
  // --- helpers con timeout ---
  async function postJSON(url, data, timeoutMs = 30000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
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
      const res = await fetch(url, { method:'POST', body: formData, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }

  // --- refs seguras + guards ---
  const popup = document.getElementById('passwordPopup');
  const openPopupBtn = document.getElementById('openPopup');
  const closePopupBtn = document.getElementById('closePopup');
  const passwordForm = document.getElementById('passwordForm');
  const encMsg = document.getElementById('encMsg');
  const downloadBtn = document.getElementById('downloadBtn');
  const fileInput = document.getElementById('file');

  if (!openPopupBtn || !passwordForm) {
    console.error('No se encontraron elementos del DOM esperados.');
    return;
  }

  // --- POPUP ---
  openPopupBtn.addEventListener('click', () => {
    try {
      popup.style.display = 'flex';
      encMsg.textContent = '';
    } catch (e) { console.error('Error abriendo popup', e); }
  });

  closePopupBtn.addEventListener('click', () => {
    try {
      popup.style.display = 'none';
      document.getElementById('popupPassword').value = '';
    } catch (e) { console.error('Error cerrando popup', e); }
  });

  // confirmar contraseña y cifrar
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const password = document.getElementById('popupPassword').value;
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
        // botón descargar inmediato
        const dlUrl = out.url ? out.url : (out.outName ? `/encrypted/${encodeURIComponent(out.outName)}` : null);
        if (dlUrl) {
          downloadBtn.href = dlUrl;
          if (out.outName) downloadBtn.download = out.outName;
          downloadBtn.style.display = 'inline-block';
          // descarga automática opcional:
          // downloadBtn.click();
        }
        refreshList();
      }

      // cerrar popup y limpiar
      popup.style.display = 'none';
      document.getElementById('popupPassword').value = '';
    } catch (err) {
      console.error('Fallo cifrando:', err);
      encMsg.textContent = (err.name === 'AbortError')
        ? '⏱️ Tiempo de espera agotado. ¿Servidor ocupado?'
        : ('❌ Error: ' + (err.message || err));
    }
  });

  // --- LISTA ---
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
        li.textContent = `${r.id} | ${r.original_name} -> ${r.output_path} | ${r.aes_algo} | ${r.created_at} `;
        const dl = document.createElement('a');
        const outName = r.output_path.split('/').pop();
        dl.href = `/encrypted/${encodeURIComponent(outName)}`;
        dl.textContent = '⬇ Descargar';
        dl.style.marginLeft = '10px';
        dl.download = outName;
        li.appendChild(dl);
        ul.appendChild(li);
      });
    } catch (e) {
      console.error('Error cargando lista:', e);
      document.getElementById('list').innerHTML = '<li>❌ No se pudo cargar la lista</li>';
    }
  }

  refreshList();
});
