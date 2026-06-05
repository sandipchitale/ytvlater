// Sidepanel Logic for YTVLater

// Global visual error logger for robustness and debugging
window.onerror = function(message, source, lineno, colno, error) {
  const errDiv = document.createElement("div");
  errDiv.id = "ytv-runtime-error-banner";
  errDiv.className = "bg-red-650 text-white text-xs p-3 font-mono fixed top-0 left-0 w-full z-50 shadow-lg border-b border-red-800 break-all";
  errDiv.innerHTML = `
    <div class="font-bold mb-1">⚠️ Extension Runtime Error:</div>
    <div>${message}</div>
    <div class="text-[10px] text-red-200 mt-1">${source}:${lineno}:${colno}</div>
  `;
  document.body.appendChild(errDiv);
  return false;
};

// Cache DOM elements
const searchInput = document.getElementById("ytv-search-input");
const searchClear = document.getElementById("ytv-search-clear");
const totalBadge = document.getElementById("ytv-total-badge");
const videosList = document.getElementById("ytv-videos-list");
const emptyState = document.getElementById("ytv-empty-state");
const loadingSkeleton = document.getElementById("ytv-loading-skeleton");

// Sorting Buttons
const sortBtnNewest = document.getElementById("ytv-sort-btn-newest");
const sortBtnOldest = document.getElementById("ytv-sort-btn-oldest");
const sortBtnAZ = document.getElementById("ytv-sort-btn-az");
const sortBtnZA = document.getElementById("ytv-sort-btn-za");

// Import/Export actions
const importBtn = document.getElementById("ytv-import-btn");
const importFile = document.getElementById("ytv-import-file");
const exportBtn = document.getElementById("ytv-export-btn");

// Theme Buttons
const themeBtnAuto = document.getElementById("ytv-theme-btn-auto");
const themeBtnLight = document.getElementById("ytv-theme-btn-light");
const themeBtnDark = document.getElementById("ytv-theme-btn-dark");

// State Variables
let savedVideosState = [];
let currentSort = "newest"; // "newest", "oldest", "az", "za"
let searchQuery = "";
let currentTheme = "auto"; // "auto", "light", "dark"

// Initialize
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

async function init() {
  setupEventListeners();
  await loadTheme();
  await loadAndRenderVideos();
  // Render the local cache instantly above, then quietly pull the latest state
  // from YouTube so bookmarks saved on other computers show up automatically.
  autoSyncFromYouTube();
}

// Silent, non-destructive pull from YouTube (the source of truth). There are no
// sync buttons: this runs automatically on open and whenever the panel regains
// focus. It never shows an alert — it's expected to be a no-op when offline or
// not logged in. The UI refreshes via the REFRESH_SAVED_VIDEOS broadcast.
let autoSyncInFlight = false;
async function autoSyncFromYouTube() {
  if (autoSyncInFlight) return;
  autoSyncInFlight = true;
  if (loadingSkeleton) loadingSkeleton.classList.remove("hidden");
  try {
    await chrome.runtime.sendMessage({ action: "AUTO_SYNC_FROM_YOUTUBE" });
  } catch (err) {
    console.warn("Auto-sync skipped:", err.message);
  } finally {
    autoSyncInFlight = false;
    if (loadingSkeleton) loadingSkeleton.classList.add("hidden");
  }
}

function setupEventListeners() {
  // Search interactions
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    if (searchQuery) {
      searchClear.classList.remove("hidden");
    } else {
      searchClear.classList.add("hidden");
    }
    renderVideos();
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchQuery = "";
    searchClear.classList.add("hidden");
    renderVideos();
    searchInput.focus();
  });

  // Sort interactions
  sortBtnNewest.addEventListener("click", () => setSort("newest"));
  sortBtnOldest.addEventListener("click", () => setSort("oldest"));
  sortBtnAZ.addEventListener("click", () => setSort("az"));
  sortBtnZA.addEventListener("click", () => setSort("za"));

  // Storage updates listener (fires when background/content script saves item)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "REFRESH_SAVED_VIDEOS") {
      loadAndRenderVideos();
    }
  });

  // Re-pull from YouTube whenever the panel becomes visible again (replaces the
  // old manual "Sync FROM YouTube" button).
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") autoSyncFromYouTube();
  });

  // Export
  exportBtn.addEventListener("click", exportBackup);

  // Import
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", importBackup);

  // Theme interactions
  if (themeBtnAuto) themeBtnAuto.addEventListener("click", () => changeTheme("auto"));
  if (themeBtnLight) themeBtnLight.addEventListener("click", () => changeTheme("light"));
  if (themeBtnDark) themeBtnDark.addEventListener("click", () => changeTheme("dark"));

  // System theme preference listener
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentTheme === "auto") {
      applyThemeClass();
    }
  });
}

