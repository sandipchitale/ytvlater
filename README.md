# YTVLater — YouTube Watch Later at Timestamp

YTVLater is a modern, premium Google Chrome extension that allows you to bookmark exact timestamps in YouTube videos to watch later. Accessible directly from Chrome's Side Panel, it's designed to streamline learning, research, note-taking, and content reference curation.

---

## 🚀 Key Features

- **Direct YouTube Integration**: Injects a custom bookmark-play button right into the YouTube player controls next to the settings gear.
- **Chrome Side Panel UI**: View, search, edit, and organize your saved moments grouped by video under a single thumbnail card in a native sidebar. No redundant video cards!
- **Instant Seeking**: Clicking a bookmarked moment seeks the player directly to the exact second if you are on the same page. If not, it navigates or opens a new tab automatically.
- **Premium Segmented Controls**:
  - **Sleek Theme Controls**: Toggle instantly between **Auto (System)**, **Light**, and **Dark** themes with beautiful active rose selection highlighting.
  - **Smart Sorter**: Sort your videos by **Newest**, **Oldest**, **A-Z**, or **Z-A** with a segmented click container.
- **Inline Custom Notes**: Add, edit, or delete personal notes per timestamp to annotate reference guides, lessons, or funny moments.
- **Advanced Searching**: Instant search filters videos by keyword matching titles, channel names, or text in notes.
- **Backup & Portability**: Export your collection to a clean JSON file and import it back on any other device.
- **Privacy & Sync via YouTube Sharding**: Saves your bookmarks directly inside private playlists on your own YouTube account. Uses your active, logged-in browser session securely (no OAuth or API keys required) to shard metadata across playlist description fields. This ensures automatic sync across all your devices logged into YouTube, with absolute privacy.

---

## 🎨 Premium Design System

The side panel UI is built using modern visual elements to feel state-of-the-art and visually cohesive:
- **Typography**: Uses clean, geometric fonts (**Outfit** for titles/headings, **Inter** for body text and controls).
- **Theme Adaptability**: Hand-tailored CSS variables react instantly to dark, light, and system themes.
- **Visual hierarchy**: Clean, spacious borders (`border-slate-200` & `border-slate-800`), glassmorphic overlays, and transition animations.
- **Branded Toolbar Icon**: A custom high-contrast 16x16 toolbar stopwatch outline on a solid crimson-red rounded background, guaranteeing high legibility across dark and light browser toolbars.

---

## 📂 Project Architecture

```text
ytvlater/
├── manifest.json         # Extension Manifest V3 configuration
├── background.js         # Background Service Worker (manages sharding, sync, and storage state)
├── content.js            # Injected content script (manages DOM injection & seeks)
├── content-main.js       # MAIN context script (proxies InnerTube API calls via page credentials)
├── generate_icons.py     # Python Pillow script to draw pixel-perfect icons
├── icons/                # Compiled extension icons (16x16, 32x32, 48x48, 128x128)
├── sidepanel/
│   ├── sidepanel.html    # Sidebar Layout structure
│   ├── sidepanel.js      # Sidebar controller, sorting/searching, theme management
│   ├── input.css         # Tailwind source CSS (V4)
│   └── tailwind.css      # Compiled, minified production stylesheet
├── package.json          # Tailwind CLI compiler dependencies
└── CHROMEWEBSTORE.md     # Web Store description and listing metadata
```

---

## 🔧 Installation & Setup

To load this extension locally in Google Chrome:

1. Open Google Chrome.
2. Navigate to `chrome://extensions/` by entering it in the address bar.
3. Toggle the **Developer mode** switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the `ytvlater` project root directory.

---

## 📖 Usage & Sync Guide

### 1. Saving a Timestamp
- Click the custom **Bookmark-Play** icon injected next to the settings gear in the bottom-right player controls of any YouTube video.
- A success badge `✓` will flash green on the extension toolbar icon, and a glassmorphic notification toast will slide up showing the saved time.

### 2. Synchronization & Manual Sync
- Bookmarks are saved to your YouTube playlists. If your sidebar doesn't show updates made from another device, click the **Sync** (refresh-arrows) button in the top menu bar.
- Note: Since the extension uses your active YouTube browser session, a YouTube tab must be open in your browser to perform background API requests.

