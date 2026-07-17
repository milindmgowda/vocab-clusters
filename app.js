// State Management and Interactive Logic for Vocab Study App

// --- Initialization & Globals ---
let allWords = [];
let userProgress = {};
let activeTags = [];
let currentWordTags = [];
let currentWordSentiment = null;

// Modal edit state
let modalWord = '';
let modalWordTags = [];
let modalWordSentiment = null;

// Application state
const state = {
  currentView: 'study',
  // Study mode state
  study: {
    filteredWords: [],
    currentIndex: 0,
    groupFilter: 'All',
    statusFilter: 'All',
    tagFilter: 'All',
    sentimentFilter: 'All',
    searchQuery: ''
  },
  // Excel mode state
  excel: {
    filteredWords: [],
    groupFilter: 'All',
    statusFilter: 'All',
    tagFilter: 'All',
    sentimentFilter: 'All',
    searchQuery: '',
    selectedWord: null, // Currently selected word for synonym highlighting
    revealedMeanings: new Set(), // Set of words whose meanings are revealed in spreadsheet
    studyModeBlurred: true, // Whether meanings are blurred by default
    sortField: 'group', // Default sorting
    sortAscending: true
  }
};

// --- Toast Notification Helper ---
let toastTimeout;
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast-notification');
  const toastText = document.getElementById('toast-text');
  
  toastText.textContent = message;
  toast.classList.add('show');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// Close toast manually
document.getElementById('toast-close').addEventListener('click', () => {
  document.getElementById('toast-notification').classList.remove('show');
});

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem('vocab_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  if (theme === 'dark') {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
  } else {
    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
  }
}

document.getElementById('theme-toggle').addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('vocab_theme', newTheme);
  updateThemeIcon(newTheme);
  showToast(`Switched to ${newTheme} mode`);
});

// --- Data Loading & Progress Sync ---
function loadData() {
  // Load VOCAB_DATA from words.js global variable
  if (typeof VOCAB_DATA === 'undefined') {
    console.error('VOCAB_DATA not found. Please ensure words.js is loaded.');
    showToast('Error: Vocabulary data is missing!');
    return;
  }

  // Flatten group maps into a list of word objects
  allWords = [];
  for (const [groupName, words] of Object.entries(VOCAB_DATA)) {
    words.forEach(wordStr => {
      allWords.push({
        word: wordStr,
        group: groupName,
        groupNumber: parseInt(groupName.replace('Group ', '')) || 0
      });
    });
  }

  // Load persistence progress from localStorage
  const savedProgress = localStorage.getItem('vocab_study_progress');
  if (savedProgress) {
    try {
      const rawProgress = JSON.parse(savedProgress);
      userProgress = {};
      for (const [key, value] of Object.entries(rawProgress)) {
        userProgress[key.toLowerCase().trim()] = value;
      }
    } catch (e) {
      console.error('Failed to parse progress data', e);
      userProgress = {};
    }
  }

  updateProgressSummary();
  refreshActiveTags();
  
  // Attempt to sync from cloud (Vercel KV)
  loadCloudProgress();
}

function refreshActiveTags() {
  const tagSet = new Set();
  Object.values(userProgress).forEach(prog => {
    if (prog && Array.isArray(prog.tags)) {
      prog.tags.forEach(t => {
        const cleanTag = t.trim().toLowerCase();
        if (cleanTag) tagSet.add(cleanTag);
      });
    }
  });
  activeTags = Array.from(tagSet).sort();
  updateTagFiltersDropdowns();
}

function updateTagFiltersDropdowns() {
  const selects = [
    document.getElementById('study-tag-filter'),
    document.getElementById('excel-tag-filter')
  ].filter(Boolean);
  
  selects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = '<option value="All">All Tags</option>';
    
    activeTags.forEach(tag => {
      const opt = document.createElement('option');
      opt.value = tag;
      opt.textContent = tag;
      select.appendChild(opt);
    });
    
    if (activeTags.includes(currentValue)) {
      select.value = currentValue;
    } else {
      select.value = 'All';
      if (select.id === 'study-tag-filter') {
        state.study.tagFilter = 'All';
      } else {
        state.excel.tagFilter = 'All';
      }
    }
  });
}

function updateProgressSummary() {
  let definedCount = 0;
  allWords.forEach(w => {
    const progress = userProgress[w.word.toLowerCase()];
    if (progress && (progress.meaning || progress.synonyms)) {
      definedCount++;
    }
  });

  const percent = allWords.length > 0 ? Math.round((definedCount / allWords.length) * 100) : 0;
  
  const statsElements = document.querySelectorAll('.progress-stat-value');
  statsElements.forEach(el => {
    el.innerHTML = `<strong>${definedCount}</strong> / ${allWords.length} words (${percent}%)`;
  });

  // Set top progress bar width
  const progressBar = document.getElementById('top-progress-bar');
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
}

