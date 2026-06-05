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
- **Privacy First**: Saves everything inside `chrome.storage.sync` which keeps your bookmarks synchronized across Chrome browsers logged into the same account without sending any data to external servers.

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
├── background.js          # Background Service Worker (Side panel loader & lifecycle)
├── content.js             # YouTube content injection, scraping, and player controls
├── generate_icons.py      # Python Pillow script to draw pixel-perfect icons
├── icons/                 # Compiled extension icons (16x16, 32x32, 48x48, 128x128)
├── sidepanel/
│   ├── sidepanel.html    # Sidebar Layout structure
│   ├── sidepanel.js      # Sidebar controller, sorting/searching, and data management
│   ├── input.css         # Tailwind source CSS (V4)
│   └── tailwind.css      # Compiled, minified production stylesheet
├── package.json           # Tailwind CLI compiler dependencies
└── CHROMEWEBSTORE.md      # Web Store description and listing metadata
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

## 📖 Usage Guide

### 1. Saving a Timestamp
- Click the custom **Bookmark-Play** icon injected next to the settings gear in the bottom-right player controls of any YouTube video.
- A success badge `✓` will flash green on the extension toolbar icon, and a glassmorphic notification toast will slide up showing the saved time.

### 2. Custom Themes
- Select **Auto (System Theme)**, **Light**, or **Dark** in the top right segmented control of the sidebar header to customize your visual experience.

### 3. Managing Saved Moments
- Click the extension icon in the toolbar to open the **Chrome Side Panel**.
- Use the **Search input** at the top to filter items instantly by title, channel name, or custom notes.
- Select sorting preferences (**Newest**, **Oldest**, **A-Z**, **Z-A**) to reorganize cards.
- Hover over a card or moment to reveal **Edit Notes** (pencil) and **Delete** (trash) actions.
- Click **"Add a custom note..."** or the pencil icon to toggle the inline notes editor. Write annotations and press **Save**.

### 4. Backup & Restore
- Click the **Download (arrow-down)** icon in the top right to download a `.json` backup of your saved bookmarks.
- Click the **Upload (arrow-up)** icon to restore or merge a previously exported bookmark file.

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

## 💾 Storage & Sync Schema

The extension uses `chrome.storage.sync` to sync your bookmarks across devices. Keep in mind:
- **Total Storage Limit**: `chrome.storage.sync` is capped at **100KB** total.
- **Item Limit**: Individual keys are capped at **8KB**.
- **Data Optimization**: Bookmarks are stored in a streamlined array-of-groups JSON schema under the `savedVideos` key. This minimizes footprint, allowing **250 to 400 concurrent saved moments** per account.

### Database Format:
```json
[
  {
    "videoId": "dQw4w9WgXcQ",
    "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
    "channel": "Rick Astley",
    "thumbnail": "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    "moments": [
      {
        "id": "1717621456789",
        "time": 42,
        "note": "The legendary dance move"
      }
    ]
  }
]
```

---

## 📄 License

This project is open-source and available under the MIT License.
