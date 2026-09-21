// Demo bridge: this frame borrows its chrome.* from the parent hub.
window.chrome = window.parent.setChrome(window.__SIDE ? 'side' : 'page');

// Bridge: in the real extension chrome.tabs.sendMessage reaches content scripts.
// In the demo hub, route it through the runtime bus so GET_CONTEXT works.
chrome.tabs.sendMessage = (id, m) => chrome.runtime.sendMessage(m);
