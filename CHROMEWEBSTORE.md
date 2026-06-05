# Chrome Web Store Listing — YTVLater

> Last Updated: 2026-06-05

## Store Listing

**Extension Name**
YTVLater - YouTube Watch Later at Timestamp

**Short Description**
Save YouTube videos at their current timestamp to watch later, right from your sidebar.

**Detailed Description**
YTVLater is a modern, lightweight Chrome extension designed for video learners, researchers, and creators who need to bookmark specific moments in YouTube videos.

No more scrolling back and forth or bookmarking URLs with manual time query strings! With YTVLater, you can capture exact playheads with a single click, add custom notes, and jump back to the exact second at any time.

Key Features:
* One-click save: Click the custom bookmark button injected right into the YouTube player controls.
* Chrome Sidebar (Side Panel): View, search, and manage all your saved timestamps in Chrome's native sidebar.
* Instant seek: Click any card in the sidebar to immediately jump to the timestamp (seeks the player instantly without page reload if you are on the same video).
* Multiple timestamps: Save the same video at multiple points.
* Custom notes: Add inline annotations and references to each saved timestamp (e.g. "Intro ends here", "Excellent quote").
* Search & sort: Find what you need by title, channel name, or notes, and sort by newest, oldest, or alphabetical.
* Backup & Restore: Export all your saved timestamps as a JSON file and import them back on another device.

How to use it:
1. Open any YouTube video.
2. In the player control bar (near settings), click the new Bookmark icon.
3. Open the Chrome Side Panel (click the extension action icon in the toolbar).
4. See all your saved videos, search, edit notes, or click a card to watch!

Privacy/permissions note:
We respect your privacy. All saved data is stored locally in your Chrome account using Chrome Storage Sync. No data is sent to external servers or third parties.

**Category**
Developer Tools or Productivity

**Single Purpose**
Saves YouTube videos at specific timestamps and provides a sidebar watch list to seek back to those exact moments.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile | 440×280 | ⬜ Not created | |

### Screenshot Notes
- Screenshot 1: The YouTube player watch page with the YTVLater button in the control controls, and the Chrome Side Panel open on the right displaying several saved cards with thumbnails and notes.
- Screenshot 2: Highlight of the inline note editor and search function in the side panel.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Required to save, edit, and read the user's bookmarked YouTube videos and timestamps. |
| `sidePanel` | permissions | Required to display the list of saved timestamps in Chrome's side panel. |
| `tabs` | permissions | Required to query the active tab's URL to check if it's a YouTube video, retrieve page metadata, and update the URL when seeking from the sidebar. |
| `*://*.youtube.com/*` | host_permissions | Required to run the content script that injects the save button into the YouTube player and handles real-time playhead seeking. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL**
https://github.com/sandipchitale/tools/chrome/extensions/ytvlater/privacy-policy.md

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

## Developer Info

**Publisher Name**
Sandip Chitale

**Contact Email**
developer@example.com

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-06-05 | Initial release with YouTube injection, sidepanel, search, edit notes, and import/export features. | Draft |

## Review Notes

### Known Issues / Limitations
- Relies on YouTube's player DOM structure. If YouTube updates their player UI controls, the button injection target (.ytp-right-controls) may need adjustment. Checked against current YouTube player layout.
