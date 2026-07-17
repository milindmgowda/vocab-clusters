// State Management and Interactive Logic for Vocab Study App

// --- Initialization & Globals ---
let allWords = [];
let userProgress = {};

// Application state
const state = {
  currentView: 'study',
  // Study mode state
  study: {
    filteredWords: [],
    currentIndex: 0,
    groupFilter: 'All',
    statusFilter: 'All',
    searchQuery: ''
  },
  // Excel mode state
  excel: {
    filteredWords: [],
    groupFilter: 'All',
    statusFilter: 'All',
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
      userProgress = JSON.parse(savedProgress);
    } catch (e) {
      console.error('Failed to parse progress data', e);
      userProgress = {};
    }
  }

  updateProgressSummary();
  
  // Attempt to sync from cloud (Vercel KV)
  loadCloudProgress();
}

function updateProgressSummary() {
  let definedCount = 0;
  allWords.forEach(w => {
    const progress = userProgress[w.word];
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
      // Merge cloud data with local data
      const mergedProgress = { ...userProgress, ...resData.data };
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

function saveWordProgress(word, meaning, synonyms, shouldSync = false) {
  if (!word) return;

  meaning = meaning.trim();
  synonyms = synonyms.trim();

  const prevProg = userProgress[word];
  const hasChanged = !prevProg || prevProg.meaning !== meaning || prevProg.synonyms !== synonyms;

  if (!meaning && !synonyms) {
    delete userProgress[word];
  } else {
    userProgress[word] = { meaning, synonyms };
  }

  localStorage.setItem('vocab_study_progress', JSON.stringify(userProgress));
  updateProgressSummary();
  
  if (shouldSync && hasChanged) {
    triggerCloudSync();
  }
}

// --- View Router ---
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
  }
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const viewName = btn.getAttribute('data-view');
    // Save current active word progress before leaving study view
    if (state.currentView === 'study') {
      saveActiveWordFromUI(true);
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
    const progress = userProgress[w.word];
    const hasData = progress && (progress.meaning || progress.synonyms);
    if (state.study.statusFilter === 'Defined' && !hasData) return false;
    if (state.study.statusFilter === 'Undefined' && hasData) return false;
    
    // Search query
    if (query) {
      const matchWord = w.word.toLowerCase().includes(query);
      const matchMeaning = progress && progress.meaning.toLowerCase().includes(query);
      const matchSynonyms = progress && progress.synonyms.toLowerCase().includes(query);
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
  saveWordProgress(currentWordObj.word, meaning, synonyms, shouldSync);
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
    document.getElementById('study-meaning').disabled = true;
    document.getElementById('study-synonyms').disabled = true;
    return;
  }

  document.getElementById('study-meaning').disabled = false;
  document.getElementById('study-synonyms').disabled = false;

  const wordObj = state.study.filteredWords[state.study.currentIndex];
  const progress = userProgress[wordObj.word] || { meaning: '', synonyms: '' };

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

  // Add click listeners to card buttons
  document.getElementById('study-random-btn').addEventListener('click', jumpToRandomWord);
  document.getElementById('study-prev-btn').addEventListener('click', prevWord);
  document.getElementById('study-next-btn').addEventListener('click', nextWord);
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
    const progress = userProgress[currentWordObj.word] || { meaning: '', synonyms: '' };
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
  applyStudyFilters();
});

document.getElementById('study-status-filter').addEventListener('change', (e) => {
  saveActiveWordFromUI(true);
  state.study.statusFilter = e.target.value;
  state.study.currentIndex = 0;
  applyStudyFilters();
});

document.getElementById('study-search-input').addEventListener('input', (e) => {
  saveActiveWordFromUI(false); // Typing in search should not trigger cloud sync
  state.study.searchQuery = e.target.value;
  state.study.currentIndex = 0;
  applyStudyFilters();
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
    const progress = userProgress[w.word];
    const hasData = progress && (progress.meaning || progress.synonyms);
    if (state.excel.statusFilter === 'Defined' && !hasData) return false;
    if (state.excel.statusFilter === 'Undefined' && hasData) return false;
    
    // Search query
    if (query) {
      const matchWord = w.word.toLowerCase().includes(query);
      const matchMeaning = progress && progress.meaning.toLowerCase().includes(query);
      const matchSynonyms = progress && progress.synonyms.toLowerCase().includes(query);
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
      valA = (userProgress[a.word]?.meaning || '').toLowerCase();
      valB = (userProgress[b.word]?.meaning || '').toLowerCase();
    } else if (field === 'synonyms') {
      valA = (userProgress[a.word]?.synonyms || '').toLowerCase();
      valB = (userProgress[b.word]?.synonyms || '').toLowerCase();
    } else if (field === 'status') {
      const aHas = userProgress[a.word] && (userProgress[a.word].meaning || userProgress[a.word].synonyms);
      const bHas = userProgress[b.word] && (userProgress[b.word].meaning || userProgress[b.word].synonyms);
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
        <td colspan="6" class="empty-state">
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
    const prog = userProgress[w.word];
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
    const selProg = userProgress[selWord];
    // Synonyms listed by the selected word
    const selWordSynonyms = selProg ? selProg.synonyms.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    
    state.excel.filteredWords.forEach(w => {
      const wLower = w.word.toLowerCase();
      
      // Match 1: This word is directly in the selected word's synonyms list
      const isListedAsSynonym = selWordSynonyms.includes(wLower);
      
      // Match 2: The selected word is listed in this word's synonyms list
      const listsSelWordAsSynonym = synonymMapping[w.word].includes(selLower);
      
      if ((isListedAsSynonym || listsSelWordAsSynonym) && wLower !== selLower) {
        matches.add(w.word);
      }
    });
  }

  let htmlRows = '';
  state.excel.filteredWords.forEach(w => {
    const prog = userProgress[w.word] || { meaning: '', synonyms: '' };
    const hasProgress = prog.meaning || prog.synonyms;
    
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

    htmlRows += `
      <tr class="${rowClass}" data-row-word="${w.word}">
        <td class="excel-word-cell" data-word="${w.word}" data-label="Word">${w.word}</td>
        <td style="font-family: var(--font-mono);" data-label="Group">${w.group}</td>
        ${meaningCell}
        <td data-label="Synonyms">${synonymCellContent}</td>
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
      jumpToEditWord(clickedWord);
    });
  });
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
    const prog = userProgress[word];
    const wordSynonyms = prog ? prog.synonyms.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    
    showToast(`Selected "${word}". Click again to reveal meaning. Synonyms highlighted!`);
    renderExcelGrid();
  }
}

function jumpToEditWord(word) {
  // Find index in the study list of all words
  const studyIndex = state.study.filteredWords.findIndex(w => w.word === word);
  
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
    
    const index = state.study.filteredWords.findIndex(w => w.word === word);
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
  state.excel.selectedWord = null; // Clear active synonym highlight on filter change
  applyExcelFilters();
});

document.getElementById('excel-status-filter').addEventListener('change', (e) => {
  state.excel.statusFilter = e.target.value;
  state.excel.selectedWord = null;
  applyExcelFilters();
});

document.getElementById('excel-search-input').addEventListener('input', (e) => {
  state.excel.searchQuery = e.target.value;
  state.excel.selectedWord = null;
  applyExcelFilters();
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
      
      // Merge progress
      userProgress = { ...userProgress, ...importedData };
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

// --- App Load Event ---
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadData();
  
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

  // Render initial view
  showView('study');
});