// --- Cloud Sync Helpers ---
function updateSyncIndicator(status, text) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  
  el.className = `sync-indicator sync-${status}`;
  
  let icon = '';
  if (status === 'syncing') {
    icon = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="spin-icon">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
      </svg>
    `;
  } else if (status === 'synced') {
    icon = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    `;
  } else if (status === 'local') {
    icon = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
        <line x1="7" y1="2" x2="7" y2="22"></line>
        <line x1="17" y1="2" x2="17" y2="22"></line>
        <line x1="2" y1="12" x2="22" y2="12"></line>
      </svg>
    `;
  } else if (status === 'error') {
    icon = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
  }
  
  el.innerHTML = `${icon}<span>${text}</span>`;
}

async function loadCloudProgress() {
  updateSyncIndicator('syncing', 'Connecting...');
  try {
    const response = await fetch('/api/progress');
    if (!response.ok) {
      throw new Error(`Load failed with status ${response.status}`);
    }
    const resData = await response.json();
    
    if (resData.status === 'no_kv_configured') {
      updateSyncIndicator('local', 'Local Mode');
      console.log('Vercel KV not configured. Running in Local Mode.');
      return;
    }
    
    if (resData.status === 'success' && resData.data) {
      // Normalize cloud keys to lowercase
      const normalizedCloud = {};
      for (const [key, value] of Object.entries(resData.data)) {
        normalizedCloud[key.toLowerCase().trim()] = value;
      }
      
      // Merge cloud data with local data
      const mergedProgress = { ...userProgress, ...normalizedCloud };
      userProgress = mergedProgress;
      localStorage.setItem('vocab_study_progress', JSON.stringify(userProgress));
      updateProgressSummary();
      
      // Re-render current view
      if (state.currentView === 'study') {
        applyStudyFilters();
      } else {
        applyExcelFilters();
      }
      updateSyncIndicator('synced', 'Cloud Synced');
      showToast('Cloud data loaded & merged!');
    }
  } catch (e) {
    console.error('Failed to load from cloud', e);
    updateSyncIndicator('error', 'Offline');
  }
}

let syncDebounceTimer;
function triggerCloudSync() {
  updateSyncIndicator('syncing', 'Syncing...');
  clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(userProgress)
      });
      
      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}`);
      }
      
      const resData = await response.json();
      if (resData.status === 'no_kv_configured') {
        updateSyncIndicator('local', 'Local Mode');
      } else {
        updateSyncIndicator('synced', 'Cloud Synced');
      }
    } catch (e) {
      console.error('Sync failed', e);
      updateSyncIndicator('error', 'Sync Failed');
    }
  }, 1200); // 1.2s delay to prevent spamming
}

function saveWordProgress(word, meaning, synonyms, tags = [], sentiment = null, shouldSync = false) {
  if (!word) return;

  const wordKey = word.toLowerCase().trim();
  meaning = meaning.trim();
  synonyms = synonyms.trim();

  const prevProg = userProgress[wordKey];
  const tagsChanged = JSON.stringify(prevProg?.tags || []) !== JSON.stringify(tags);
  const sentimentChanged = (prevProg?.sentiment || null) !== sentiment;
  const hasChanged = !prevProg || prevProg.meaning !== meaning || prevProg.synonyms !== synonyms || tagsChanged || sentimentChanged;

  if (!meaning && !synonyms && (!tags || tags.length === 0) && !sentiment) {
    delete userProgress[wordKey];
  } else {
    userProgress[wordKey] = { meaning, synonyms, tags, sentiment };
  }

  localStorage.setItem('vocab_study_progress', JSON.stringify(userProgress));
  updateProgressSummary();
  refreshActiveTags();
  
  if (shouldSync && hasChanged) {
    triggerCloudSync();
  }
}

// --- View Router ---
function syncFiltersStudyToExcel() {
  state.excel.groupFilter = state.study.groupFilter;
  state.excel.statusFilter = state.study.statusFilter;
  state.excel.tagFilter = state.study.tagFilter;
  state.excel.sentimentFilter = state.study.sentimentFilter;
  state.excel.searchQuery = state.study.searchQuery;

  const eg = document.getElementById('excel-group-filter');
  const es = document.getElementById('excel-status-filter');
  const et = document.getElementById('excel-tag-filter');
  const ec = document.getElementById('excel-sentiment-filter');
  const ei = document.getElementById('excel-search-input');

  if (eg) eg.value = state.study.groupFilter;
  if (es) es.value = state.study.statusFilter;
  if (et) et.value = state.study.tagFilter;
  if (ec) ec.value = state.study.sentimentFilter;
  if (ei) ei.value = state.study.searchQuery;
}

function syncFiltersExcelToStudy() {
  state.study.groupFilter = state.excel.groupFilter;
  state.study.statusFilter = state.excel.statusFilter;
  state.study.tagFilter = state.excel.tagFilter;
  state.study.sentimentFilter = state.excel.sentimentFilter;
  state.study.searchQuery = state.excel.searchQuery;

  const sg = document.getElementById('study-group-filter');
  const ss = document.getElementById('study-status-filter');
  const st = document.getElementById('study-tag-filter');
  const sc = document.getElementById('study-sentiment-filter');
  const si = document.getElementById('study-search-input');

  if (sg) sg.value = state.excel.groupFilter;
  if (ss) ss.value = state.excel.statusFilter;
  if (st) st.value = state.excel.tagFilter;
  if (sc) sc.value = state.excel.sentimentFilter;
  if (si) si.value = state.excel.searchQuery;
}

function onStudyFilterChange() {
  syncFiltersStudyToExcel();
  applyStudyFilters();
  applyExcelFilters();
}

function onExcelFilterChange() {
  syncFiltersExcelToStudy();
  state.excel.selectedWord = null;
  applyExcelFilters();
  applyStudyFilters();
}

function showView(viewName) {
  state.currentView = viewName;
  
  // Update header buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });

  // Switch view containers
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.toggle('active', section.id === `${viewName}-view`);
  });

  if (viewName === 'study') {
    applyStudyFilters();
  } else if (viewName === 'excel') {
    applyExcelFilters();
    // Auto scroll to selected word row in spreadsheet
    if (state.excel.selectedWord) {
      setTimeout(() => {
        const row = document.querySelector(`[data-row-word="${state.excel.selectedWord}"]`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
    }
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewName = btn.getAttribute('data-view');
    // Save current active word progress before leaving study view
    if (state.currentView === 'study') {
      saveActiveWordFromUI(true);
      
      const currentWordObj = state.study.filteredWords[state.study.currentIndex];
      state.excel.selectedWord = currentWordObj ? currentWordObj.word : null;
      syncFiltersStudyToExcel();
    } else if (state.currentView === 'excel') {
      syncFiltersExcelToStudy();
      
      if (state.excel.selectedWord) {
        applyStudyFilters(); // populate study list first to find index
        const idx = state.study.filteredWords.findIndex(w => w.word.toLowerCase() === state.excel.selectedWord.toLowerCase());
        if (idx !== -1) {
          state.study.currentIndex = idx;
        }
      }
    }
    showView(viewName);
  });
});