// Load and apply theme preference
async function loadTheme() {
  try {
    const { themePreference = "auto" } = await chrome.storage.local.get("themePreference");
    setTheme(themePreference);
  } catch (error) {
    console.error("Failed to load theme preference:", error);
    setTheme("auto");
  }
}

// Set theme preference
function setTheme(theme) {
  currentTheme = theme;
  
  const buttons = [themeBtnAuto, themeBtnLight, themeBtnDark];
  const activeClass = "px-2.5 py-1 text-[11px] rounded-md font-semibold bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 transition-all focus:outline-none";
  const inactiveClass = "px-2.5 py-1 text-[11px] rounded-md font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-all focus:outline-none";
  
  buttons.forEach(btn => {
    if (btn) btn.className = inactiveClass;
  });

  let activeBtn;
  if (theme === "auto") activeBtn = themeBtnAuto;
  else if (theme === "light") activeBtn = themeBtnLight;
  else if (theme === "dark") activeBtn = themeBtnDark;

  if (activeBtn) {
    activeBtn.className = activeClass;
  }
  
  applyThemeClass();
}

// Change theme preference and save to storage
function changeTheme(theme) {
  setTheme(theme);
  chrome.storage.local.set({ themePreference: theme }).catch(err => {
    console.error("Failed to save theme preference:", err);
  });
}

