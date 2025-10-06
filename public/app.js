async function postJSON(url, data) {
  const res = await fetch(url, { 
    method:'POST', 
    headers:{'Content-Type':'application/json'}, 
    body: JSON.stringify(data) 
  });
  return res.json();
}

async function postForm(url, formData) {
  const res = await fetch(url, { method:'POST', body: formData });
  return res.json();
}

// --- POPUP ---
const popup = document.getElementById('passwordPopup');
const openPopupBtn = document.getElementById('openPopup');
const closePopupBtn = document.getElementById('closePopup');
const passwordForm = document.getElementById('passwordForm');
const encMsg = document.getElementById('encMsg');

openPopupBtn.addEventListener('click', () => {
  popup.style.display = 'flex';
  encMsg.textContent = ''; // limpiar mensajes previos
});

closePopupBtn.addEventListener('click', () => {
  popup.style.display = 'none';
  document.getElementById('popupPassword').value = ''; // limpiar campo
});

// confirmar contraseña y cifrar
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const password = document.getElementById('popupPassword').value;
  const f = document.getElementById('file').files[0];

  if (!f) {
    encMsg.textContent = "⚠️ Selecciona un archivo antes de cifrar.";
    return;
  }

  if (password.length < 8) {
    encMsg.textContent = "⚠️ La contraseña debe tener 8 o más caracteres.";
    return;
  }

  // 1) inicializar claves
  const initOut = await postJSON('/api/init', { password });
  if (!initOut.ok) {
    encMsg.textContent = initOut.error || "Error al generar claves";
    return;
  }

  // 2) enviar archivo a /api/encrypt
  const fd = new FormData();
  fd.append('file', f);

  const out = await postForm('/api/encrypt', fd);
  encMsg.textContent = out.ok 
    ? ('✅ Cifrado: ' + out.outName) 
    : (out.error || 'Error');

  if (out.ok) {
    refreshList(); // actualizar lista
  }

  // cerrar popup y limpiar
  popup.style.display = 'none';
  document.getElementById('popupPassword').value = '';
});

// --- LISTA ---
document.getElementById('refresh').addEventListener('click', refreshList);

async function refreshList() {
  const res = await fetch('/api/list');
  const rows = await res.json();
  const ul = document.getElementById('list');
  ul.innerHTML = '';

  rows.forEach(r => {
    const li = document.createElement('li');

    // Texto del archivo
    li.textContent = `${r.id} | ${r.original_name} -> ${r.output_path} | ${r.aes_algo} | ${r.created_at} `;

    // Botón de descargar
    const dl = document.createElement('a');
    dl.href = `/encrypted/${r.output_path.split('/').pop()}`; 
    dl.textContent = '⬇ Descargar';
    dl.style.marginLeft = '10px';
    dl.download = r.output_path.split('/').pop();

    li.appendChild(dl);
    ul.appendChild(li);
  });
}


refreshList();

// --- DESCIFRADO ---
document.getElementById('decryptForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const encPath = document.getElementById('encPath').value;
  const password = document.getElementById('decPassword').value;
  const out = await postJSON('/api/decrypt', { encPath, password });
  document.getElementById('decMsg').textContent = out.ok 
    ? ('✅ Descifrado: ' + out.outName) 
    : (out.error || 'Error');
});
