const ids = ['brainUrl', 'brainKey', 'brainModel', 'scoreboardUrl', 'operatorName'];
chrome.storage.local.get(ids).then(v => ids.forEach(id => { if (v[id]) document.getElementById(id).value = v[id]; }));
document.getElementById('save').onclick = () => {
  const patch = {};
  ids.forEach(id => patch[id] = document.getElementById(id).value.trim());
  chrome.storage.local.set(patch).then(() => {
    document.getElementById('ok').textContent = 'Saved. Athelgard is wired.';
    setTimeout(() => document.getElementById('ok').textContent = '', 2500);
  });
};