// --- Study View Logic ---
function applyStudyFilters() {
  const query = state.study.searchQuery.toLowerCase().trim();
  
  state.study.filteredWords = allWords.filter(w => {
    // Group filter
    if (state.study.groupFilter !== 'All' && w.group !== state.study.groupFilter) {
      return false;
    }
    
    // Status filter
    const progress = userProgress[w.word.toLowerCase()];
    const hasData = progress && (progress.meaning || progress.synonyms);
    if (state.study.statusFilter === 'Defined' && !hasData) return false;
    if (state.study.statusFilter === 'Undefined' && hasData) return false;
    
    // Tag filter
    if (state.study.tagFilter !== 'All') {
      if (!progress || !Array.isArray(progress.tags) || !progress.tags.includes(state.study.tagFilter)) {
        return false;
      }
    }
    
    // Sentiment filter
    if (state.study.sentimentFilter !== 'All') {
      const activeSentiment = progress?.sentiment || null;
      if (activeSentiment !== state.study.sentimentFilter) {
        return false;
      }
    }
    
    // Search query
    if (query) {
      const matchWord = w.word.toLowerCase().includes(query);
      const matchMeaning = progress && (progress.meaning || '').toLowerCase().includes(query);
      const matchSynonyms = progress && (progress.synonyms || '').toLowerCase().includes(query);
      return matchWord || matchMeaning || matchSynonyms;
    }
    
    return true;
  });

  // Reset index to bounds
  if (state.study.currentIndex >= state.study.filteredWords.length) {
    state.study.currentIndex = 0;
  }

  renderStudyWord();
}

function saveActiveWordFromUI(shouldSync = false) {
  if (state.study.filteredWords.length === 0) return;
  const currentWordObj = state.study.filteredWords[state.study.currentIndex];
  const meaning = document.getElementById('study-meaning').value;
  const synonyms = document.getElementById('study-synonyms').value;
  saveWordProgress(currentWordObj.word, meaning, synonyms, currentWordTags, currentWordSentiment, shouldSync);
}

