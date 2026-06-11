const STORAGE_KEY = 'nightmareClicker_progress';
const DB_NAME = 'NightmareClickerDB';
const STORE_NAME = 'records';
const RECORD_ID = 'highscore';

const pointsEl = document.getElementById('points');
const levelEl = document.getElementById('level');
const recordEl = document.getElementById('record');
const progressTextEl = document.getElementById('progress-text');
const progressFillEl = document.getElementById('progress-fill');
const clickPowerEl = document.getElementById('click-power');
const clickerBtn = document.getElementById('clicker');
const levelupBanner = document.getElementById('levelup-banner');
const resetBtn = document.getElementById('reset');
const installBtn = document.getElementById('install-btn');
const installModal = document.getElementById('install-modal');
const installModalBody = document.getElementById('install-modal-body');
const installModalClose = document.getElementById('install-modal-close');
const clickHint = document.getElementById('click-hint');

let state = { points: 0, level: 1 };
let record = 0;
let db = null;
let deferredInstallPrompt = null;

function pointsPerClick(level) {
  return level * 10;
}

// Суммарные очки, необходимые для достижения начала указанного уровня.
// Каждый следующий уровень требует на 5 кликов больше, чем предыдущий.
function totalPointsForLevelStart(level) {
  const n = level - 1;
  return Math.round((100 * n * (n + 1) * (n + 2)) / 6);
}

const LEVELUP_PHRASES = [
  'Ты слышишь шёпот за спиной...',
  'Тени стали длиннее.',
  'Кто-то считает твои шаги.',
  'Дверь, которую ты запер, теперь открыта.',
  'Зеркало моргнуло первым.',
  'Свет начинает мигать.',
  'Оно знает, что ты здесь.',
  'Шаги приближаются.',
  'Ты не один в этой комнате.',
  'Холод пробирает до костей.',
  'Что-то шевелится в темноте.',
  'Голоса становятся громче.',
  'Стены будто дышат.',
  'Ты чувствуешь на себе чей-то взгляд.',
  'Часы остановились.'
];

function getLevelUpPhrase(level) {
  return LEVELUP_PHRASES[(level - 2) % LEVELUP_PHRASES.length];
}

function loadProgress() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (typeof parsed.points === 'number' && typeof parsed.level === 'number') {
        state = parsed;
      }
    } catch (e) {
      console.warn('Не удалось прочитать сохранённый прогресс', e);
    }
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function loadRecord() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(RECORD_ID);

    request.onsuccess = () => {
      record = request.result ? request.result.value : 0;
      resolve(record);
    };

    request.onerror = (event) => reject(event.target.error);
  });
}

function saveRecord(value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({ id: RECORD_ID, value });

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
}

function updateUI() {
  pointsEl.textContent = state.points;
  levelEl.textContent = state.level;
  recordEl.textContent = record;

  const levelStart = totalPointsForLevelStart(state.level);
  const levelEnd = totalPointsForLevelStart(state.level + 1);
  const progress = state.points - levelStart;
  const needed = levelEnd - levelStart;
  progressTextEl.textContent = `${progress} / ${needed}`;
  const percent = Math.min(100, (progress / needed) * 100);
  progressFillEl.style.width = percent + '%';

  clickPowerEl.textContent = `Каждый клик: +${pointsPerClick(state.level)} очков`;
}

function showLevelUp(level) {
  levelupBanner.innerHTML = `УРОВЕНЬ ${level}<span class="levelup-phrase">${getLevelUpPhrase(level)}</span>`;
  levelupBanner.classList.remove('show');
  void levelupBanner.offsetWidth;
  levelupBanner.classList.add('show');
}

async function handleClick() {
  hideClickHint();

  const gain = pointsPerClick(state.level);
  state.points += gain;

  const levelEnd = totalPointsForLevelStart(state.level + 1);
  if (state.points >= levelEnd) {
    state.level += 1;
    showLevelUp(state.level);
  }

  saveProgress();

  if (state.points > record) {
    record = state.points;
    try {
      await saveRecord(record);
    } catch (e) {
      console.warn('Не удалось сохранить рекорд', e);
    }
  }

  clickerBtn.classList.remove('shake');
  void clickerBtn.offsetWidth;
  clickerBtn.classList.add('shake');

  updateUI();
}