// Apply dark class to document element based on state
function applyThemeClass() {
  const html = document.documentElement;
  
  if (currentTheme === "dark") {
    html.classList.add("dark");
  } else if (currentTheme === "light") {
    html.classList.remove("dark");
  } else {
    // Auto mode
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (systemPrefersDark) {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }
}

// Set active sort filter
function setSort(type) {
  currentSort = type;
  
  const buttons = [sortBtnNewest, sortBtnOldest, sortBtnAZ, sortBtnZA];
  const activeClass = "px-2.5 py-1 text-[11px] rounded-md font-semibold bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 transition-all focus:outline-none";
  const inactiveClass = "px-2.5 py-1 text-[11px] rounded-md font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-all focus:outline-none";
  
  buttons.forEach(btn => {
    if (btn) btn.className = inactiveClass;
  });

  let activeBtn;
  if (type === "newest") activeBtn = sortBtnNewest;
  else if (type === "oldest") activeBtn = sortBtnOldest;
  else if (type === "az") activeBtn = sortBtnAZ;
  else if (type === "za") activeBtn = sortBtnZA;

  if (activeBtn) {
    activeBtn.className = activeClass;
  }

  renderVideos();
}

// Load videos from local storage and render
async function loadAndRenderVideos() {
  if (loadingSkeleton) loadingSkeleton.classList.remove("hidden");
  
  try {
    const { savedVideos = [] } = await chrome.storage.local.get("savedVideos");
    savedVideosState = migrateSavedVideos(savedVideos);
    renderVideos();
  } catch (error) {
    console.error("Failed to load saved videos:", error);
  } finally {
    if (loadingSkeleton) loadingSkeleton.classList.add("hidden");
  }
}

// Sort and Filter based on state, grouped by videoId
function getProcessedVideos() {
  // Deep copy group structure to avoid side effects during UI sorts
  let groupList = savedVideosState.map(group => {
    return {
      videoId: group.videoId,
      title: group.title,
      channelTitle: group.channelTitle,
      thumbnailUrl: group.thumbnailUrl,
      timestamps: [...(group.timestamps || [])]
    };
  });

  // Filter out empty video groups
  groupList = groupList.filter(group => group.timestamps.length > 0);

  // Sort timestamps inside each video group (ascending by timestamp playhead)
  groupList.forEach(group => {
    group.timestamps.sort((a, b) => a.timestamp - b.timestamp);
  });

  // 1. Apply Search Filter
  if (searchQuery) {
    groupList = groupList.filter(group => {
      const matchesMeta = group.title.toLowerCase().includes(searchQuery) ||
                          group.channelTitle.toLowerCase().includes(searchQuery);
                          
      const matchesNotes = group.timestamps.some(t => 
        t.notes && t.notes.toLowerCase().includes(searchQuery)
      );
      
      return matchesMeta || matchesNotes;
    });
  }

  // 2. Apply Sort to Groups
  if (currentSort === "newest") {
    groupList.sort((a, b) => {
      const maxA = Math.max(...a.timestamps.map(t => Number(t.savedAt) || 0));
      const maxB = Math.max(...b.timestamps.map(t => Number(t.savedAt) || 0));
      return maxB - maxA;
    });
  } else if (currentSort === "oldest") {
    groupList.sort((a, b) => {
      const minA = Math.min(...a.timestamps.map(t => Number(t.savedAt) || Infinity));
      const minB = Math.min(...b.timestamps.map(t => Number(t.savedAt) || Infinity));
      return minA - minB;
    });
  } else if (currentSort === "az") {
    groupList.sort((a, b) => a.title.localeCompare(b.title));
  } else if (currentSort === "za") {
    groupList.sort((a, b) => b.title.localeCompare(a.title));
  }

  return groupList;
}

// Build DOM elements and render
function renderVideos() {
  const processedGroups = getProcessedVideos();
  
  // Clear dynamic content
  const dynamicCards = videosList.querySelectorAll(".ytv-card");
  dynamicCards.forEach(card => card.remove());

  // Update counter badge: e.g. "2 videos"
  totalBadge.innerText = `${processedGroups.length} video${processedGroups.length !== 1 ? 's' : ''}`;

  if (processedGroups.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  
  emptyState.classList.add("hidden");

  // Generate and insert cards
  processedGroups.forEach(group => {
    const card = document.createElement("div");
    card.className = "ytv-card group bg-white border border-slate-200 hover:border-slate-350 hover:bg-slate-50/50 rounded-xl overflow-hidden shadow-md flex flex-col p-3.5 space-y-3 dark:bg-slate-900/40 dark:border-slate-900 dark:hover:border-slate-850 dark:hover:bg-slate-900/60 dark:shadow-lg transition-all";
    card.dataset.videoId = group.videoId;

    card.innerHTML = `
      <div class="flex space-x-3 items-start pb-2 border-b border-slate-100 dark:border-slate-900/60">
        <!-- Thumbnail Container -->
        <div class="w-24 h-14 relative flex-shrink-0 cursor-pointer overflow-hidden rounded-lg bg-slate-950 border border-slate-100 dark:border-slate-900 group-hover:border-slate-200 dark:group-hover:border-slate-800 transition-colors ytv-play-group-btn">
          <img src="${group.thumbnailUrl}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" alt="thumbnail" loading="lazy">
          <!-- Play overlay -->
          <div class="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
            <svg class="w-5 h-5 text-rose-500 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
        
        <!-- Title & Channel Info -->
        <div class="flex-1 min-w-0 flex flex-col justify-between h-14">
          <h3 class="text-xs font-semibold leading-snug line-clamp-2 text-slate-800 hover:text-rose-600 dark:text-slate-200 dark:hover:text-rose-450 transition-colors cursor-pointer ytv-play-group-btn" title="${escapeHtml(group.title)}">
            ${escapeHtml(group.title)}
          </h3>
          <div class="text-[10px] text-slate-550 dark:text-slate-400">
            <span class="truncate block max-w-[150px]" title="${escapeHtml(group.channelTitle)}">
              ${escapeHtml(group.channelTitle)}
            </span>
          </div>
        </div>
        
        <!-- Delete Entire Video (Group) -->
        <button class="p-1 text-slate-400 hover:text-rose-500 dark:text-slate-500 dark:hover:text-rose-555 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 ytv-delete-group-btn" aria-label="Delete Entire Video">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      
      <!-- Timestamps List -->
      <div class="space-y-2.5">
        ${group.timestamps.map(t => `
          <div class="ytv-timestamp-row flex flex-col space-y-1.5 p-1.5 rounded-lg hover:bg-slate-100/60 dark:hover:bg-slate-900/30 transition-colors" data-id="${t.id}">
            <div class="flex items-center justify-between gap-2">
              <!-- Time Link Pill -->
              <button class="ytv-seek-btn px-2 py-0.5 bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-850 dark:text-slate-350 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 font-mono text-[11px] rounded font-semibold transition-colors flex-shrink-0">
                ${formatDuration(t.timestamp)}
              </button>
              
              <!-- Note Content -->
              <div class="flex-1 text-[11px] text-slate-500 hover:text-slate-755 dark:text-slate-400 dark:hover:text-slate-300 italic cursor-pointer ytv-edit-notes-toggle line-clamp-1 font-medium transition-colors" title="${t.notes ? escapeHtml(t.notes) : 'Add note'}" id="notes-text-${t.id}">
                ${t.notes ? escapeHtml(t.notes) : '<span class="text-slate-400 hover:text-slate-500 dark:text-slate-650 dark:hover:text-slate-550 font-normal">Add a custom note...</span>'}
              </div>
              
              <!-- Timestamp Actions -->
              <div class="flex items-center space-x-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                <button class="p-0.5 text-slate-400 hover:text-rose-600 rounded dark:text-slate-500 dark:hover:text-rose-450 ytv-edit-notes-toggle" aria-label="Edit Note">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
                </button>
                <button class="p-0.5 text-slate-400 hover:text-rose-500 rounded dark:text-slate-500 dark:hover:text-rose-555 ytv-delete-btn" aria-label="Delete Timestamp">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            
            <!-- Notes Editor Box -->
            <div class="hidden flex flex-col gap-1.5 mt-1 px-1" id="notes-editor-${t.id}">
              <textarea class="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-rose-500 dark:bg-slate-950 dark:border-slate-850 dark:text-slate-200 dark:placeholder-slate-600" placeholder="Type custom notes..." rows="2">${escapeHtml(t.notes || '')}</textarea>
              <div class="flex justify-end space-x-1.5">
                <button class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-semibold rounded-md transition-colors dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 ytv-cancel-notes-btn">Cancel</button>
                <button class="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold rounded-md transition-colors ytv-save-notes-btn font-medium">Save</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Hook up Card events
    
    // 1. Play Video from first playhead when clicking main banner/thumbnail
    const playGroupTargets = card.querySelectorAll(".ytv-play-group-btn");
    playGroupTargets.forEach(target => {
      target.addEventListener("click", () => {
        if (group.timestamps.length > 0) {
          playSavedVideo({ videoId: group.videoId, timestamp: group.timestamps[0].timestamp });
        }
      });
    });

    // 2. Hook events per individual timestamp row
    group.timestamps.forEach(t => {
      const row = card.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
      if (!row) return;

      // Seek playhead when clicking time link button
      const seekBtn = row.querySelector(".ytv-seek-btn");
      if (seekBtn) {
        seekBtn.addEventListener("click", () => {
          playSavedVideo({ videoId: group.videoId, timestamp: t.timestamp });
        });
      }

      // Toggle Notes Editor
      const editToggles = row.querySelectorAll(".ytv-edit-notes-toggle");
      const editor = row.querySelector(`#notes-editor-${CSS.escape(t.id)}`);
      
      editToggles.forEach(toggle => {
        toggle.addEventListener("click", (e) => {
          e.stopPropagation();
          if (editor) {
            editor.classList.toggle("hidden");
            if (!editor.classList.contains("hidden")) {
              editor.querySelector("textarea").focus();
            }
          }
        });
      });

      // Cancel edit notes
      const cancelBtn = row.querySelector(".ytv-cancel-notes-btn");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          if (editor) {
            editor.classList.add("hidden");
            editor.querySelector("textarea").value = t.notes || ""; // revert
          }
        });
      }

      // Save edited notes
      const saveBtn = row.querySelector(".ytv-save-notes-btn");
      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          if (editor) {
            const newNotes = editor.querySelector("textarea").value.trim();
            editor.classList.add("hidden");
            await updateVideoNotes(t.id, newNotes);
          }
        });
      }

      // Delete specific timestamp
      const deleteBtn = row.querySelector(".ytv-delete-btn");
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          
          // Animate row removal
          row.style.opacity = "0";
          row.style.transform = "scale(0.95)";
          row.style.transition = "all 0.25s ease";
          
          setTimeout(async () => {
            await deleteVideo(t.id);
          }, 250);
        });
      }
    });

    // 3. Delete entire video group
    const deleteGroupBtn = card.querySelector(".ytv-delete-group-btn");
    if (deleteGroupBtn) {
      deleteGroupBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        
        // Animate card removal
        card.style.opacity = "0";
        card.style.transform = "scale(0.95)";
        card.style.transition = "all 0.25s ease";
        
        setTimeout(async () => {
          await deleteVideoGroup(group.videoId);
        }, 250);
      });
    }

    videosList.appendChild(card);
  });
}