function renderStudyWord() {
  const container = document.getElementById('study-card-wrapper');
  
  if (state.study.filteredWords.length === 0) {
    container.innerHTML = `
      <div class="word-card" style="justify-content: center; align-items: center; text-align: center;">
        <div class="word-display" style="font-size: 24px; color: var(--accents-4);">No words found matching the current filters</div>
        <p style="font-size: 14px; color: var(--accents-3); margin-top: 10px;">Try adjusting your search query, group selection or completion status filter.</p>
      </div>
    `;
    document.getElementById('study-meaning').value = '';
    document.getElementById('study-synonyms').value = '';
    document.getElementById('study-tags-input').value = '';
    document.getElementById('study-tags-list').innerHTML = '';
    document.getElementById('study-meaning').disabled = true;
    document.getElementById('study-synonyms').disabled = true;
    document.getElementById('study-tags-input').disabled = true;
    document.getElementById('study-save-btn').disabled = true;
    return;
  }

  document.getElementById('study-meaning').disabled = false;
  document.getElementById('study-synonyms').disabled = false;
  document.getElementById('study-tags-input').disabled = false;
  document.getElementById('study-save-btn').disabled = false;

  const wordObj = state.study.filteredWords[state.study.currentIndex];
  const progress = userProgress[wordObj.word.toLowerCase()] || { meaning: '', synonyms: '' };

  // Update card elements
  container.innerHTML = `
    <div class="word-card">
      <div class="word-header">
        <span class="group-badge">${wordObj.group}</span>
        <span class="card-progress">Word ${state.study.currentIndex + 1} of ${state.study.filteredWords.length}</span>
      </div>
      
      <div class="word-display-container">
        <h2 class="word-display">${wordObj.word}</h2>
        <span class="word-status-indicator ${progress.meaning || progress.synonyms ? 'status-defined' : 'status-undefined'}">
          ${progress.meaning || progress.synonyms ? 'Defined' : 'Undefined'}
        </span>
      </div>
      
      <div class="study-actions">
        <button class="btn btn-secondary" id="study-random-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          Random
        </button>
        <div class="navigation-buttons">
          <button class="btn btn-secondary" id="study-prev-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Prev
          </button>
          <button class="btn btn-primary" id="study-next-btn">
            Next
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;

  // Update inputs
  document.getElementById('study-meaning').value = progress.meaning;
  document.getElementById('study-synonyms').value = progress.synonyms;
  document.getElementById('study-tags-input').value = '';

  // Set current tags
  currentWordTags = Array.isArray(progress.tags) ? [...progress.tags] : [];
  renderStudyTagsList();

  // Set current sentiment
  currentWordSentiment = progress.sentiment || null;
  document.querySelectorAll('#study-sentiment-group .sentiment-btn').forEach(btn => {
    const s = btn.getAttribute('data-sentiment');
    if (s === currentWordSentiment) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Add click listeners to card buttons
  document.getElementById('study-random-btn').addEventListener('click', jumpToRandomWord);
  document.getElementById('study-prev-btn').addEventListener('click', prevWord);
  document.getElementById('study-next-btn').addEventListener('click', nextWord);
}

function renderStudyTagsList() {
  const listEl = document.getElementById('study-tags-list');
  if (!listEl) return;

  listEl.innerHTML = currentWordTags.map(tag => `
    <span class="tag-badge">
      <span>${tag}</span>
      <button class="tag-remove-btn" onclick="removeWordTag('${tag.replace(/'/g, "\\'")}')" title="Remove tag">&times;</button>
    </span>
  `).join('');
}

function addWordTag(tag) {
  tag = tag.trim().toLowerCase();
  if (!tag) return;

  if (!currentWordTags.includes(tag)) {
    currentWordTags.push(tag);
    renderStudyTagsList();
    saveActiveWordFromUI(false); // Save locally instantly
  }
}

function removeWordTag(tag) {
  tag = tag.trim().toLowerCase();
  currentWordTags = currentWordTags.filter(t => t !== tag);
  renderStudyTagsList();
  saveActiveWordFromUI(false); // Save locally instantly
}

function prevWord() {
  if (state.study.filteredWords.length === 0) return;
  saveActiveWordFromUI(true);
  state.study.currentIndex = (state.study.currentIndex - 1 + state.study.filteredWords.length) % state.study.filteredWords.length;
  renderStudyWord();
}

function nextWord() {
  if (state.study.filteredWords.length === 0) return;
  saveActiveWordFromUI(true);
  state.study.currentIndex = (state.study.currentIndex + 1) % state.study.filteredWords.length;
  renderStudyWord();
}

function jumpToRandomWord() {
  if (state.study.filteredWords.length <= 1) return;
  saveActiveWordFromUI(true);
  let rand;
  do {
    rand = Math.floor(Math.random() * state.study.filteredWords.length);
  } while (rand === state.study.currentIndex);
  
  state.study.currentIndex = rand;
  renderStudyWord();
}

// Bind active listeners for study input changes to save automatically
const debounceSave = (func, delay = 500) => {
  let debounceTimer;
  return function() {
    const context = this;
    const args = arguments;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(context, args), delay);
  };
};

const autosaveFields = debounceSave(() => {
  if (state.study.filteredWords.length > 0) {
    saveActiveWordFromUI(false); // Local save only on typing
    // Update card defined/undefined pill visually without redraw
    const currentWordObj = state.study.filteredWords[state.study.currentIndex];
    const progress = userProgress[currentWordObj.word.toLowerCase()] || { meaning: '', synonyms: '' };
    const badge = document.querySelector('.word-display-container .word-status-indicator');
    if (badge) {
      const hasData = progress.meaning || progress.synonyms;
      badge.className = `word-status-indicator ${hasData ? 'status-defined' : 'status-undefined'}`;
      badge.textContent = hasData ? 'Defined' : 'Undefined';
    }
  }
}, 500);

document.getElementById('study-meaning').addEventListener('input', autosaveFields);
document.getElementById('study-synonyms').addEventListener('input', autosaveFields);

// Sync on blur (losing focus)
document.getElementById('study-meaning').addEventListener('blur', () => {
  saveActiveWordFromUI(true);
});
document.getElementById('study-synonyms').addEventListener('blur', () => {
  saveActiveWordFromUI(true);
});

// Filter Event Listeners (Study Mode)
document.getElementById('study-group-filter').addEventListener('change', (e) => {
  saveActiveWordFromUI(true);
  state.study.groupFilter = e.target.value;
  state.study.currentIndex = 0;
  onStudyFilterChange();
});

document.getElementById('study-status-filter').addEventListener('change', (e) => {
  saveActiveWordFromUI(true);
  state.study.statusFilter = e.target.value;
  state.study.currentIndex = 0;
  onStudyFilterChange();
});

document.getElementById('study-search-input').addEventListener('input', (e) => {
  saveActiveWordFromUI(false); // Typing in search should not trigger cloud sync
  state.study.searchQuery = e.target.value;
  state.study.currentIndex = 0;
  onStudyFilterChange();
});

// --- Excel View Logic ---
function applyExcelFilters() {
  const query = state.excel.searchQuery.toLowerCase().trim();
  
  state.excel.filteredWords = allWords.filter(w => {
    // Group filter
    if (state.excel.groupFilter !== 'All' && w.group !== state.excel.groupFilter) {
      return false;
    }
    
    // Status filter
    const progress = userProgress[w.word.toLowerCase()];
    const hasData = progress && (progress.meaning || progress.synonyms);
    if (state.excel.statusFilter === 'Defined' && !hasData) return false;
    if (state.excel.statusFilter === 'Undefined' && hasData) return false;
    
    // Tag filter
    if (state.excel.tagFilter !== 'All') {
      if (!progress || !Array.isArray(progress.tags) || !progress.tags.includes(state.excel.tagFilter)) {
        return false;
      }
    }
    
    // Sentiment filter
    if (state.excel.sentimentFilter !== 'All') {
      const activeSentiment = progress?.sentiment || null;
      if (activeSentiment !== state.excel.sentimentFilter) {
        return false;
      }
    }
    
    // Search query
    if (query) {
      const matchWord = w.word.toLowerCase().includes(query);
      const matchMeaning = progress && (progress.meaning || '').toLowerCase().includes(query);
      const matchSynonyms = progress && (progress.synonyms || '').toLowerCase().includes(query);
      return matchWord || matchMeaning || matchSynonyms;
    }
    
    return true;
  });

  sortExcelWords();
  renderExcelGrid();
}

function sortExcelWords() {
  const field = state.excel.sortField;
  const ascending = state.excel.sortAscending;

  state.excel.filteredWords.sort((a, b) => {
    let valA = '';
    let valB = '';

    if (field === 'word') {
      valA = a.word.toLowerCase();
      valB = b.word.toLowerCase();
    } else if (field === 'group') {
      // Sort numerically by group number
      valA = a.groupNumber;
      valB = b.groupNumber;
    } else if (field === 'meaning') {
      valA = (userProgress[a.word.toLowerCase()]?.meaning || '').toLowerCase();
      valB = (userProgress[b.word.toLowerCase()]?.meaning || '').toLowerCase();
    } else if (field === 'synonyms') {
      valA = (userProgress[a.word.toLowerCase()]?.synonyms || '').toLowerCase();
      valB = (userProgress[b.word.toLowerCase()]?.synonyms || '').toLowerCase();
    } else if (field === 'tags') {
      valA = (userProgress[a.word.toLowerCase()]?.tags || []).join(',').toLowerCase();
      valB = (userProgress[b.word.toLowerCase()]?.tags || []).join(',').toLowerCase();
    } else if (field === 'sentiment') {
      valA = userProgress[a.word.toLowerCase()]?.sentiment || '';
      valB = userProgress[b.word.toLowerCase()]?.sentiment || '';
    } else if (field === 'status') {
      const aHas = userProgress[a.word.toLowerCase()] && (userProgress[a.word.toLowerCase()].meaning || userProgress[a.word.toLowerCase()].synonyms || userProgress[a.word.toLowerCase()].tags?.length > 0 || userProgress[a.word.toLowerCase()].sentiment);
      const bHas = userProgress[b.word.toLowerCase()] && (userProgress[b.word.toLowerCase()].meaning || userProgress[b.word.toLowerCase()].synonyms || userProgress[b.word.toLowerCase()].tags?.length > 0 || userProgress[b.word.toLowerCase()].sentiment);
      valA = aHas ? 1 : 0;
      valB = bHas ? 1 : 0;
    }

    if (valA < valB) return ascending ? -1 : 1;
    if (valA > valB) return ascending ? 1 : -1;
    return 0;
  });
}

function renderExcelGrid() {
  const tbody = document.getElementById('excel-tbody');
  
  if (state.excel.filteredWords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <h4>No matching vocabulary rows</h4>
          <p>Try refining your spreadsheet search text or status filters.</p>
        </td>
      </tr>
    `;
    return;
  }

  // Pre-calculate mapping for rapid synonym highlighting checks
  const synonymMapping = {};
  state.excel.filteredWords.forEach(w => {
    const prog = userProgress[w.word.toLowerCase()];
    if (prog && prog.synonyms) {
      synonymMapping[w.word] = prog.synonyms.split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
    } else {
      synonymMapping[w.word] = [];
    }
  });

  // Calculate highlighted matches
  let matches = new Set();
  const selWord = state.excel.selectedWord;
  if (selWord) {
    const selLower = selWord.toLowerCase();
    const selProg = userProgress[selWord.toLowerCase()];
    // Synonyms listed by the selected word
    const selWordSynonyms = selProg && selProg.synonyms ? selProg.synonyms.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    
    state.excel.filteredWords.forEach(w => {
      const wLower = w.word.toLowerCase();
      
      // Match 1: This word is directly in the selected word's synonyms list
      const isListedAsSynonym = selWordSynonyms.includes(wLower);
      
      // Match 2: The selected word is listed in this word's synonyms list
      const listsSelWordAsSynonym = synonymMapping[w.word] ? synonymMapping[w.word].includes(selLower) : false;
      
      if ((isListedAsSynonym || listsSelWordAsSynonym) && wLower !== selLower) {
        matches.add(w.word);
      }
    });
  }

  let htmlRows = '';
  state.excel.filteredWords.forEach(w => {
    const prog = userProgress[w.word.toLowerCase()] || { meaning: '', synonyms: '', tags: [], sentiment: null };
    const hasProgress = prog.meaning || prog.synonyms || (prog.tags && prog.tags.length > 0) || prog.sentiment;
    
    // Highlights
    const isSelected = w.word === selWord;
    const isSynonymHighlight = matches.has(w.word);
    
    let rowClass = '';
    if (isSelected) {
      rowClass = 'selected-word-row';
    } else if (isSynonymHighlight) {
      rowClass = 'synonym-highlight';
    }
    
    // Status Badge
    const statusBadge = hasProgress 
      ? `<span class="word-status-indicator status-defined">Defined</span>` 
      : `<span class="word-status-indicator status-undefined">Undefined</span>`;

    // Meaning Cell rendering (handling blurring)
    const isRevealed = state.excel.revealedMeanings.has(w.word) || !state.excel.studyModeBlurred;
    const meaningText = prog.meaning || '-';
    const meaningCell = `<td class="excel-meaning-cell ${!isRevealed && prog.meaning ? 'blurred-meaning' : ''}" data-word="${w.word}" data-label="Meaning">
      ${meaningText}
    </td>`;

    // Synonyms formatted nicely as badges
    let synonymCellContent = '-';
    if (prog.synonyms) {
      synonymCellContent = prog.synonyms.split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => `<span class="tag-badge">${s}</span>`)
        .join('');
    }

    // Tags formatted nicely as purple badges
    let tagsCellContent = '-';
    if (prog.tags && prog.tags.length > 0) {
      tagsCellContent = prog.tags
        .map(t => `<span class="tag-badge" style="background-color: rgba(168, 85, 247, 0.08); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.15);">${t}</span>`)
        .join('');
    }

    // Sentiment Connotation badges
    let sentimentCellContent = '-';
    if (prog.sentiment) {
      let sentimentText = '';
      let sentimentClass = '';
      if (prog.sentiment === 'positive') { sentimentText = '+'; sentimentClass = 'pos'; }
      else if (prog.sentiment === 'neutral') { sentimentText = '='; sentimentClass = 'neu'; }
      else if (prog.sentiment === 'negative') { sentimentText = '-'; sentimentClass = 'neg'; }
      sentimentCellContent = `<span class="sentiment-badge ${sentimentClass}">${sentimentText}</span>`;
    }

    htmlRows += `
      <tr class="${rowClass}" data-row-word="${w.word}">
        <td class="excel-word-cell" data-word="${w.word}" data-label="Word">${w.word}</td>
        <td style="font-family: var(--font-mono);" data-label="Group">${w.group}</td>
        ${meaningCell}
        <td data-label="Synonyms">${synonymCellContent}</td>
        <td data-label="Tags">${tagsCellContent}</td>
        <td data-label="Charge">${sentimentCellContent}</td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Actions">
          <button class="btn btn-secondary excel-edit-btn" data-word="${w.word}" style="height: 28px; padding: 0 10px; font-size: 11px;">
            Edit
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = htmlRows;

  // Bind cell click listeners
  tbody.querySelectorAll('.excel-word-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const clickedWord = e.target.getAttribute('data-word');
      handleWordCellClick(clickedWord);
    });
  });

  tbody.querySelectorAll('.excel-meaning-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      const clickedWord = cell.getAttribute('data-word');
      // If it is blurred, click unblurs it
      if (cell.classList.contains('blurred-meaning')) {
        state.excel.revealedMeanings.add(clickedWord);
        cell.classList.remove('blurred-meaning');
        cell.classList.add('revealed-meaning');
      }
    });
  });

  tbody.querySelectorAll('.excel-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const clickedWord = btn.getAttribute('data-word');
      openEditModal(clickedWord);
    });
  });
}

function openEditModal(word) {
  modalWord = word;
  const progress = userProgress[word.toLowerCase()] || { meaning: '', synonyms: '', tags: [], sentiment: null };

  document.getElementById('modal-word-title').textContent = word;
  document.getElementById('modal-meaning').value = progress.meaning || '';
  document.getElementById('modal-synonyms').value = progress.synonyms || '';
  document.getElementById('modal-tags-input').value = '';

  modalWordTags = Array.isArray(progress.tags) ? [...progress.tags] : [];
  renderModalTagsList();

  modalWordSentiment = progress.sentiment || null;
  document.querySelectorAll('#modal-sentiment-group .sentiment-btn').forEach(btn => {
    const s = btn.getAttribute('data-sentiment');
    if (s === modalWordSentiment) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  modalWord = '';
  modalWordTags = [];
  modalWordSentiment = null;
}

function renderModalTagsList() {
  const listEl = document.getElementById('modal-tags-list');
  if (!listEl) return;

  listEl.innerHTML = modalWordTags.map(tag => `
    <span class="tag-badge">
      <span>${tag}</span>
      <button class="tag-remove-btn" onclick="removeModalWordTag('${tag.replace(/'/g, "\\'")}')" title="Remove tag">&times;</button>
    </span>
  `).join('');
}

function addModalWordTag(tag) {
  tag = tag.trim().toLowerCase();
  if (!tag) return;

  if (!modalWordTags.includes(tag)) {
    modalWordTags.push(tag);
    renderModalTagsList();
  }
}

function removeModalWordTag(tag) {
  tag = tag.trim().toLowerCase();
  modalWordTags = modalWordTags.filter(t => t !== tag);
  renderModalTagsList();
}

function handleWordCellClick(word) {
  if (state.excel.selectedWord === word) {
    // Second click: Reveal meaning and clear selected word synonym highlights
    state.excel.revealedMeanings.add(word);
    state.excel.selectedWord = null;
    showToast(`Revealed meaning for: "${word}"`);
    renderExcelGrid();
  } else {
    // First click: Select word and highlight synonyms
    state.excel.selectedWord = word;
    
    // Also reveal its meaning to make the study process useful
    state.excel.revealedMeanings.add(word);

    // Calculate synonym count to display in toast
    const prog = userProgress[word.toLowerCase()];
    const wordSynonyms = prog && prog.synonyms ? prog.synonyms.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    
    showToast(`Selected "${word}". Click again to reveal meaning. Synonyms highlighted!`);
    renderExcelGrid();
  }
}

function jumpToEditWord(word) {
  // Find index in the study list of all words
  const studyIndex = state.study.filteredWords.findIndex(w => w.word.toLowerCase() === word.toLowerCase());
  
  if (studyIndex !== -1) {
    state.study.currentIndex = studyIndex;
  } else {
    // If not found in filtered study list, clear study filters and find
    state.study.groupFilter = 'All';
    state.study.statusFilter = 'All';
    state.study.searchQuery = '';
    
    // Sync UI elements
    document.getElementById('study-group-filter').value = 'All';
    document.getElementById('study-status-filter').value = 'All';
    document.getElementById('study-search-input').value = '';
    
    applyStudyFilters();
    
    const index = state.study.filteredWords.findIndex(w => w.word.toLowerCase() === word.toLowerCase());
    if (index !== -1) {
      state.study.currentIndex = index;
    }
  }

  showView('study');
  renderStudyWord();
  
  // Focus meaning textbox
  setTimeout(() => {
    document.getElementById('study-meaning').focus();
  }, 100);
}

// Bind sorting listeners to headers
document.querySelectorAll('.spreadsheet-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const field = th.getAttribute('data-sort');
    if (state.excel.sortField === field) {
      state.excel.sortAscending = !state.excel.sortAscending;
    } else {
      state.excel.sortField = field;
      state.excel.sortAscending = true;
    }
    
    // Update visual sorting indicator
    document.querySelectorAll('.spreadsheet-table th[data-sort]').forEach(el => {
      el.innerHTML = el.innerHTML.replace(/ [▲▼]/, '');
    });
    
    th.innerHTML += state.excel.sortAscending ? ' ▲' : ' ▼';
    
    applyExcelFilters();
  });
});

// Grid Filters Event Listeners
document.getElementById('excel-group-filter').addEventListener('change', (e) => {
  state.excel.groupFilter = e.target.value;
  onExcelFilterChange();
});

document.getElementById('excel-status-filter').addEventListener('change', (e) => {
  state.excel.statusFilter = e.target.value;
  onExcelFilterChange();
});

document.getElementById('excel-search-input').addEventListener('input', (e) => {
  state.excel.searchQuery = e.target.value;
  onExcelFilterChange();
});

// Blurred study switch toggle
document.getElementById('study-mode-toggle').addEventListener('change', (e) => {
  state.excel.studyModeBlurred = e.target.checked;
  renderExcelGrid();
  showToast(state.excel.studyModeBlurred ? 'Spreadsheet Study Mode: Meanings Blurred' : 'Spreadsheet Study Mode: Meanings Visible');
});

// --- Backup & Settings Panel ---

// Export LocalStorage Progress data to file
document.getElementById('backup-export-btn').addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userProgress, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute("download", `gre_vocab_progress_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Progress exported successfully!');
});

