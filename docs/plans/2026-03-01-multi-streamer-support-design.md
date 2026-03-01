# Multi-Streamer Support Design

**Date:** 2026-03-01
**Goal:** Enable the MizukiPrism catalog to support multiple streamers, with auto-populated streamer profiles fetched from YouTube during the admin import flow.

---

## Data Schema

### `data/streamer.json` — Array of streamer profiles

```json
[
  {
    "channelId": "UCxxxxxx",
    "handle": "@煌Kirali",
    "displayName": "煌Kirali",
    "avatarUrl": "https://yt3.ggpht.com/...",
    "description": "...",
    "socialLinks": {
      "youtube": "https://www.youtube.com/@KiraliHikari",
      "twitter": "",
      "instagram": "",
      "twitch": ""
    }
  }
]
```

### `data/streams.json` — Each stream gains `channelId`

```json
{
  "id": "stream-2026-01-07",
  "channelId": "UCxxxxxx",
  "title": "...",
  "date": "2026-01-07",
  "videoId": "gOdBkLapyLo",
  "youtubeUrl": "..."
}
```

### `lib/types.ts` — New `Streamer` interface, `Stream` gains `channelId`

```typescript
export interface Streamer {
  channelId: string;
  handle: string;
  displayName: string;
  avatarUrl: string;
  description: string;
  socialLinks: Record<string, string>;
}
```

### Lookup chain

```
song → performance.streamId → stream.channelId → streamer
```

No changes to `songs.json` — songs link to streams via `streamId`, streams carry `channelId`.

---

## Architecture: Option A (Normalized)

`streamer.json` is the single source of truth for streamer profiles. Each stream references its streamer via `channelId`. This avoids duplicating streamer data across streams or performances.

---

## Fan-Facing UI

### Profile header

- **One streamer selected:** Full profile — avatar, name, description, social links (same as current layout).
- **All or multiple selected:** Compact row of small avatars side by side, names listed, no description or social links.

### Streamer switcher (in the filter/search bar)

```
[All] [@煌Kirali] [@浠Mizuki]   🔍 Search...   Sort ▾
```

- Clicking a streamer button toggles it — multiple can be active.
- "All" is the default; deselects when any specific streamer is picked.
- Clicking "All" resets to all streamers.
- Song catalog filters to only performances from selected streamer(s).

### Song rows

No visible change. The streamer is implied by the stream the performance belongs to. No badge needed on individual rows.

---

## Admin Import Flow

When a curator pastes a YouTube URL and clicks fetch:

1. **Extract `channelId` + `author`** from `videoDetails` in the already-fetched video page data.
2. **Check `streamer.json`** — does this `channelId` already exist?
3. **If new streamer detected:**
   - Fetch the YouTube channel page (`youtube.com/channel/{channelId}`) to scrape avatar URL, handle, description from `ytInitialData`.
   - Show a **"New streamer detected"** confirmation step with the fetched profile (avatar preview, display name, handle).
   - Curator can edit the fields before confirming.
   - On confirm → append to `streamer.json`.
4. **If existing streamer** → skip, proceed to extraction as normal.
5. **On import** → the new stream entry in `streams.json` gets `channelId` set automatically.

---

## Migration

One-time migration for existing data:

- **`data/streams.json`:** Add `channelId` to each existing stream by fetching the video page for each `videoId` to extract `videoDetails.channelId`.
- **`data/streamer.json`:** Populate from the discovered channels — fetch each channel page to scrape avatar, handle, description, social links.
- **`app/page.tsx`:** Update from single-object import (`import streamerData from '@/data/streamer.json'`) to array handling with multi-streamer support.
- **`lib/types.ts`:** Add `Streamer` interface, add `channelId` to `Stream`.

---

## Error Handling & Edge Cases

- **YouTube channel page scraping fails:** Show the "New streamer detected" confirmation with just `channelId` and author name (from video data). Avatar and description fields left empty for manual fill.
- **Streamer with no social links:** `socialLinks` uses empty strings for missing links. UI hides icons with no URL.
- **Orphaned streams (missing `channelId` after migration):** Frontend treats missing `channelId` as "unknown streamer" — songs still display, just don't appear under any streamer filter. Admin can fix manually.
- **Streamer removes their YouTube channel:** Data is static JSON — nothing breaks. Avatar URL may 404. Use gradient placeholder fallback for broken streamer avatars (same pattern as `AlbumArt` component).

---

## Testing

### Unit tests
- YouTube channel page parsing — extract channelId, avatar, handle from mock HTML.
- Streamer data writer — append new streamer, skip duplicate channelId.
- Stream migration — add channelId to existing streams.

### E2E tests
- Import a video from a new streamer → "New streamer detected" confirmation appears → confirm → streamer saved to `streamer.json`, stream has `channelId`.
- Import a video from existing streamer → no confirmation step, proceeds directly.
- Fan-facing page → streamer switcher filters songs correctly.
- Fan-facing page → multi-avatar header when "All" selected.

### Video verification
- After each E2E test → export `.webm` to `videos/`.
- `/verify-video` on each recording to confirm workflow matches expected behavior.
- `/compare-before-after-with-video` — record the fan-facing page before and after the multi-streamer change to verify no visual regressions.
