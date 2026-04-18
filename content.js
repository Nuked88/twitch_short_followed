(() => {
  'use strict';

  const STORAGE_KEY_ORDER = 'tfo_order';
  const STORAGE_KEY_VISIBLE = 'tfo_visible';
  const DEFAULT_VISIBLE = 10;

  let customOrder = [];
  let visibleCount = DEFAULT_VISIBLE;
  let isReordering = false;
  let expandInterval = null;

  // --- Storage helpers ---
  function loadSettings(cb) {
    chrome.storage.local.get([STORAGE_KEY_ORDER, STORAGE_KEY_VISIBLE], (data) => {
      customOrder = data[STORAGE_KEY_ORDER] || [];
      visibleCount = data[STORAGE_KEY_VISIBLE] ?? DEFAULT_VISIBLE;
      cb();
    });
  }

  function saveOrder(order) {
    chrome.storage.local.set({ [STORAGE_KEY_ORDER]: order });
  }

  function saveVisible(n) {
    chrome.storage.local.set({ [STORAGE_KEY_VISIBLE]: n });
  }

  // --- DOM helpers ---
  function getSection() {
    return document.querySelector('[aria-label="Followed Channels"]');
  }

  function getContainer(section) {
    return section ? section.querySelector('.tw-transition-group') : null;
  }

  function getCards(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('[data-test-selector="followed-channel"]'));
  }

  function getUsername(link) {
    return link.getAttribute('href')?.replace('/', '').toLowerCase() || '';
  }

  // --- Expand all channels (auto-click Show More) ---
  function expandAll(container, onDone) {
    if (expandInterval) return;

    function tryClick() {
      const section = getSection();
      if (!section) return;
      const btn = section.querySelector('[data-a-target="side-nav-show-more-button"]');
      if (btn) {
        btn.click();
      } else {
        clearInterval(expandInterval);
        expandInterval = null;
        setTimeout(onDone, 300);
      }
    }

    tryClick();
    expandInterval = setInterval(tryClick, 600);
  }

  // --- Apply custom order + visibility ---
  function applyOrder() {
    if (isReordering) return;
    const section = getSection();
    const container = getContainer(section);
    if (!container) return;

    const links = getCards(container);
    if (!links.length) return;

    isReordering = true;

    // Build map: username -> wrapper element (the .tw-transition div)
    const wrapperMap = new Map();
    links.forEach(link => {
      const wrapper = link.closest('.tw-transition');
      if (wrapper) {
        wrapperMap.set(getUsername(link), wrapper);
      }
    });

    const allUsernames = [...wrapperMap.keys()];

    // Merge saved order with current channels
    const ordered = [
      ...customOrder.filter(u => wrapperMap.has(u)),
      ...allUsernames.filter(u => !customOrder.includes(u))
    ];

    // Update saved order if new channels appeared
    if (ordered.join() !== customOrder.join()) {
      customOrder = ordered;
      saveOrder(customOrder);
    }

    // Reorder DOM
    ordered.forEach((username, idx) => {
      const wrapper = wrapperMap.get(username);
      if (!wrapper) return;
      container.appendChild(wrapper);

      // Show/hide based on visibleCount (0 = show all)
      if (visibleCount > 0 && idx >= visibleCount) {
        wrapper.style.display = 'none';
        wrapper.dataset.tfoHidden = '1';
      } else {
        wrapper.style.display = '';
        wrapper.dataset.tfoHidden = '';
      }

      addDragHandle(wrapper, username);
    });

    addShowMoreToggle(section, ordered, wrapperMap);

    isReordering = false;
  }

  // --- Drag & Drop ---
  let dragSrc = null;

  function addDragHandle(wrapper, username) {
    if (wrapper.dataset.tfoHandled) return;
    wrapper.dataset.tfoHandled = '1';
    wrapper.dataset.tfoUsername = username;
    wrapper.setAttribute('draggable', 'true');

    const handle = document.createElement('div');
    handle.className = 'tfo-handle';
    handle.title = 'Drag to reorder';
    handle.innerHTML = `<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
      <circle cx="4" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/>
      <circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
      <circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/>
    </svg>`;
    wrapper.style.position = 'relative';
    wrapper.appendChild(handle);

    wrapper.addEventListener('dragstart', onDragStart);
    wrapper.addEventListener('dragover', onDragOver);
    wrapper.addEventListener('drop', onDrop);
    wrapper.addEventListener('dragend', onDragEnd);
  }

  function onDragStart(e) {
    dragSrc = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.tfoUsername);
    this.classList.add('tfo-dragging');
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const section = getSection();
    const container = getContainer(section);
    if (!container) return;
    container.querySelectorAll('.tfo-drag-over').forEach(el => el.classList.remove('tfo-drag-over'));
    this.classList.add('tfo-drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    if (dragSrc === this) return;

    const section = getSection();
    const container = getContainer(section);
    if (!container) return;

    const wrappers = Array.from(container.querySelectorAll('[data-tfo-username]'));
    const srcIdx = wrappers.indexOf(dragSrc);
    const dstIdx = wrappers.indexOf(this);

    if (srcIdx === -1 || dstIdx === -1) return;

    if (srcIdx < dstIdx) {
      this.after(dragSrc);
    } else {
      this.before(dragSrc);
    }

    const newOrder = Array.from(container.querySelectorAll('[data-tfo-username]'))
      .map(el => el.dataset.tfoUsername);
    customOrder = newOrder;
    saveOrder(customOrder);

    reapplyVisibility();
  }

  function reapplyVisibility() {
    const section = getSection();
    const container = getContainer(section);
    if (!container) return;

    const wrappers = Array.from(container.querySelectorAll('[data-tfo-username]'));
    const wrapperMap = new Map();
    wrappers.forEach(w => wrapperMap.set(w.dataset.tfoUsername, w));

    wrappers.forEach((wrapper, idx) => {
      if (visibleCount > 0 && idx >= visibleCount) {
        wrapper.style.display = 'none';
        wrapper.dataset.tfoHidden = '1';
      } else {
        wrapper.style.display = '';
        wrapper.dataset.tfoHidden = '';
      }
    });

    addShowMoreToggle(section, wrappers.map(w => w.dataset.tfoUsername), wrapperMap);
  }

  function onDragEnd() {
    const section = getSection();
    const container = getContainer(section);
    if (container) {
      container.querySelectorAll('.tfo-dragging, .tfo-drag-over')
        .forEach(el => el.classList.remove('tfo-dragging', 'tfo-drag-over'));
    }
    dragSrc = null;
  }

  // --- Custom Show More/Less toggle ---
  function addShowMoreToggle(section, ordered, wrapperMap) {
    if (visibleCount <= 0) return;

    const existing = section.querySelector('.tfo-toggle');
    if (existing) existing.remove();

    const hiddenCount = ordered.length - visibleCount;
    if (hiddenCount <= 0) return;

    const toggle = document.createElement('div');
    toggle.className = 'tfo-toggle';

    const btn = document.createElement('button');
    btn.className = 'tfo-toggle-btn';

    let expanded = false;
    btn.textContent = `Show ${hiddenCount} More`;

    btn.addEventListener('click', () => {
      expanded = !expanded;
      const container = getContainer(section);
      if (!container) return;
      container.querySelectorAll('[data-tfo-hidden="1"]').forEach(el => {
        el.style.display = expanded ? '' : 'none';
      });
      btn.textContent = expanded ? 'Show Less' : `Show ${hiddenCount} More`;
    });

    toggle.appendChild(btn);

    const container = getContainer(section);
    if (container && container.nextSibling) {
      section.insertBefore(toggle, container.nextSibling);
    } else if (container) {
      section.appendChild(toggle);
    }
  }

  // --- Inject styles ---
  function injectStyles() {
    if (document.getElementById('tfo-styles')) return;
    const style = document.createElement('style');
    style.id = 'tfo-styles';
    style.textContent = `
      .tfo-handle {
        position: absolute;
        left: 2px;
        top: 50%;
        transform: translateY(-50%);
        color: rgba(255,255,255,0.3);
        cursor: grab;
        padding: 4px 2px;
        z-index: 10;
        opacity: 0;
        transition: opacity 0.15s;
        line-height: 0;
      }
      [data-tfo-username]:hover .tfo-handle {
        opacity: 1;
      }
      .tfo-handle:active { cursor: grabbing; }
      .tfo-dragging { opacity: 0.4; }
      .tfo-drag-over { outline: 2px solid #9147ff; outline-offset: -2px; border-radius: 4px; }
      .tfo-toggle {
        padding: 4px 8px;
        text-align: center;
      }
      .tfo-toggle-btn {
        background: none;
        border: none;
        color: #adadb8;
        cursor: pointer;
        font-size: 13px;
        padding: 4px 8px;
        border-radius: 4px;
      }
      .tfo-toggle-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
      [data-a-target="side-nav-show-less-button"] { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // --- Init ---
  function init() {
    injectStyles();

    const section = getSection();
    if (!section) return;

    const container = getContainer(section);
    if (!container) return;

    loadSettings(() => {
      expandAll(container, applyOrder);
    });
  }

  // --- MutationObserver: watch for sidebar appearing / React re-renders ---
  let initTimer = null;
  let lastCardCount = 0;

  const observer = new MutationObserver(() => {
    const section = getSection();
    if (!section) return;

    const links = getCards(getContainer(section));
    const count = links.length;

    if (count !== lastCardCount && !expandInterval) {
      lastCardCount = count;
      clearTimeout(initTimer);
      initTimer = setTimeout(init, 400);
    } else if (count > 0 && !expandInterval) {
      const firstWrapper = links[0]?.closest('.tw-transition');
      if (firstWrapper && !firstWrapper.dataset.tfoHandled) {
        clearTimeout(initTimer);
        initTimer = setTimeout(init, 400);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 1500);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
  }

  window.__tfo = {
    getChannels: () => {
      const section = getSection();
      return getCards(getContainer(section)).map(l => getUsername(l));
    },
    setVisibleCount: (n) => {
      visibleCount = n;
      saveVisible(n);
      isReordering = false;
      document.querySelectorAll('[data-tfo-handled]').forEach(el => {
        delete el.dataset.tfoHandled;
      });
      init();
    }
  };
})();