// Import Progress data file
document.getElementById('backup-import-file').addEventListener('change', (e) => {
  const fileReader = new FileReader();
  const file = e.target.files[0];
  
  if (!file) return;
  
  fileReader.onload = function(event) {
    try {
      const importedData = JSON.parse(event.target.result);
      
      // Basic format validation
      if (typeof importedData !== 'object' || importedData === null) {
        throw new Error('Invalid JSON format');
      }
      
      // Normalize imported keys to lowercase
      const normalizedImported = {};
      for (const [key, value] of Object.entries(importedData)) {
        normalizedImported[key.toLowerCase().trim()] = value;
      }
      
      // Merge progress
      userProgress = { ...userProgress, ...normalizedImported };
      localStorage.setItem('vocab_study_progress', JSON.stringify(userProgress));
      
      updateProgressSummary();
      
      if (state.currentView === 'study') {
        applyStudyFilters();
      } else {
        applyExcelFilters();
      }
      
      showToast('Progress imported successfully!');
    } catch (err) {
      console.error('Import error:', err);
      showToast('Error: Failed to parse import file!');
    }
  };
  
  fileReader.readAsText(file);
  // Clear the input value so the change event triggers if the same file is re-selected
  e.target.value = '';
});

// Reset entire progress
document.getElementById('settings-reset-btn').addEventListener('click', () => {
  const confirm1 = confirm("Are you sure you want to delete all saved word meanings and synonyms?");
  if (confirm1) {
    const confirm2 = confirm("This action cannot be undone. Please make sure you have backed up if you want to save your progress. Are you ABSOLUTELY sure?");
    if (confirm2) {
      userProgress = {};
      localStorage.removeItem('vocab_study_progress');
      updateProgressSummary();
      
      if (state.currentView === 'study') {
        applyStudyFilters();
      } else {
        applyExcelFilters();
      }
      
      showToast('All progress reset successfully');
    }
  }
});

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  // If user is editing in inputs, bypass global shortcuts unless it is Ctrl+Enter
  const isEditing = document.activeElement === document.getElementById('study-meaning') || 
                    document.activeElement === document.getElementById('study-synonyms') || 
                    document.activeElement.tagName === 'INPUT';
  
  if (isEditing) {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      saveActiveWordFromUI(true);
      document.activeElement.blur();
      showToast('Progress saved!');
    }
    return;
  }

  if (state.currentView === 'study') {
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      nextWord();
    } else if (e.key === 'ArrowLeft') {
      prevWord();
    } else if (e.key.toLowerCase() === 'r') {
      jumpToRandomWord();
    } else if (e.key === '/') {
      e.preventDefault();
      document.getElementById('study-search-input').focus();
    }
  }
});

