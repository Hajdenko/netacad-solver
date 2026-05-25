window.__NC_CONFIG__ = {
  apiKey: 'YOUR_API_KEY',
  apiUrl: 'https://api.groq.com/openai/v1/chat/completions',
  model:  'qwen/qwen3-32b',
  debug:  false
};
fetch('https://raw.githubusercontent.com/Hajdenko/netacad-solver/refs/heads/main/main.js')
  .then(r=>r.text())
  .then(code=>{const s=document.createElement('script');s.src=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));document.head.appendChild(s);})
  .catch(e=>console.error('[NC] Failed to load:',e));