// Seek video in active tab, or navigate
async function playSavedVideo(item) {
  const watchUrl = `https://www.youtube.com/watch?v=${item.videoId}&t=${Math.floor(item.timestamp)}s`;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url && tab.url.includes("youtube.com/watch")) {
      const urlObj = new URL(tab.url);
      const tabVideoId = urlObj.searchParams.get("v");
      
      if (tabVideoId === item.videoId) {
        // Same video! Try directly seeking via page messaging
        const response = await chrome.tabs.sendMessage(tab.id, { 
          action: "SEEK_TO_TIMESTAMP", 
          timestamp: item.timestamp 
        });
        if (response && response.success) {
          return;
        }
      }
    }
    
    // Fallback: If not on watch page or direct messaging fails, update tab URL
    if (tab && tab.id) {
      await chrome.tabs.update(tab.id, { url: watchUrl });
    } else {
      await chrome.tabs.create({ url: watchUrl });
    }
  } catch (error) {
    console.warn("Error targeting current tab, opening watch link:", error);
    await chrome.tabs.create({ url: watchUrl });
  }
}

// Update specific video notes in storage
async function updateVideoNotes(id, newNotes) {
  let targetGroup = null;
  let videoId = "";
  let changed = false;
  
  savedVideosState.forEach(group => {
    if (group.timestamps) {
      const t = group.timestamps.find(x => x.id === id);
      if (t) {
        t.notes = newNotes;
        targetGroup = group;
        videoId = group.videoId;
        changed = true;
      }
    }
  });

  if (changed) {
    await chrome.storage.local.set({ savedVideos: savedVideosState });
    renderVideos();
    
    // Dispatch sharded playlist update
    chrome.runtime.sendMessage({
      action: "UPDATE_VIDEO",
      videoId: videoId,
      updatedGroup: targetGroup
    });
  }
}