// --- Dynamic PWA Icon Generation (SVG to PNG base64) ---
function generateDynamicIcon() {
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <radialGradient id="bg-grad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#1c1c1e" />
          <stop offset="100%" stop-color="#000000" />
        </radialGradient>
        <linearGradient id="neon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#a855f7" />
          <stop offset="50%" stop-color="#6366f1" />
          <stop offset="100%" stop-color="#3b82f6" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="120" fill="url(#bg-grad)" stroke="#222" stroke-width="6" />
      <circle cx="256" cy="256" r="236" fill="none" stroke="url(#neon-grad)" stroke-width="2" opacity="0.3" />
      <path d="M150 180 C 150 140, 200 130, 256 160 C 312 130, 362 140, 362 180 L 362 380 C 362 340, 312 330, 256 360 C 200 330, 150 340, 150 380 Z" fill="none" stroke="url(#neon-grad)" stroke-width="16" stroke-linejoin="round" />
      <line x1="256" y1="160" x2="256" y2="360" stroke="url(#neon-grad)" stroke-width="16" stroke-linecap="round" />
      <path d="M190 200 L256 310 L322 200" fill="none" stroke="#ffffff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.width = 180;
  img.height = 180;
  
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 180, 180);
    
    try {
      const pngUrl = canvas.toDataURL('image/png');
      
      // Update apple touch icon dynamically
      let appleTouchLink = document.querySelector('link[rel="apple-touch-icon"]');
      if (appleTouchLink) {
        appleTouchLink.href = pngUrl;
      }
      
      // Update favicon dynamically
      let faviconLink = document.querySelector('link[rel="icon"]');
      if (faviconLink) {
        faviconLink.href = pngUrl;
      }
    } catch (e) {
      console.warn('Canvas toDataURL failed (local file context?), fallback to static SVG', e);
    }
    
    URL.revokeObjectURL(url);
  };
  
  img.src = url;
}

