// Background Service Worker for YTVLater

// 1. Enable Side Panel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

// Queue for serializing write operations to prevent race conditions during updates
let writeQueue = Promise.resolve();

function enqueueWrite(taskFn) {
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue.then(async () => {
      try {
        const res = await taskFn();
        resolve(res);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// 2. Listen for messages from Content Scripts, Sidepanel, or UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "SAVE_VIDEO") {
    enqueueWrite(async () => {
      await saveVideoToStorage(message.data);
      await flashBadge();
    })
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Error saving video:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.action === "UPDATE_VIDEO") {
    enqueueWrite(async () => {
      await updateVideoInStorage(message.videoId, message.updatedGroup);
    })
      .then(() => sendResponse({ success: true }))
      .catch((error) => {
        console.error("Error updating video:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === "SYNC_VIDEOS") {
    (async () => {
      try {
        const data = await syncFromYouTubePlaylists();
        sendResponse({ success: true, data });
      } catch (error) {
        console.error("Error syncing videos:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
});

// Helper: Query the active YouTube tab's content script to invoke InnerTube APIs
async function callYoutubeApi(action, payload) {
  const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
  if (tabs.length === 0) {
    throw new Error("No open YouTube tabs found. YTVLater requires at least one active YouTube tab to query your account.");
  }
  
  // Try sending the request to the first active YouTube tab
  const response = await chrome.tabs.sendMessage(tabs[0].id, {
    action: "YTV_API_CALL",
    apiAction: action,
    payload: payload
  }).catch((err) => {
    console.warn("Failed sending message to YouTube tab:", err);
    return null;
  });
  
  if (!response) {
    throw new Error("Unable to communicate with the YouTube tab. Please refresh your YouTube tab and try again.");
  }
  if (!response.success) {
    throw new Error(response.error || "YouTube API error.");
  }
  return response.data;
}

// Helper: Sync all sharded playlists from YouTube and consolidate
async function syncFromYouTubePlaylists() {
  try {
    const listResponse = await callYoutubeApi("LIST_PLAYLISTS", {});
    const playlists = parsePlaylistsFromBrowse(listResponse);
    let ytvPlaylists = playlists.filter(p => p.title === "ytvlater" || p.title.startsWith("ytvlater-"));
    
    // Get local cache to merge and fallback
    const localData = await chrome.storage.local.get(["ytvPlaylists", "partitionMetadata", "savedVideos"]);
    const cachedPlaylists = localData.ytvPlaylists || [];
    const cachedPartitionMetadata = localData.partitionMetadata || [];
    const cachedSavedVideos = localData.savedVideos || [];

    // Merge fetched playlists with cached playlists to handle YouTube list lag
    const mergedMap = new Map();
    cachedPlaylists.forEach(p => mergedMap.set(p.id, p));
    ytvPlaylists.forEach(p => mergedMap.set(p.id, p));
    const mergedPlaylists = Array.from(mergedMap.values());

    // Cache the merged playlists list
    await chrome.storage.local.set({ ytvPlaylists: mergedPlaylists });

    // Fetch and aggregate metadata from all partitions in parallel
    const metadataPromises = mergedPlaylists.map(playlist => 
      callYoutubeApi("GET_PLAYLIST", { playlistId: playlist.id })
        .then(details => {
          const parsed = parseMetadataFromPlaylistBrowse(details);
          const cachedPart = cachedPartitionMetadata.find(cp => cp.playlistId === playlist.id);
          
          if (parsed) {
            // Check if the fetched metadata from YouTube is older/stale compared to our local cache
            if (cachedPart && (cachedPart.updatedAt || 0) > (parsed.updatedAt || 0)) {
              console.log(`Sync lag check: Fetched metadata for ${playlist.title} is stale (YouTube: ${parsed.updatedAt || 0}, Cache: ${cachedPart.updatedAt || 0}). Using local cache.`);
              return cachedPart;
            }
            
            return {
              playlistId: playlist.id,
              playlistTitle: playlist.title,
              sequence: parsed.sequence,
              createdAt: parsed.createdAt,
              updatedAt: parsed.updatedAt || 0,
              videos: parsed.videos,
              videoSetIds: parseVideoSetIds(details)
            };
          }
          // Fallback: If parse returns null (lag or empty), check local cache
          if (cachedPart) {
            console.log(`Sync fallback: Using cached partition metadata for ${playlist.title}`);
            return cachedPart;
          }
          return {
            playlistId: playlist.id,
            playlistTitle: playlist.title,
            sequence: 1,
            createdAt: 0,
            updatedAt: 0,
            videos: [],
            videoSetIds: {}
          };
        })
        .catch(err => {
          console.error(`Sync error on partition ${playlist.title}:`, err);
          
          // Check if this is a transient communication/network error
          const errMsg = err.message || "";
          const isTransient = errMsg.includes("tab") || 
                              errMsg.includes("timeout") || 
                              errMsg.includes("timed out") || 
                              errMsg.includes("communicate") || 
                              errMsg.includes("fetch") || 
                              errMsg.includes("network");
                              
          if (isTransient) {
            // Fallback to local cache for transient errors
            const cachedPart = cachedPartitionMetadata.find(cp => cp.playlistId === playlist.id);
            if (cachedPart) {
              console.log(`Sync error fallback (transient): Using cached partition metadata for ${playlist.title}`);
              return cachedPart;
            }
            return {
              playlistId: playlist.id,
              playlistTitle: playlist.title,
              sequence: 1,
              createdAt: 0,
              updatedAt: 0,
              videos: [],
              videoSetIds: {}
            };
          } else {
            // Playlist is gone/deleted on YouTube
            console.warn(`Sync partition ${playlist.title} is gone or inaccessible. Removing from cache.`);
            return null; // Return null to signal deletion
          }
        })
    );

    let partitionMetadata = await Promise.all(metadataPromises);
    // Filter out deleted partitions
    partitionMetadata = partitionMetadata.filter(p => p !== null);

    // Filter out deleted playlists from ytvPlaylists list
    const activePlaylistIds = new Set(partitionMetadata.map(p => p.playlistId));
    const cleanYtvPlaylists = mergedPlaylists.filter(p => activePlaylistIds.has(p.id));
    await chrome.storage.local.set({ ytvPlaylists: cleanYtvPlaylists });

    // Sort partitions by sequence and createdAt
    partitionMetadata.sort((a, b) => {
      if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      return a.createdAt - b.createdAt;
    });

    let consolidatedVideos = [];
    for (const part of partitionMetadata) {
      if (part && Array.isArray(part.videos)) {
        consolidatedVideos = mergePlaylistsData(consolidatedVideos, part.videos);
      }
    }

    // Guard: If we retrieved NO videos at all but we have cached savedVideos, and we have active partitions
    // that failed transiently (returning default empty objects instead of null), we preserve the cache.
    // But if all partitions were deleted (partitionMetadata is empty), we allow it to be empty.
    if (consolidatedVideos.length === 0 && cachedSavedVideos.length > 0 && partitionMetadata.length > 0) {
      console.warn("Sync returned empty consolidated videos, but cachedSavedVideos had items. Preserving cache to avoid blank sidebar.");
      consolidatedVideos = cachedSavedVideos;
    }

    // Update the local storage cache
    await chrome.storage.local.set({ 
      savedVideos: consolidatedVideos,
      partitionMetadata: partitionMetadata
    });
    
    // Refresh side panel UI
    chrome.runtime.sendMessage({ action: "REFRESH_SAVED_VIDEOS" }).catch(() => {});
    
    return consolidatedVideos;
  } catch (error) {
    console.error("Sync error:", error);
    throw error;
  }
}

// Helper: Get all matching playlists or create the first one
async function getOrMakeYtvPlaylists() {
  const localData = await chrome.storage.local.get("ytvPlaylists");
  let cachedPlaylists = localData.ytvPlaylists || [];

  const listResponse = await callYoutubeApi("LIST_PLAYLISTS", {});
  const playlists = parsePlaylistsFromBrowse(listResponse);
  let fetchedPlaylists = playlists.filter(p => p.title === "ytvlater" || p.title.startsWith("ytvlater-"));

  const mergedMap = new Map();
  cachedPlaylists.forEach(p => mergedMap.set(p.id, p));
  fetchedPlaylists.forEach(p => mergedMap.set(p.id, p));
  
  let ytvPlaylists = Array.from(mergedMap.values());

  if (ytvPlaylists.length === 0) {
    const uuid = crypto.randomUUID();
    const newTitle = `ytvlater-${uuid}`;
    const createRes = await callYoutubeApi("CREATE_PLAYLIST", { title: newTitle });
    const playlistId = createRes?.playlistId;
    if (!playlistId) {
      throw new Error(`Failed to create the ${newTitle} playlist on your YouTube account.`);
    }
    const newPlaylist = { id: playlistId, title: newTitle };
    ytvPlaylists.push(newPlaylist);
    await chrome.storage.local.set({ ytvPlaylists });
  } else {
    await chrome.storage.local.set({ ytvPlaylists });
  }

  return ytvPlaylists;
}

// Helper: Save video details to chrome.storage.local cache & write sharded update
async function saveVideoToStorage(data) {
  const { videoId, title, currentTime, channelTitle } = data;
  if (!videoId || currentTime === undefined) {
    throw new Error("Invalid video data: videoId and currentTime are required.");
  }

  const storageData = await chrome.storage.local.get("savedVideos");
  const savedVideos = storageData.savedVideos || [];
  
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

  if (title) videoGroup.title = title;
  if (channelTitle) videoGroup.channelTitle = channelTitle;
  
  if (!videoGroup.timestamps.some(t => t.id === newEntryId)) {
    videoGroup.timestamps.push({
      id: newEntryId,
      timestamp: currentTime,
      savedAt: Date.now(),
      notes: ""
    });
  }

  // Perform sharded write to YouTube using local cache as source of truth
  await writeToYouTubePlaylists(videoId, videoGroup);

  // Update local storage cache
  await chrome.storage.local.set({ savedVideos });
  
  // Broadcast update
  chrome.runtime.sendMessage({ action: "REFRESH_SAVED_VIDEOS" }).catch(() => {});
}

// Helper: Update notes or delete a timestamp
async function updateVideoInStorage(videoId, updatedGroup) {
  const storageData = await chrome.storage.local.get("savedVideos");
  const savedVideos = storageData.savedVideos || [];
  
  const idx = savedVideos.findIndex(g => g.videoId === videoId);
  if (idx !== -1) {
    if (!updatedGroup || !updatedGroup.timestamps || updatedGroup.timestamps.length === 0) {
      savedVideos.splice(idx, 1);
    } else {
      savedVideos[idx] = updatedGroup;
    }
  }

  // Update sharded playlist using local cache as source of truth
  await writeToYouTubePlaylists(videoId, updatedGroup);

  // Update local storage cache
  await chrome.storage.local.set({ savedVideos });
  
  chrome.runtime.sendMessage({ action: "REFRESH_SAVED_VIDEOS" }).catch(() => {});
}

// Helper: Perform playlist sharded writing to YouTube using local cache as source of truth
async function writeToYouTubePlaylists(videoId, updatedGroup = null) {
  const ytvPlaylists = await getOrMakeYtvPlaylists();
  
  const storage = await chrome.storage.local.get(["partitionMetadata", "ytvPlaylists"]);
  let partitionMetadata = storage.partitionMetadata || [];

  // If local cache is empty, we must construct it from YouTube
  if (partitionMetadata.length === 0 || partitionMetadata.length !== ytvPlaylists.length) {
    const detailsPromises = ytvPlaylists.map(async (playlist) => {
      try {
        const playlistDetails = await callYoutubeApi("GET_PLAYLIST", { playlistId: playlist.id });
        const parsed = parseMetadataFromPlaylistBrowse(playlistDetails);
        return {
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          sequence: parsed ? parsed.sequence : 1,
          createdAt: parsed ? parsed.createdAt : 0,
          videos: parsed ? parsed.videos : [],
          videoSetIds: parseVideoSetIds(playlistDetails)
        };
      } catch (err) {
        console.error(`Failed to fetch details for playlist partition ${playlist.title}:`, err);
        return {
          playlistId: playlist.id,
          playlistTitle: playlist.title,
          sequence: 1,
          createdAt: 0,
          videos: [],
          videoSetIds: {}
        };
      }
    });
    partitionMetadata = await Promise.all(detailsPromises);
    partitionMetadata.sort((a, b) => {
      if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      return a.createdAt - b.createdAt;
    });
  }

  // Find which partition the video belongs to
  let videoPartition = partitionMetadata.find(p => p.videos.some(g => g.videoId === videoId));
  let activeTargetPlaylistId = null;

  try {
    if (videoPartition) {
      activeTargetPlaylistId = videoPartition.playlistId;
      // Clean up any duplicate records of this videoId inside this partition first!
      videoPartition.videos = videoPartition.videos.filter(g => g.videoId !== videoId);

      if (!updatedGroup || !updatedGroup.timestamps || updatedGroup.timestamps.length === 0) {
        // Deleting video from this partition
        videoPartition.updatedAt = Date.now();
        const wrapper = {
          sequence: videoPartition.sequence || 1,
          createdAt: videoPartition.createdAt || Date.now(),
          updatedAt: videoPartition.updatedAt,
          videos: videoPartition.videos
        };
        const descText = `[YTVLATER]${JSON.stringify(wrapper)}[/YTVLATER]`;
        await callYoutubeApi("SET_DESCRIPTION", { playlistId: videoPartition.playlistId, description: descText });

        // Physically remove the video from the YouTube playlist
        let setVideoId = videoPartition.videoSetIds?.[videoId];
        if (!setVideoId) {
          try {
            const details = await callYoutubeApi("GET_PLAYLIST", { playlistId: videoPartition.playlistId });
            videoPartition.videoSetIds = parseVideoSetIds(details);
            setVideoId = videoPartition.videoSetIds[videoId];
          } catch (err) {
            console.error("Failed to fetch fresh setVideoIds during deletion:", err);
          }
        }
        if (setVideoId) {
          await callYoutubeApi("REMOVE_VIDEO", { playlistId: videoPartition.playlistId, setVideoId }).catch(err => {
            console.error(`Failed to physically remove video ${videoId} from playlist ${videoPartition.playlistTitle}:`, err);
          });
          if (videoPartition.videoSetIds) {
            delete videoPartition.videoSetIds[videoId];
          }
        }
      } else {
        // Adding/Updating the video group in this partition
        videoPartition.videos.push(updatedGroup);
        
        videoPartition.updatedAt = Date.now();
        const wrapper = {
          sequence: videoPartition.sequence || 1,
          createdAt: videoPartition.createdAt || Date.now(),
          updatedAt: videoPartition.updatedAt,
          videos: videoPartition.videos
        };
        const descText = `[YTVLATER]${JSON.stringify(wrapper)}[/YTVLATER]`;
        if (descText.length <= 4500) {
          await callYoutubeApi("SET_DESCRIPTION", { playlistId: videoPartition.playlistId, description: descText });
        } else {
          // Exceeds limit: remove from current partition and migrate to active/new partition
          videoPartition.videos = videoPartition.videos.filter(g => g.videoId !== videoId);
          videoPartition.updatedAt = Date.now();
          const cleanWrapper = {
            sequence: videoPartition.sequence || 1,
            createdAt: videoPartition.createdAt || Date.now(),
            updatedAt: videoPartition.updatedAt,
            videos: videoPartition.videos
          };
          const cleanDescText = `[YTVLATER]${JSON.stringify(cleanWrapper)}[/YTVLATER]`;
          await callYoutubeApi("SET_DESCRIPTION", { playlistId: videoPartition.playlistId, description: cleanDescText });
          
          // Physically remove the video from this playlist since we are migrating it
          let setVideoId = videoPartition.videoSetIds?.[videoId];
          if (!setVideoId) {
            try {
              const details = await callYoutubeApi("GET_PLAYLIST", { playlistId: videoPartition.playlistId });
              videoPartition.videoSetIds = parseVideoSetIds(details);
              setVideoId = videoPartition.videoSetIds[videoId];
            } catch (err) {
              console.error("Failed to fetch fresh setVideoIds during migration removal:", err);
            }
          }
          if (setVideoId) {
            await callYoutubeApi("REMOVE_VIDEO", { playlistId: videoPartition.playlistId, setVideoId }).catch(err => {
              console.error(`Failed to physically remove video ${videoId} during migration:`, err);
            });
            if (videoPartition.videoSetIds) {
              delete videoPartition.videoSetIds[videoId];
            }
          }

          // Search for a partition that has enough space, or create a new one
          let targetPartition = null;
          for (const part of partitionMetadata) {
            const cleanV = part.videos.filter(g => g.videoId !== videoId);
            const testV = [...cleanV, updatedGroup];
            const testW = {
              sequence: part.sequence || 1,
              createdAt: part.createdAt || Date.now(),
              videos: testV
            };
            const testJ = `[YTVLATER]${JSON.stringify(testW)}[/YTVLATER]`;
            if (testJ.length <= 4500) {
              targetPartition = part;
              break;
            }
          }

          if (targetPartition) {
            activeTargetPlaylistId = targetPartition.playlistId;
            targetPartition.videos = targetPartition.videos.filter(g => g.videoId !== videoId);
            targetPartition.videos.push(updatedGroup);
            targetPartition.updatedAt = Date.now();
            
            const finalWrapper = {
              sequence: targetPartition.sequence || 1,
              createdAt: targetPartition.createdAt || Date.now(),
              updatedAt: targetPartition.updatedAt,
              videos: targetPartition.videos
            };
            const finalJson = `[YTVLATER]${JSON.stringify(finalWrapper)}[/YTVLATER]`;
            
            // Physically add video to the target partition if not already there
            if (!targetPartition.videoSetIds || !targetPartition.videoSetIds[videoId]) {
              await callYoutubeApi("ADD_VIDEO", { playlistId: targetPartition.playlistId, videoId: videoId }).catch(console.error);
              try {
                const details = await callYoutubeApi("GET_PLAYLIST", { playlistId: targetPartition.playlistId });
                targetPartition.videoSetIds = parseVideoSetIds(details);
              } catch (e) {
                console.error("Failed to refresh setVideoIds after ADD_VIDEO:", e);
              }
            }
            await callYoutubeApi("SET_DESCRIPTION", { playlistId: targetPartition.playlistId, description: finalJson });
          } else {
            // Create a new partition
            const uuid = crypto.randomUUID();
            const newTitle = `ytvlater-${uuid}`;
            
            const createRes = await callYoutubeApi("CREATE_PLAYLIST", { title: newTitle });
            const newPlaylistId = createRes?.playlistId;
            if (!newPlaylistId) {
              throw new Error(`Failed to create new playlist partition ${newTitle} on YouTube.`);
            }
            
            // Cache the new playlist
            const newPlaylist = { id: newPlaylistId, title: newTitle };
            ytvPlaylists.push(newPlaylist);
            await chrome.storage.local.set({ ytvPlaylists });
            
            const activePartition = partitionMetadata[partitionMetadata.length - 1];
            const nextSeq = activePartition.sequence + 1;
            const newPartition = {
              playlistId: newPlaylistId,
              playlistTitle: newTitle,
              sequence: nextSeq,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              videos: [updatedGroup],
              videoSetIds: {}
            };
            partitionMetadata.push(newPartition);
            
            activeTargetPlaylistId = newPlaylistId;
            const newWrapper = {
              sequence: nextSeq,
              createdAt: newPartition.createdAt,
              updatedAt: newPartition.updatedAt,
              videos: newPartition.videos
            };
            const newJson = `[YTVLATER]${JSON.stringify(newWrapper)}[/YTVLATER]`;
            await callYoutubeApi("ADD_VIDEO", { playlistId: newPlaylistId, videoId: videoId }).catch(console.error);
            await callYoutubeApi("SET_DESCRIPTION", { playlistId: newPlaylistId, description: newJson });
            try {
              const details = await callYoutubeApi("GET_PLAYLIST", { playlistId: newPlaylistId });
              newPartition.videoSetIds = parseVideoSetIds(details);
            } catch (e) {
              console.error("Failed to refresh setVideoIds on new partition:", e);
            }
          }
        }
      }
    } else {
      // New video bookmark group!
      if (updatedGroup && updatedGroup.timestamps && updatedGroup.timestamps.length > 0) {
        // Find the first partition that has enough space
        let targetPartition = null;
        for (const part of partitionMetadata) {
          const cleanV = part.videos.filter(g => g.videoId !== videoId);
          const testV = [...cleanV, updatedGroup];
          const testW = {
            sequence: part.sequence || 1,
            createdAt: part.createdAt || Date.now(),
            videos: testV
          };
          const testJ = `[YTVLATER]${JSON.stringify(testW)}[/YTVLATER]`;
          if (testJ.length <= 4500) {
            targetPartition = part;
            break;
          }
        }
        
        if (targetPartition) {
          activeTargetPlaylistId = targetPartition.playlistId;
          targetPartition.videos = targetPartition.videos.filter(g => g.videoId !== videoId);
          targetPartition.videos.push(updatedGroup);
          targetPartition.updatedAt = Date.now();
          
          const finalWrapper = {
            sequence: targetPartition.sequence || 1,
            createdAt: targetPartition.createdAt || Date.now(),
            updatedAt: targetPartition.updatedAt,
            videos: targetPartition.videos
          };
          const finalJson = `[YTVLATER]${JSON.stringify(finalWrapper)}[/YTVLATER]`;
          
          // Physically add video to target partition if not already there
          if (!targetPartition.videoSetIds || !targetPartition.videoSetIds[videoId]) {
            await callYoutubeApi("ADD_VIDEO", { playlistId: targetPartition.playlistId, videoId: videoId }).catch(console.error);
            try {
              const details = await callYoutubeApi("GET_PLAYLIST", { playlistId: targetPartition.playlistId });
              targetPartition.videoSetIds = parseVideoSetIds(details);
            } catch (e) {
              console.error("Failed to refresh setVideoIds after ADD_VIDEO:", e);
            }
          }
          await callYoutubeApi("SET_DESCRIPTION", { playlistId: targetPartition.playlistId, description: finalJson });
        } else {
          // Create next partition
          const uuid = crypto.randomUUID();
          const newTitle = `ytvlater-${uuid}`;
          
          const createRes = await callYoutubeApi("CREATE_PLAYLIST", { title: newTitle });
          const newPlaylistId = createRes?.playlistId;
          if (!newPlaylistId) {
            throw new Error(`Failed to create new playlist partition ${newTitle} on YouTube.`);
          }
          
          // Cache the new playlist
          const newPlaylist = { id: newPlaylistId, title: newTitle };
          ytvPlaylists.push(newPlaylist);
          await chrome.storage.local.set({ ytvPlaylists });
          
          const activePartition = partitionMetadata[partitionMetadata.length - 1];
          const nextSeq = (activePartition ? activePartition.sequence : 0) + 1;
          const newPartition = {
            playlistId: newPlaylistId,
            playlistTitle: newTitle,
            sequence: nextSeq,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            videos: [updatedGroup],
            videoSetIds: {}
          };
          partitionMetadata.push(newPartition);
          
          activeTargetPlaylistId = newPlaylistId;
          const newWrapper = {
            sequence: nextSeq,
            createdAt: newPartition.createdAt,
            updatedAt: newPartition.updatedAt,
            videos: newPartition.videos
          };
          const newJson = `[YTVLATER]${JSON.stringify(newWrapper)}[/YTVLATER]`;
          
          await callYoutubeApi("ADD_VIDEO", { playlistId: newPlaylistId, videoId: videoId }).catch(console.error);
          await callYoutubeApi("SET_DESCRIPTION", { playlistId: newPlaylistId, description: newJson });
          try {
            const details = await callYoutubeApi("GET_PLAYLIST", { playlistId: newPlaylistId });
            newPartition.videoSetIds = parseVideoSetIds(details);
          } catch (e) {
            console.error("Failed to refresh setVideoIds on new partition:", e);
          }
        }
      }
    }
  } catch (err) {
    const errMsg = err.message || "";
    const isPlaylistGone = errMsg.includes("404") || 
                           errMsg.includes("not found") || 
                           errMsg.includes("invalid");
                           
    if (isPlaylistGone && activeTargetPlaylistId) {
      console.warn(`Write target playlist ${activeTargetPlaylistId} is gone. Performing self-healing cache repair...`);
      
      // Filter out this partition from local metadata cache
      partitionMetadata = partitionMetadata.filter(p => p.playlistId !== activeTargetPlaylistId);
      
      // Filter out from local playlists cache
      const cachedPlaylists = storage.ytvPlaylists || [];
      const cleanPlaylists = cachedPlaylists.filter(p => p.id !== activeTargetPlaylistId);
      
      await chrome.storage.local.set({ 
        partitionMetadata, 
        ytvPlaylists: cleanPlaylists 
      });
      
      // Rebuild and save consolidated savedVideos
      let consolidatedVideos = [];
      for (const part of partitionMetadata) {
        if (part && Array.isArray(part.videos)) {
          consolidatedVideos = mergePlaylistsData(consolidatedVideos, part.videos);
        }
      }
      await chrome.storage.local.set({ savedVideos: consolidatedVideos });
      
      // Broadcast refresh to sidepanel UI
      chrome.runtime.sendMessage({ action: "REFRESH_SAVED_VIDEOS" }).catch(() => {});
      
      // If it is a save/update request (not a delete), recursively retry the write
      if (updatedGroup) {
        console.log(`Retrying write for video ${videoId} after playlist deletion cleanup.`);
        return writeToYouTubePlaylists(videoId, updatedGroup);
      }
      return;
    }
    
    throw err; // Rethrow other errors
  }

  // Save the updated partitionMetadata cache back to local storage
  await chrome.storage.local.set({ partitionMetadata });
}

// Traverse InnerTube JSON for playlists
function parsePlaylistsFromBrowse(data) {
  const playlists = [];
  
  function traverse(obj) {
    if (!obj || typeof obj !== "object") return;
    
    if (obj.playlistId && (obj.title || obj.titleText)) {
      let title = "";
      const rawTitle = obj.title || obj.titleText;
      if (typeof rawTitle === "string") {
        title = rawTitle;
      } else if (rawTitle && Array.isArray(rawTitle.runs) && rawTitle.runs[0]) {
        title = rawTitle.runs[0].text;
      } else if (rawTitle && typeof rawTitle.simpleText === "string") {
        title = rawTitle.simpleText;
      }
      
      if (title) {
        playlists.push({
          id: obj.playlistId,
          title: title.trim()
        });
      }
      return;
    }
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        traverse(obj[key]);
      }
    }
  }
  
  traverse(data);
  return playlists;
}

// Traverse InnerTube JSON for description metadata
function parseMetadataFromPlaylistBrowse(data) {
  let description = "";
  
  function traverse(obj) {
    if (!obj || typeof obj !== "object") return;
    
    // If we already found a description containing the YTVLATER block, we don't need to look further
    if (description && description.includes("[YTVLATER]")) return;

    if (obj.descriptionText || obj.description) {
      const rawDesc = obj.descriptionText || obj.description;
      let descText = "";
      if (typeof rawDesc === "string") {
        descText = rawDesc;
      } else if (rawDesc && Array.isArray(rawDesc.runs)) {
        descText = rawDesc.runs.map(r => r.text).join("");
      } else if (rawDesc && typeof rawDesc.simpleText === "string") {
        descText = rawDesc.simpleText;
      }
      
      if (descText) {
        // If this description text contains the tag, prioritize it!
        if (descText.includes("[YTVLATER]")) {
          description = descText;
          return;
        }
        // Only set it if we don't have one yet (so the first description found,
        // which is usually the playlist header/metadata description, is preserved)
        if (!description) {
          description = descText;
        }
      }
    }
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        traverse(obj[key]);
      }
    }
  }
  
  traverse(data);
  
  if (!description) return null;
  
  const match = description.match(/\[YTVLATER\]([\s\S]*?)\[\/YTVLATER\]/);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed === "object") {
        // Fallback for legacy format (flat array)
        if (Array.isArray(parsed)) {
          const cleanVideos = deDuplicateVideos(parsed);
          return {
            sequence: 1,
            createdAt: 0,
            videos: cleanVideos
          };
        } else if (Array.isArray(parsed.videos)) {
          // Wrapped format
          const cleanVideos = deDuplicateVideos(parsed.videos);
          return {
            sequence: parsed.sequence || 1,
            createdAt: parsed.createdAt || 0,
            updatedAt: parsed.updatedAt || 0,
            videos: cleanVideos
          };
        }
      }
    } catch (e) {
      console.error("Error parsing YTVLater metadata block:", e);
    }
  }
  
  return null;
}

// Traverse InnerTube JSON for videoId to setVideoId mapping
function parseVideoSetIds(data) {
  const mapping = {};
  
  function traverse(obj) {
    if (!obj || typeof obj !== "object") return;
    
    // Look for playlistVideoRenderer
    if (obj.playlistVideoRenderer) {
      const renderer = obj.playlistVideoRenderer;
      if (renderer.videoId && renderer.setVideoId) {
        mapping[renderer.videoId] = renderer.setVideoId;
      }
    }
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        traverse(obj[key]);
      }
    }
  }
  
  traverse(data);
  return mapping;
}