### 3. Managing Saved Moments
- Click the extension icon in the toolbar to open the **Chrome Side Panel**.
- Use the **Search input** at the top to filter items instantly by title, channel name, or custom notes.
- Select sorting preferences (**Newest**, **Oldest**, **A-Z**, **Z-A**) to reorganize cards.
- Hover over a card or moment to reveal **Edit Notes** (pencil) and **Delete** (trash) actions.
- Click **"Add a custom note..."** or the pencil icon to toggle the inline notes editor. Write annotations and press **Save**.

---

## 💾 Storage & Sharding Database Schema

To bypass the tiny limits of `chrome.storage.sync` (capped at 100KB total and 8KB per key) and avoid requiring users to set up database endpoints or OAuth credentials, YTVLater implements a custom sharding database built on top of private YouTube playlists:

### 1. Playlist Shards & UUID Naming
The extension creates and connects to private playlists named `ytvlater-UUID` (e.g., `ytvlater-a8b9c0d1-...`) on your account. A sequence counter is stored inside the metadata wrapper of each playlist to track partition order, removing any reliance on sequential title suffixes.

### 2. Metadata Sharding
- Videos are physically added to the playlists.
- The corresponding timestamp metadata, notes, titles, and channel information are serialized as JSON and stored directly inside the playlist's **description field**, wrapped in `[YTVLATER]...[/YTVLATER]` tags.

### 3. Automatic Partitioning & Migration
- YouTube limits playlist descriptions to **5,000 characters**.
- When saving a new timestamp, if the serialized JSON block in the current active partition exceeds **4,500 characters**, YTVLater automatically spins up a new playlist partition (e.g. `ytvlater-UUID`), adds the video, and saves the new metadata block there.
- When updating/adding notes to a video that resides in an older partition, if the updated JSON block causes that partition's description to exceed 4,500 characters, YTVLater automatically removes the video group from that partition and migrates it to the latest active partition (creating a new one if it also overflows there).

### 4. Physical Video Deletion
- When the last timestamp of a video is deleted, or when a video is migrated due to partition overflow, the video is physically deleted from the corresponding YouTube playlist (using its unique InnerTube `setVideoId`).

### 5. Last-Write-Wins (LWW) Sync Engine
- To counter YouTube's description cache latency (where syncing immediately after an update can pull a stale description from YouTube's CDN), the metadata block includes an `updatedAt` epoch.
- If a sync request returns a description timestamp older than the local cache, the stale fetch is ignored, preserving the most recent local state.

### 6. Active Self-Healing
- If a user deletes a playlist partition directly from YouTube, YTVLater detects the missing playlist on the next sync/write, cleans up local references, and automatically removes the orphaned video entries from the side panel list.

### 7. Local Caching
To keep the sidebar load times instantaneous and reduce YouTube API request overhead, all aggregated metadata is cached locally in `chrome.storage.local`. The sidebar renders directly from this cache and updates in real-time.


### Database JSON Format (Local Cache / Export Backup):
```json
[
  {
    "videoId": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
    "channelTitle": "Rick Astley",
    "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    "timestamps": [
      {
        "id": "ytv-dQw4w9WgXcQ-42-00-1717621456789",
        "timestamp": 42.00,
        "savedAt": 1717621456789,
        "notes": "The legendary dance move"
      }
    ]
  }
]
```

### Playlist Description Metadata Block Format (YouTube Shard):
```text
[YTVLATER]
{
  "sequence": 1,
  "createdAt": 1717621400000,
  "updatedAt": 1717621456789,
  "videos": [
    {
      "videoId": "dQw4w9WgXcQ",
      "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
      "channelTitle": "Rick Astley",
      "thumbnailUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      "timestamps": [
        {
          "id": "ytv-dQw4w9WgXcQ-42-00-1717621456789",
          "timestamp": 42.0,
          "savedAt": 1717621456789,
          "notes": "The legendary dance move"
        }
      ]
    }
  ]
}
[/YTVLATER]
```

---

## 🛠️ Development

If you modify the stylesheet or icon assets, you can run these commands:

### Rebuilding Icons
To update the extension logo assets (draws and outputs antialiased PNGs using Python's Pillow library):
```bash
python3 generate_icons.py
```

### Compiling Tailwind CSS
Tailwind CSS v4 is used to generate the sidebar layout style. To build and bundle CSS classes:
```bash
# Install local build dependencies (Tailwind CLI)
npm install

# Compile & minify Tailwind CSS stylesheet
npx @tailwindcss/cli -i sidepanel/input.css -o sidepanel/tailwind.css -m
```

---

## 📄 License

This project is open-source and available under the MIT License.