// --- App Load Event ---
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadData();
  generateDynamicIcon();
  
  // Register Service Worker for PWA (Offline capability)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker registered successfully!', reg.scope))
        .catch(err => console.warn('Service Worker registration failed:', err));
    });
  }
  
  // Populate filter dropdowns with all groups (1-38)
  const groupSelects = [
    document.getElementById('study-group-filter'),
    document.getElementById('excel-group-filter')
  ];

  groupSelects.forEach(select => {
    // Clear initial options, keep 'All'
    select.innerHTML = '<option value="All">All Groups</option>';
    
    // Sort groups dynamically (since we have Groups 1 to 38)
    const sortedGroups = Object.keys(VOCAB_DATA).sort((a, b) => {
      const numA = parseInt(a.replace('Group ', '')) || 0;
      const numB = parseInt(b.replace('Group ', '')) || 0;
      return numA - numB;
    });

    sortedGroups.forEach(groupName => {
      const opt = document.createElement('option');
      opt.value = groupName;
      opt.textContent = groupName;
      select.appendChild(opt);
    });
  });

  // Tag Filter listeners
  document.getElementById('study-tag-filter').addEventListener('change', (e) => {
    saveActiveWordFromUI(true);
    state.study.tagFilter = e.target.value;
    state.study.currentIndex = 0;
    onStudyFilterChange();
  });

  document.getElementById('excel-tag-filter').addEventListener('change', (e) => {
    state.excel.tagFilter = e.target.value;
    onExcelFilterChange();
  });

  // Sentiment/Connotation Filter listeners
  document.getElementById('study-sentiment-filter').addEventListener('change', (e) => {
    saveActiveWordFromUI(true);
    state.study.sentimentFilter = e.target.value;
    state.study.currentIndex = 0;
    onStudyFilterChange();
  });

  document.getElementById('excel-sentiment-filter').addEventListener('change', (e) => {
    state.excel.sentimentFilter = e.target.value;
    onExcelFilterChange();
  });

  // Segmented Connotation Button click listeners
  document.querySelectorAll('#study-sentiment-group .sentiment-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const selected = btn.getAttribute('data-sentiment');
      if (currentWordSentiment === selected) {
        currentWordSentiment = null;
        btn.classList.remove('active');
      } else {
        document.querySelectorAll('#study-sentiment-group .sentiment-btn').forEach(b => b.classList.remove('active'));
        currentWordSentiment = selected;
        btn.classList.add('active');
      }
      saveActiveWordFromUI(false); // Local save only
    });
  });

  // Dedicated Save to Cloud button click listener
  document.getElementById('study-save-btn').addEventListener('click', () => {
    saveActiveWordFromUI(true); // Force cloud sync
    showToast(`Saved and synced to cloud!`);
  });

  // Autocomplete Tag Input logic
  const tagsInput = document.getElementById('study-tags-input');
  const tagsAutocomplete = document.getElementById('study-tags-autocomplete');

  function renderAutocomplete(query) {
    query = query.toLowerCase().trim();
    if (!query) {
      tagsAutocomplete.style.display = 'none';
      return;
    }

    // Find matches that aren't already added to the word
    const matches = activeTags.filter(t => t.includes(query) && !currentWordTags.includes(t));
    
    let html = '';
    const hasExactMatch = activeTags.includes(query) || currentWordTags.includes(query);
    
    if (!hasExactMatch) {
      html += `<div class="tags-autocomplete-item create-new" data-tag="${query}">+ Create "${query}"</div>`;
    }

    if (matches.length > 0) {
      matches.forEach(m => {
        html += `<div class="tags-autocomplete-item" data-tag="${m}">${m}</div>`;
      });
    }

    if (html) {
      tagsAutocomplete.innerHTML = html;
      tagsAutocomplete.style.display = 'block';
      
      // Bind click on items
      tagsAutocomplete.querySelectorAll('.tags-autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const selectedTag = item.getAttribute('data-tag');
          addWordTag(selectedTag);
          tagsInput.value = '';
          tagsAutocomplete.style.display = 'none';
          tagsInput.focus();
        });
      });
    } else {
      tagsAutocomplete.style.display = 'none';
    }
  }

  tagsInput.addEventListener('input', (e) => {
    renderAutocomplete(e.target.value);
  });

  tagsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = tagsInput.value.trim().toLowerCase();
      if (val) {
        addWordTag(val);
        tagsInput.value = '';
        tagsAutocomplete.style.display = 'none';
      }
    } else if (e.key === 'Backspace' && tagsInput.value === '') {
      if (currentWordTags.length > 0) {
        currentWordTags.pop();
        renderStudyTagsList();
        saveActiveWordFromUI(false);
      }
    }
  });

  // Close autocomplete on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tags-input-container')) {
      tagsAutocomplete.style.display = 'none';
    }
  });
  
  // Modal Close/Cancel events
  document.getElementById('modal-close-btn').addEventListener('click', closeEditModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') {
      closeEditModal();
    }
  });

  // Modal Sentiment toggles
  document.querySelectorAll('#modal-sentiment-group .sentiment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-sentiment');
      if (modalWordSentiment === selected) {
        modalWordSentiment = null;
        btn.classList.remove('active');
      } else {
        document.querySelectorAll('#modal-sentiment-group .sentiment-btn').forEach(b => b.classList.remove('active'));
        modalWordSentiment = selected;
        btn.classList.add('active');
      }
    });
  });

  // Modal Autocomplete Tag logic
  const modalTagsInput = document.getElementById('modal-tags-input');
  const modalTagsAutocomplete = document.getElementById('modal-tags-autocomplete');

  function renderModalAutocomplete(query) {
    query = query.toLowerCase().trim();
    if (!query) {
      modalTagsAutocomplete.style.display = 'none';
      return;
    }

    const matches = activeTags.filter(t => t.includes(query) && !modalWordTags.includes(t));
    let html = '';
    const hasExactMatch = activeTags.includes(query) || modalWordTags.includes(query);
    
    if (!hasExactMatch) {
      html += `<div class="tags-autocomplete-item create-new" data-tag="${query}">+ Create "${query}"</div>`;
    }

    if (matches.length > 0) {
      matches.forEach(m => {
        html += `<div class="tags-autocomplete-item" data-tag="${m}">${m}</div>`;
      });
    }

    if (html) {
      modalTagsAutocomplete.innerHTML = html;
      modalTagsAutocomplete.style.display = 'block';
      
      modalTagsAutocomplete.querySelectorAll('.tags-autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
          const selectedTag = item.getAttribute('data-tag');
          addModalWordTag(selectedTag);
          modalTagsInput.value = '';
          modalTagsAutocomplete.style.display = 'none';
          modalTagsInput.focus();
        });
      });
    } else {
      modalTagsAutocomplete.style.display = 'none';
    }
  }

  modalTagsInput.addEventListener('input', (e) => {
    renderModalAutocomplete(e.target.value);
  });

  modalTagsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = modalTagsInput.value.trim().toLowerCase();
      if (val) {
        addModalWordTag(val);
        modalTagsInput.value = '';
        modalTagsAutocomplete.style.display = 'none';
      }
    } else if (e.key === 'Backspace' && modalTagsInput.value === '') {
      if (modalWordTags.length > 0) {
        modalWordTags.pop();
        renderModalTagsList();
      }
    }
  });

  // Modal Save Changes event
  document.getElementById('modal-save-btn').addEventListener('click', () => {
    if (!modalWord) return;
    const meaning = document.getElementById('modal-meaning').value;
    const synonyms = document.getElementById('modal-synonyms').value;
    
    // Save to userProgress and cloud
    saveWordProgress(modalWord, meaning, synonyms, modalWordTags, modalWordSentiment, true);
    
    // Update local state if the currently displayed study card is this word
    if (state.study.filteredWords.length > 0) {
      const currentStudyWord = state.study.filteredWords[state.study.currentIndex];
      if (currentStudyWord && currentStudyWord.word.toLowerCase() === modalWord.toLowerCase()) {
        renderStudyWord();
      }
    }

    renderExcelGrid();
    closeEditModal();
    showToast(`Saved changes for: "${modalWord}"`);
  });

  // Make removeWordTag and removeModalWordTag globally accessible for inline onclick handlers
  window.removeWordTag = removeWordTag;
  window.removeModalWordTag = removeModalWordTag;

  // Render initial view
  showView('study');
});
