// public/app.js
async function postJSON(url, data) {
  const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
  return res.json();
}
async function postForm(url, formData) {
  const res = await fetch(url, { method:'POST', body: formData });
  return res.json();
}

document.getElementById('initForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  const out = await postJSON('/api/init', { password });
  document.getElementById('initMsg').textContent = out.ok ? 'Claves generadas' : (out.error || 'Error');
});

document.getElementById('encryptForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = document.getElementById('file').files[0];
  if (!f) return;
  const fd = new FormData();
  fd.append('file', f);
  const out = await postForm('/api/encrypt', fd);
  document.getElementById('encMsg').textContent = out.ok ? ('Cifrado: ' + out.outName) : (out.error || 'Error');
  refreshList();
});

document.getElementById('refresh').addEventListener('click', refreshList);

async function refreshList() {
  const res = await fetch('/api/list');
  const rows = await res.json();
  const ul = document.getElementById('list');
  ul.innerHTML = '';
  rows.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${r.id} | ${r.original_name} -> ${r.output_path} | ${r.aes_algo} | ${r.created_at}`;
    ul.appendChild(li);
  });
}
refreshList();

document.getElementById('decryptForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const encPath = document.getElementById('encPath').value;
  const password = document.getElementById('decPassword').value;
  const out = await postJSON('/api/decrypt', { encPath, password });
  document.getElementById('decMsg').textContent = out.ok ? ('Descifrado: ' + out.outName) : (out.error || 'Error');
});