// Consolidate sharded partition data
function mergePlaylistsData(baseList, newList) {
  if (!Array.isArray(newList)) return baseList;
  
  const merged = [...baseList];
  for (const videoGroup of newList) {
    const existingGroup = merged.find(g => g.videoId === videoGroup.videoId);
    if (!existingGroup) {
      merged.push(videoGroup);
    } else {
      for (const ts of videoGroup.timestamps) {
        if (!existingGroup.timestamps.some(t => t.id === ts.id)) {
          existingGroup.timestamps.push(ts);
        }
      }
    }
  }
  return merged;
}

// Helper: De-duplicate videos array on the fly
function deDuplicateVideos(videosArray) {
  if (!Array.isArray(videosArray)) return [];
  const cleanVideos = [];
  for (const videoGroup of videosArray) {
    const existing = cleanVideos.find(g => g.videoId === videoGroup.videoId);
    if (!existing) {
      cleanVideos.push(videoGroup);
    } else {
      if (Array.isArray(videoGroup.timestamps) && Array.isArray(existing.timestamps)) {
        videoGroup.timestamps.forEach(ts => {
          if (!existing.timestamps.some(t => t.id === ts.id)) {
            existing.timestamps.push(ts);
          }
        });
      }
    }
  }
  return cleanVideos;
}

// Helper: Flash success badge on extension icon
async function flashBadge() {
  try {
    await chrome.action.setBadgeText({ text: "✓" });
    await chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
    setTimeout(async () => {
      await chrome.action.setBadgeText({ text: "" });
    }, 1500);
  } catch (error) {
    console.error("Error flashing badge:", error);
  }
}
