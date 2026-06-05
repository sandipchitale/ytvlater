// Content Script for YouTube integration

// Keep track of the current video ID to handle page changes
let currentVideoId = "";

// Initialize
init();

function init() {
  // 1. Setup periodic checks to inject the button (handles SPA navigation robustly)
  setInterval(checkForVideoPage, 1500);

  // 2. Listen to YouTube's SPA navigation event
  document.addEventListener("yt-navigate-finish", () => {
    checkForVideoPage();
  });

  // 3. Listen for messages from background script or sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GET_VIDEO_STATE") {
      const state = getVideoState();
      if (state) {
        sendResponse({ success: true, data: state });
      } else {
        sendResponse({ success: false, error: "No active video found on this page." });
      }
    } else if (message.action === "SEEK_TO_TIMESTAMP") {
      const success = seekTo(message.timestamp);
      sendResponse({ success });
    }
    return true; // Keep channel open for async response
  });
}

// Check if we are on a watch page and inject the button
function checkForVideoPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get("v");
  
  if (!videoId) {
    currentVideoId = "";
    return;
  }

  // Update current video ID
  if (videoId !== currentVideoId) {
    currentVideoId = videoId;
  }

  // Check if save button is already injected
  if (document.getElementById("ytv-save-btn")) {
    return;
  }

  injectSaveButton();
}

// Seek to a specific timestamp and play
function seekTo(timestamp) {
  const video = document.querySelector("video");
  if (video) {
    video.currentTime = parseFloat(timestamp);
    video.play().catch(() => {});
    return true;
  }
  return false;
}

// Inject "Save to YTVLater" button in player controls
function injectSaveButton() {
  const rightControls = document.querySelector(".ytp-right-controls");
  if (!rightControls) return;

  const btn = document.createElement("button");
  btn.id = "ytv-save-btn";
  btn.className = "ytp-button ytv-save-button";
  btn.title = "Save to YTVLater";
  btn.setAttribute("aria-label", "Save to YTVLater");
  
  // Custom button styling (resilient inline styles to prevent YouTube CSS overrides)
  Object.assign(btn.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "46px",
    height: "100%",
    verticalAlign: "middle",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: "0",
    outline: "none"
  });

  // Modern bookmark-play icon
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ffffff; display: block; margin: auto; transition: transform 0.2s ease;">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
      <polygon points="10 8 14 11 10 14" fill="currentColor"></polygon>
    </svg>
  `;

  // Hover effects via JS since inline hover isn't possible directly
  const svg = btn.querySelector("svg");
  btn.addEventListener("mouseenter", () => {
    svg.style.transform = "scale(1.15)";
    svg.style.color = "#ff2e55"; // neon pink-red accent color on hover
  });
  btn.addEventListener("mouseleave", () => {
    svg.style.transform = "scale(1)";
    svg.style.color = "#ffffff";
  });

  // Click Handler: Save video timestamp
  btn.addEventListener("click", async () => {
    const state = getVideoState();
    if (!state) return;

    // Scale down/up animation on click
    svg.style.transform = "scale(0.85)";
    setTimeout(() => { svg.style.transform = "scale(1.15)"; }, 150);

    try {
      const response = await chrome.runtime.sendMessage({ action: "SAVE_VIDEO", data: state });
      if (response && response.success) {
        showToast(state.currentTime, state.title);
      }
    } catch (error) {
      console.error("Failed to save video timestamp via extension:", error);
    }
  });

  // Inject before settings button if found, otherwise at the end
  const settingsBtn = rightControls.querySelector(".ytp-settings-button");
  if (settingsBtn && settingsBtn.parentNode) {
    settingsBtn.parentNode.insertBefore(btn, settingsBtn);
  } else {
    rightControls.appendChild(btn);
  }
}

// Scrape YouTube page for video details
function getVideoState() {
  const video = document.querySelector("video");
  if (!video) return null;

  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get("v");
  if (!videoId) return null;

  // 1. Get Video Title
  let title = "";
  const titleEl = document.querySelector("ytd-watch-metadata h1") || 
                  document.querySelector("h1.ytd-video-primary-info-renderer") ||
                  document.querySelector(".ytp-title-link");
  if (titleEl) {
    title = titleEl.innerText.trim();
  }
  if (!title) {
    title = document.title.replace(/ - YouTube$/, "").trim();
  }

  // 2. Get Channel Name
  let channelTitle = "";
  const channelEl = document.querySelector("ytd-video-owner-renderer ytd-channel-name a") ||
                    document.querySelector("#owner-sub-count")?.closest("ytd-video-owner-renderer")?.querySelector("ytd-channel-name a") ||
                    document.querySelector("yt-formatted-string.ytd-channel-name");
  if (channelEl) {
    channelTitle = channelEl.innerText.trim();
  }

  return {
    videoId,
    title,
    currentTime: video.currentTime,
    channelTitle: channelTitle || "YouTube Creator"
  };
}

// Format seconds into MM:SS or HH:MM:SS
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Injected Elegant Toast Notification
function showToast(seconds, videoTitle) {
  // Remove existing toast if present to avoid overlap
  const oldToast = document.getElementById("ytv-toast-container");
  if (oldToast) oldToast.remove();

  const timeStr = formatTime(seconds);
  const toast = document.createElement("div");
  toast.id = "ytv-toast-container";
  
  // Style with premium translucent dark blur look (glassmorphism)
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "80px", // Just above YouTube's player bottom controls bar
    right: "24px",
    backgroundColor: "rgba(15, 23, 42, 0.9)", // slate-900 with transparency
    color: "#ffffff",
    padding: "12px 20px",
    borderRadius: "12px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
    zIndex: "999999",
    fontFamily: "'Outfit', 'Inter', system-ui, sans-serif",
    fontSize: "14px",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    backdropFilter: "blur(12px)",
    webkitBackdropFilter: "blur(12px)",
    opacity: "0",
    transform: "translateY(15px)",
    transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
  });

  // Icon (Checkmark) & Message
  toast.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" style="color: #10b981; flex-shrink: 0; filter: drop-shadow(0 0 4px rgba(16, 185, 129, 0.3));">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
    </svg>
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <span style="font-weight: 600; color: #f8fafc;">Saved to YTVLater</span>
      <span style="font-size: 12px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
        at <strong style="color: #ff2e55;">${timeStr}</strong>
      </span>
    </div>
  `;

  document.body.appendChild(toast);

  // Trigger browser paint/reflow to animate correctly
  toast.offsetHeight;

  // Fade-in
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  // Fade-out and remove after duration
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(15px)";
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 250);
  }, 2800);
}
