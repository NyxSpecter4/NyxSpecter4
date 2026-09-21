// Athelgard Sidecar — content script (her eyes)
// Watches the shared page, extracts flags, reports context up to the squad bus.

const FLAG_RE = /(?:HTB|FLAG|CTF|cyberhx)\{[^}\s]{4,80}\}/g;

function pageDigest() {
  const text = document.body ? document.body.innerText.slice(0, 12000) : '';
  const flags = (text.match(FLAG_RE) || []);
  const selection = String(getSelection());
  return {
    title: document.title,
    flags: [...new Set(flags)],
    selection: selection.slice(0, 500),
    textHead: text.slice(0, 4000)
  };
}

chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', ...pageDigest() });
let lastSel = '';
setInterval(() => {
  const sel = String(getSelection());
  if (sel && sel !== lastSel) { lastSel = sel; chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', ...pageDigest() }); }
}, 1500);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GET_CONTEXT') {
    chrome.runtime.sendMessage({ type: 'PAGE_CONTEXT', ...pageDigest() });
  }
  if (msg.type === 'HIGHLIGHT' && msg.text) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(msg.text);
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + msg.text.length);
        const span = document.createElement('span');
        span.style.cssText = 'background:#ffd54a;color:#000;outline:2px solid #ff8f00;';
        try { range.surroundContents(span); span.scrollIntoView({ block: 'center' }); } catch (e) {}
        setTimeout(() => { span.style.cssText = ''; }, 4000);
        break;
      }
    }
  }
});
