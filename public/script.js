const pdfFile = document.getElementById('pdfFile');
const extractBtn = document.getElementById('extractBtn');
const renderBtn = document.getElementById('renderBtn');
const downloadZipBtn = document.getElementById('downloadZipBtn');
const pagesEl = document.getElementById('pages');
const statusEl = document.getElementById('status');
const docNameEl = document.getElementById('docName');

const voiceSel = document.getElementById('voice');
const modelSel = document.getElementById('model');
const chunkInput = document.getElementById('chunk');
const pronDictEl = document.getElementById('pronDict');

let current = { name: null, pages: [], audio: {} };

pdfFile.addEventListener('change', () => {
  extractBtn.disabled = !pdfFile.files.length;
  renderBtn.disabled = true;
  downloadZipBtn.disabled = true;
  pagesEl.innerHTML = '';
  statusEl.textContent = 'PDF selected. Click "Extract Text".';
  docNameEl.textContent = pdfFile.files[0]?.name || 'No PDF loaded';
});

extractBtn.addEventListener('click', async () => {
  try {
    const file = pdfFile.files[0];
    if (!file) return;
    statusEl.textContent = 'Loading PDF…';
    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    current.name = file.name.replace(/\.[^.]+$/, '');
    current.pages = [];

    for (let i=1;i<=pdf.numPages;i++){
      statusEl.textContent = `Extracting page ${i}/${pdf.numPages}…`;
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(it=>it.str).join(' ').replace(/\s{2,}/g,' ').trim();
      current.pages.push({ index: i, text });
    }
    renderPages();
    renderBtn.disabled = current.pages.length === 0;
    statusEl.textContent = `Extracted ${current.pages.length} pages. You can edit text before rendering.`;
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
});

function renderPages(){
  pagesEl.innerHTML = '';
  current.pages.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.innerHTML = `Page ${p.index} <span class="badge">${p.text.length} chars</span>`;
    const ta = document.createElement('textarea');
    ta.value = p.text;
    ta.addEventListener('input', e => { p.text = e.target.value; h.querySelector('.badge').textContent = `${p.text.length} chars`; });
    const row = document.createElement('div'); row.className = 'row';
    const btnPreview = document.createElement('button'); btnPreview.textContent = 'Preview (first 500 chars)';
    btnPreview.addEventListener('click', () => previewPage(p));
    const btnClear = document.createElement('button'); btnClear.textContent = 'Clear';
    btnClear.addEventListener('click', ()=>{ ta.value=''; p.text=''; h.querySelector('.badge').textContent='0 chars'; });
    row.append(btnPreview, btnClear);
    card.append(h, ta, row);
    pagesEl.append(card);
  });
}

async function previewPage(p){
  statusEl.textContent = `Rendering preview for page ${p.index}…`;
  const previewText = preprocessText(p.text.slice(0, 500));
  const body = { model: modelSel.value, voice: voiceSel.value, input: previewText };
  const res = await fetch('/.netlify/functions/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok) { const t = await res.text(); statusEl.textContent = `Preview error: ${t}`; return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
  statusEl.textContent = `Preview playing (page ${p.index}).`;
}

renderBtn.addEventListener('click', async () => {
  const chunkSize = clamp(parseInt(chunkInput.value)||3000, 500, 6000);
  const zip = new JSZip();
  const out = zip.folder(safeName(current.name) + '_pdf_voice');
  current.audio = {};
  for (const p of current.pages){
    const txt = preprocessText(p.text);
    const chunks = chunkBySentence(txt, chunkSize);
    statusEl.textContent = `Rendering page ${p.index}/${current.pages.length} (${chunks.length} part(s))…`;
    const parts = [];
    for (let i=0;i<chunks.length;i++){
      statusEl.textContent = `Page ${p.index}: part ${i+1}/${chunks.length}…`;
      const body = { model: modelSel.value, voice: voiceSel.value, input: chunks[i] };
      const res = await fetch('/.netlify/functions/tts', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      if (!res.ok){ const t = await res.text(); throw new Error(t) }
      const arr = await res.arrayBuffer();
      parts.push(new Blob([arr], { type: 'audio/mpeg' }));
    }
    const merged = new Blob(parts, { type: 'audio/mpeg' });
    const filename = `${String(p.index).padStart(3,'0')}_page.mp3`;
    out.file(filename, new Uint8Array(await merged.arrayBuffer()));
    current.audio[p.index] = filename;
  }
  const blob = await zip.generateAsync({ type:'blob' });
  downloadZipBtn.dataset.url = URL.createObjectURL(blob);
  downloadZipBtn.disabled = false;
  statusEl.textContent = 'Render complete. Click "Download ZIP".';
});

downloadZipBtn.addEventListener('click', () => {
  const url = downloadZipBtn.dataset.url;
  saveAs(url, safeName(current.name) + "_pdf_voice.zip");
});

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function safeName(s){ return (s||'output').replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_'); }

function preprocessText(text){
  // Apply pronunciation dictionary
  let out = text;
  try {
    const dict = JSON.parse(pronDictEl.value || "{}");
    for (const [w, rep] of Object.entries(dict)){
      const re = new RegExp(`\\b${escapeRegExp(w)}\\b`, 'g');
      out = out.replace(re, rep);
    }
  } catch {}
  // Simple emphasis: *word* → add exclamation for emphasis (simulated)
  out = out.replace(/\*(.+?)\*/g, '$1!');
  // Pauses: [pause=500] → ellipsis
  out = out.replace(/\[pause=(\d+)\]/g, ' … ');
  // Dashes as micro-pause already natural
  return out;
}

function chunkBySentence(text, limit){
  const chunks = [];
  let start = 0;
  while (start < text.length){
    let end = Math.min(text.length, start + limit);
    const boundary = text.lastIndexOf('.', end);
    if (boundary > start + Math.floor(limit*0.6)) end = boundary + 1;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