// Delete video from storage
async function deleteVideo(id) {
  let targetGroup = null;
  let videoId = "";
  let changed = false;
  
  savedVideosState.forEach(group => {
    if (group.timestamps) {
      const index = group.timestamps.findIndex(x => x.id === id);
      if (index !== -1) {
        group.timestamps.splice(index, 1);
        targetGroup = group;
        videoId = group.videoId;
        changed = true;
      }
    }
  });

  if (changed) {
    savedVideosState = savedVideosState.filter(group => group.timestamps && group.timestamps.length > 0);
    await chrome.storage.local.set({ savedVideos: savedVideosState });
    renderVideos();
    
    // Dispatch sharded playlist update
    chrome.runtime.sendMessage({
      action: "UPDATE_VIDEO",
      videoId: videoId,
      updatedGroup: targetGroup && targetGroup.timestamps.length > 0 ? targetGroup : null
    });
  }
}

// Delete all timestamps of a specific videoId from storage
async function deleteVideoGroup(videoId) {
  const originalLength = savedVideosState.length;
  savedVideosState = savedVideosState.filter(group => group.videoId !== videoId);
  if (savedVideosState.length !== originalLength) {
    await chrome.storage.local.set({ savedVideos: savedVideosState });
    renderVideos();
    
    // Dispatch sharded playlist update (null triggers removal from partitions)
    chrome.runtime.sendMessage({
      action: "UPDATE_VIDEO",
      videoId: videoId,
      updatedGroup: null
    });
  }
}

