// Background Service Worker

// 1. Enable Side Panel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));



// 4. Listen for messages from Content Script or Sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SAVE_VIDEO") {
    (async () => {
      try {
        await saveVideoToStorage(message.data);
        await flashBadge();
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error saving video:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// Helper: Save video details to chrome.storage.sync
async function saveVideoToStorage(data) {
  const { videoId, title, currentTime, channelTitle } = data;
  if (!videoId || currentTime === undefined) {
    throw new Error("Invalid video data: videoId and currentTime are required.");
  }

  const storageData = await chrome.storage.sync.get("savedVideos");
  const savedVideos = migrateSavedVideos(storageData.savedVideos || []);
  
  const timeStr = currentTime.toFixed(2).replace(".", "-");
  const newEntryId = `ytv-${videoId}-${timeStr}-${Date.now()}`;
  
  let videoGroup = savedVideos.find(g => g.videoId === videoId);
  if (!videoGroup) {
    videoGroup = {
      videoId,
      title: title || "YouTube Video",
      channelTitle: channelTitle || "Unknown Channel",
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
      timestamps: []
    };
    savedVideos.push(videoGroup);
  }

  // Update metadata in case title or channel name has changed
  if (title) videoGroup.title = title;
  if (channelTitle) videoGroup.channelTitle = channelTitle;
  
  // Add timestamp if not exists
  if (!videoGroup.timestamps.some(t => t.id === newEntryId)) {
    videoGroup.timestamps.push({
      id: newEntryId,
      timestamp: currentTime,
      savedAt: Date.now(),
      notes: ""
    });
  }
  
  await chrome.storage.sync.set({ savedVideos });
  
  // Broadcast update to the sidepanel if it is currently open
  chrome.runtime.sendMessage({ action: "REFRESH_SAVED_VIDEOS" }).catch(() => {
    // Ignore: side panel is probably closed
  });
}

// Helper: Flash success badge on extension icon
async function flashBadge() {
  try {
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#10b981" }); // emerald-500
    setTimeout(async () => {
      await chrome.action.setBadgeText({ text: "" });
    }, 1500);
  } catch (error) {
    console.error("Error flashing badge:", error);
  }
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