function hideClickHint() {
  clickHint.classList.add('hidden');
  localStorage.setItem('nightmareClicker_hintSeen', '1');
}

function handleReset() {
  if (!confirm('Сбросить весь текущий прогресс? Рекорд останется сохранён.')) return;
  state = { points: 0, level: 1 };
  saveProgress();
  updateUI();
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function isFirefox() {
  return /firefox/i.test(navigator.userAgent);
}

const INSTALL_INSTRUCTIONS = {
  ios: `
    <p>Safari не показывает кнопку установки сам — добавь игру на главный экран вручную:</p>
    <ol>
      <li>Нажми кнопку <strong>«Поделиться»</strong> (квадрат со стрелкой вверх) внизу экрана.</li>
      <li>Выбери <strong>«На экран «Домой»»</strong>.</li>
      <li>Нажми <strong>«Добавить»</strong> — иконка появится среди приложений.</li>
    </ol>
  `,
  firefox: `
    <p>Firefox на компьютере не умеет устанавливать сайты как приложения напрямую. Варианты:</p>
    <ul>
      <li>Открой эту страницу в <strong>Chrome / Edge</strong> и нажми значок установки (⊕) в адресной строке.</li>
      <li>Или установи расширение <strong>«PWAs for Firefox»</strong> — оно добавляет кнопку установки и создаёт ярлык приложения.</li>
    </ul>
    <p>На Firefox для Android: меню (⋮) → «Установить» или «Добавить на главный экран».</p>
  `,
  chrome: `
    <p>Установка пока недоступна автоматически. Нажми значок установки (⊕) в правой части адресной строки,</p>
    <p>либо открой меню браузера (⋮) → <strong>«Установить приложение»</strong> / <strong>«Добавить на главный экран»</strong>.</p>
  `,
  generic: `
    <p>Этот браузер не поддерживает автоматическую установку.</p>
    <p>Открой страницу в <strong>Chrome</strong> или <strong>Edge</strong> и нажми значок установки (⊕) в адресной строке, либо используй меню браузера → «Установить приложение» / «Добавить на главный экран».</p>
  `
};

function showInstallModal(type) {
  installModalBody.innerHTML = INSTALL_INSTRUCTIONS[type] || INSTALL_INSTRUCTIONS.generic;
  installModal.hidden = false;
}

function hideInstallModal() {
  installModal.hidden = true;
}

function setupInstallButton() {
  if (isStandalone()) return;

  installBtn.hidden = false;

  installBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (outcome === 'accepted') installBtn.hidden = true;
    } else if (isIOS()) {
      showInstallModal('ios');
    } else if (isFirefox()) {
      showInstallModal('firefox');
    } else if (/chrome|edg|chromium/i.test(navigator.userAgent)) {
      showInstallModal('chrome');
    } else {
      showInstallModal('generic');
    }
  });

  installModalClose.addEventListener('click', hideInstallModal);
  installModal.addEventListener('click', (e) => {
    if (e.target === installModal) hideInstallModal();
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    deferredInstallPrompt = null;
    hideInstallModal();
  });
}

async function init() {
  loadProgress();

  try {
    db = await openDB();
    await loadRecord();
  } catch (e) {
    console.warn('IndexedDB недоступна', e);
  }

  if (state.points > record) {
    record = state.points;
    if (db) {
      try { await saveRecord(record); } catch (e) { /* ignore */ }
    }
  }

  if (localStorage.getItem('nightmareClicker_hintSeen')) {
    clickHint.classList.add('hidden');
  }

  updateUI();

  clickerBtn.addEventListener('click', handleClick);
  resetBtn.addEventListener('click', handleReset);
  setupInstallButton();
}

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => {
      console.warn('Не удалось зарегистрировать service worker', e);
    });
  });
}