// Backup & Restore
function exportBackup() {
  const totalMoments = savedVideosState.reduce(
    (acc, group) => acc + (group.timestamps || []).length,
    0
  );
  if (totalMoments === 0) {
    alert("No saved videos to export!");
    return;
  }
  
  const blob = new Blob([JSON.stringify(savedVideosState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `ytvlater-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function importBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      const importedGrouped = migrateSavedVideos(data);
      
      const merged = [...savedVideosState];
      importedGrouped.forEach(impGroup => {
        const existingGroup = merged.find(g => g.videoId === impGroup.videoId);
        if (!existingGroup) {
          merged.push(impGroup);
        } else {
          impGroup.timestamps.forEach(impTime => {
            if (!existingGroup.timestamps.some(t => t.id === impTime.id)) {
              existingGroup.timestamps.push(impTime);
            }
          });
        }
      });

      await chrome.storage.local.set({ savedVideos: merged });
      savedVideosState = merged;
      renderVideos();
      
      // Update YouTube sharded playlists in background
      for (const group of merged) {
        chrome.runtime.sendMessage({
          action: "UPDATE_VIDEO",
          videoId: group.videoId,
          updatedGroup: group
        });
      }
      
      const importedMomentsCount = importedGrouped.reduce(
        (acc, group) => acc + (group.timestamps || []).length,
        0
      );
      alert(`Imported ${importedMomentsCount} items successfully!`);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      importFile.value = "";
    }
  };
  reader.readAsText(file);
}

// Format seconds into MM:SS or HH:MM:SS (defensive wrapper)
function formatDuration(seconds) {
  if (seconds === undefined || seconds === null || isNaN(seconds)) return "00:00";
  const numSeconds = Number(seconds);
  const h = Math.floor(numSeconds / 3600);
  const m = Math.floor((numSeconds % 3600) / 60);
  const s = Math.floor(numSeconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Format relative date (time-ago) (defensive wrapper)
function formatTimeAgo(timestamp) {
  if (!timestamp) return "Unknown date";
  const numTimestamp = Number(timestamp);
  if (isNaN(numTimestamp)) return "Unknown date";
  
  const diff = Date.now() - numTimestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  
  if (isNaN(mins)) return "Unknown date";
  
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  
  const dateObj = new Date(numTimestamp);
  if (isNaN(dateObj.getTime())) return "Unknown date";
  
  return dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Simple HTML escaping helper for safety
function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper: Migrate saved videos from legacy formats to explicit array of video groups
function migrateSavedVideos(savedVideos) {
  if (Array.isArray(savedVideos)) {
    if (savedVideos.length === 0) return [];
    
    const firstItem = savedVideos[0];
    // If the first item has "videoId" and its "timestamps" is an array, it is the new format!
    if (firstItem && firstItem.videoId && Array.isArray(firstItem.timestamps)) {
      return savedVideos;
    }
    
    // Otherwise, legacy flat array
    const groups = {};
    savedVideos.forEach(item => {
      if (item && item.videoId) {
        if (!groups[item.videoId]) {
          groups[item.videoId] = {
            videoId: item.videoId,
            title: item.title || "YouTube Video",
            channelTitle: item.channelTitle || "Unknown Channel",
            thumbnailUrl: item.thumbnailUrl || `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`,
            timestamps: []
          };
        }
        const tId = item.id || `ytv-${item.videoId}-${(item.timestamp || 0).toFixed(2).replace(".", "-")}-${item.savedAt || Date.now()}`;
        if (!groups[item.videoId].timestamps.some(t => t.id === tId)) {
          groups[item.videoId].timestamps.push({
            id: tId,
            timestamp: item.timestamp !== undefined ? item.timestamp : 0,
            savedAt: item.savedAt || Date.now(),
            notes: item.notes || ""
          });
        }
      }
    });
    return Object.values(groups);
  } else if (savedVideos && typeof savedVideos === "object") {
    const groups = {};
    const keys = Object.keys(savedVideos);
    if (keys.length > 0) {
      const firstItem = savedVideos[keys[0]];
      // VideoId-keyed dictionary format
      if (firstItem && firstItem.timestamps && typeof firstItem.timestamps === "object") {
        keys.forEach(vId => {
          const group = savedVideos[vId];
          groups[vId] = {
            videoId: group.videoId,
            title: group.title,
            channelTitle: group.channelTitle,
            thumbnailUrl: group.thumbnailUrl,
            timestamps: Object.values(group.timestamps || {})
          };
        });
      } else {
        // Flat ID-keyed dictionary format
        keys.forEach(id => {
          const item = savedVideos[id];
          if (item && item.videoId) {
            if (!groups[item.videoId]) {
              groups[item.videoId] = {
                videoId: item.videoId,
                title: item.title || "YouTube Video",
                channelTitle: item.channelTitle || "Unknown Channel",
                thumbnailUrl: item.thumbnailUrl || `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`,
                timestamps: []
              };
            }
            groups[item.videoId].timestamps.push({
              id: id,
              timestamp: item.timestamp !== undefined ? item.timestamp : 0,
              savedAt: item.savedAt || Date.now(),
              notes: item.notes || ""
            });
          }
        });
      }
    }
    return Object.values(groups);
  }
  
  return [];
}
