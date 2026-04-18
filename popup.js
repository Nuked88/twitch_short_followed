const STORAGE_KEY_ORDER = 'tfo_order';
const STORAGE_KEY_VISIBLE = 'tfo_visible';

const visibleInput = document.getElementById('visibleCount');
const saveBtn = document.getElementById('saveVisible');
const resetBtn = document.getElementById('resetOrder');
const status = document.getElementById('status');

function showStatus(msg) {
  status.textContent = msg;
  setTimeout(() => { status.textContent = ''; }, 1800);
}

chrome.storage.local.get([STORAGE_KEY_VISIBLE], (data) => {
  visibleInput.value = data[STORAGE_KEY_VISIBLE] ?? 10;
});

saveBtn.addEventListener('click', () => {
  const n = parseInt(visibleInput.value, 10);
  if (isNaN(n) || n < 0) return;

  chrome.storage.local.set({ [STORAGE_KEY_VISIBLE]: n }, () => {
    showStatus('Saved!');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (count) => { window.__tfo?.setVisibleCount(count); },
          args: [n]
        }).catch(() => {});
      }
    });
  });
});

resetBtn.addEventListener('click', () => {
  chrome.storage.local.remove(STORAGE_KEY_ORDER, () => {
    showStatus('Order reset!');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => { window.__tfo?.setVisibleCount(window.__tfo?.getChannels().length || 10); }
        }).catch(() => {});
      }
    });
  });
});
