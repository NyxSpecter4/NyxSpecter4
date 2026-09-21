// Athelgard Sidecar — panel logic: chat, page awareness, flag pipeline
const log = document.getElementById('log');
const input = document.getElementById('input');
const flagList = document.getElementById('flagList');
const ctxEl = document.getElementById('ctx');

function say(who, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + who.toLowerCase();
  div.innerHTML = '<b>' + who + ':</b> ';
  div.appendChild(document.createTextNode(text));
  log.appendChild(div); log.scrollTop = log.scrollHeight;
}

/* ---- memory: the vault the Holmes run never had ---- */
async function remember(entry) {
  const { memory = [] } = await chrome.storage.local.get('memory');
  memory.push({ ...entry, at: Date.now() });
  await chrome.storage.local.set({ memory: memory.slice(-500) });
}

/* ---- brain: any OpenAI-compatible endpoint (options page) ---- */
async function think(userText, context) {
  const cfg = await chrome.storage.local.get(['brainUrl', 'brainKey', 'brainModel', 'operatorName']);
  if (!cfg.brainUrl) {
    return 'Brain not wired. Open extension options and set an OpenAI-compatible endpoint (local Ollama works: http://localhost:11434/v1/chat/completions). I will still track flags and page context meanwhile.';
  }
  const sys = 'You are Athelgard, a CTF teammate in the operator\'s browser side panel. ' +
    'You share the page they are looking at. Be terse, technical, flag-first. ' +
    'When you spot a flag pattern, say FLAG: <flag>. Operator: ' + (cfg.operatorName || 'Captain') + '.';
  const res = await fetch(cfg.brainUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cfg.brainKey ? { Authorization: 'Bearer ' + cfg.brainKey } : {}) },
    body: JSON.stringify({
      model: cfg.brainModel || 'athelgard',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: 'PAGE: ' + JSON.stringify(context).slice(0, 3000) + '\n\nOPERATOR: ' + userText }
      ]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(empty reply)';
}

/* ---- chat ---- */
document.getElementById('composer').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  say(cfg_name(await chrome.storage.local.get('operatorName')), text);
  say('Athelgard', '...');
  const typing = log.lastChild;
  const ctx = (await chrome.storage.session.get('lastContext')).lastContext || {};
  try {
    const reply = await think(text, ctx);
    typing.lastChild.textContent = ''; typing.appendChild(document.createTextNode(reply));
    log.scrollTop = log.scrollHeight;
    await remember({ role: 'operator', text }, { reply });
    // flag capture from her own words
    const m = reply.match(/FLAG:\s*(\S+\{[^}]+\})/);
    if (m) stageFlag(m[1], 'chat');
  } catch (err) {
    typing.lastChild.textContent = 'brain error: ' + err.message;
  }
});
function cfg_name(o){ return o.operatorName || 'You'; }

/* ---- page awareness ---- */
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.type === 'PAGE_CONTEXT') {
    ctxEl.textContent = msg.title + ' — ' + (msg.flags?.length || 0) + ' flag(s) on page';
    for (const f of msg.flags || []) stageFlag(f, 'page-scan');
  }
  if (msg.type === 'FLAGS_UPDATED') renderFlags(msg.flags);
});

function stageFlag(flag, source) {
  chrome.storage.local.get({ stagedFlags: [] }).then(({ stagedFlags }) => {
    if (stagedFlags.some(x => x.flag === flag)) return;
    chrome.runtime.sendMessage({ type: 'STAGE_FLAG', flag: { flag, source } });
  });
}

function renderFlags(flags) {
  flagList.innerHTML = '';
  for (const f of flags.slice(-30).reverse()) {
    const li = document.createElement('li');
    const code = document.createElement('code'); code.textContent = f.flag;
    const badge = document.createElement('span'); badge.className = 'st ' + f.status.toLowerCase(); badge.textContent = f.status;
    li.append(code, ' ', badge, ' ');
    const approve = document.createElement('button'); approve.textContent = 'Approve';
    approve.onclick = () => {
      chrome.runtime.sendMessage({ type: 'APPROVE_FLAG', flag: f.flag });
      navigator.clipboard.writeText(f.flag); // ready to paste into the scoreboard
    };
    const copy = document.createElement('button'); copy.textContent = 'Copy';
    copy.onclick = () => navigator.clipboard.writeText(f.flag);
    li.append(approve, copy);
    flagList.appendChild(li);
  }
}

/* ---- boot: reload state so nothing is lost between sessions ---- */
(async () => {
  const { stagedFlags = [] } = await chrome.storage.local.get('stagedFlags');
  renderFlags(stagedFlags);
  const { memory = [] } = await chrome.storage.local.get('memory');
  say('System', 'Athelgard sidecar up. ' + stagedFlags.length + ' flag(s) in pipeline, ' + memory.length + ' memories in vault.');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' }).catch(() => {});
})();
