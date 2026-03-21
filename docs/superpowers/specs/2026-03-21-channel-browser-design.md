# Channel Browser — Design Spec

**Date:** 2026-03-21
**Status:** Approved

## Overview

A new `/admin/channel` page that lets the admin paste a YouTube channel URL, auto-fetch all karaoke/singing streams from that channel, and click any stream to open the existing `/admin/discover` import flow.

## Goals

- Eliminate the manual step of finding individual stream URLs
- Reuse the existing discover page for actual song extraction and import
- Stay within YouTube Data API v3 quota (browser-safe, no server needed)

## Data Flow

```
User pastes channel URL
    ↓
extractChannelInput(url) → { type: 'id' | 'handle', value: string }
  - youtube.com/channel/UCxxx → { type: 'id', value: 'UCxxx' }
  - youtube.com/@handle       → { type: 'handle', value: 'handle' }
    ↓
YouTube API: channels?part=contentDetails,snippet
  - type 'id'     → &id=<channelId>
  - type 'handle' → &forHandle=<handle>
  → uploadsPlaylistId + channel info (displayName, avatar, handle)
    ↓
On mount: loadStreams() from Supabase → build Set<string> of known video_ids (已匯入 lookup)
    ↓
YouTube API: playlistItems?playlistId=<uploadsId>&maxResults=50 (paginated, up to 5 pages)
  → show progressive loading: "載入中... (第 N 頁)"
    ↓ filter client-side by keywords (case-insensitive, title match)
  JP: 歌回, 歌枠, カラオケ, 歌ってみた, 歌配信
  ZH: 卡拉OK, 唱歌, 翻唱
  EN: karaoke (remove generic 'song'/'singing' to avoid false positives)
    ↓
Show filtered stream list (no duration column — playlistItems doesn't include it)
已匯入 badge: check videoId against Set<string> from loadStreams()
    ↓
Click 匯入 → router.push(`/admin/discover?url=${encodeURIComponent(youtubeUrl)}`)
```

## UI Layout

```
/admin/channel

┌─ Input ──────────────────────────────────────┐
│  [youtube.com/@mizukiTW              ] [搜尋] │
└──────────────────────────────────────────────┘

┌─ Channel header (after fetch) ───────────────┐
│  [avatar]  MizukiTW  @mizukiTW               │
│  找到 12 部歌回直播                            │
└──────────────────────────────────────────────┘

┌─ Stream list ────────────────────────────────┐
│  [thumb]  秋日歌回 #3          2025-10-05    │
│                                      [匯入]  │
│                                              │
│  [thumb]  夏日歌枠             2025-08-12   │
│                       [已匯入]      [匯入]  │
└──────────────────────────────────────────────┘
(No duration column — playlistItems API does not return duration)
```

- Streams sorted newest-first
- 已匯入 badge shown for streams already in Supabase (still clickable to re-import)
- Clicking 匯入 navigates to `/admin/discover?url=<youtubeUrl>`

## Files Changed

### New
- `app/admin/channel/page.tsx` — channel browser page

### Modified
- `lib/youtube-api.ts` — add `fetchChannelUploads(channelId, maxPages?)` returning filtered video list
- `app/admin/discover/page.tsx` — read `?url=` query param on mount, auto-fill and trigger fetch
- `app/admin/page.tsx` — add "瀏覽頻道" button in streams tab header

## API Design

### `extractChannelInput(url: string)`

```ts
type ChannelInput = { type: 'id'; value: string } | { type: 'handle'; value: string };

function extractChannelInput(url: string): ChannelInput | null
```

- `youtube.com/channel/UCxxx` → `{ type: 'id', value: 'UCxxx' }`
- `youtube.com/@handle` → `{ type: 'handle', value: 'handle' }`
- Returns `null` for unrecognized formats → show error "請輸入有效的 YouTube 頻道網址"

### `fetchChannelUploads(input, onProgress, maxPages = 5)`

**Do NOT call the existing `fetchChannelInfo` here** — it only supports `part=snippet&id=`. Instead, make a new channels call with `part=contentDetails,snippet` inside this function.

```ts
interface ChannelVideo {
  videoId: string;
  title: string;
  date: string;       // YYYY-MM-DD from snippet.publishedAt (close enough for display; liveStreamingDetails.actualStartTime would require extra quota)
  thumbnailUrl: string;
  // No duration — playlistItems API does not return it
}

async function fetchChannelUploads(
  input: ChannelInput,
  onProgress: (page: number) => void,
  maxPages = 5,
  keywords = KARAOKE_KEYWORDS,
): Promise<{ channel: ChannelInfo; videos: ChannelVideo[] }>
```

Steps:
1. `channels?part=contentDetails,snippet&id=<value>` (type 'id') or `&forHandle=<value>` (type 'handle') → extract `uploadsPlaylistId` from `contentDetails.relatedPlaylists.uploads`; build `ChannelInfo` from `snippet` (using the existing `ChannelInfo` interface shape — `uploadsPlaylistId` is a local variable only, not returned).
2. Call `onProgress(page)` before each page fetch so UI can show "載入中... (第 N 頁)"; on partial failure, return videos fetched so far with a `partialError: string` flag in the return type.
3. Loop: `playlistItems?playlistId=<id>&maxResults=50&pageToken=<token>` until no `nextPageToken` or `maxPages` reached
4. Filter items where `title` contains any keyword (case-insensitive); full-width karaoke variants not handled — acceptable in v1
5. Return sorted newest-first

**Quota cost:** 1 (channels) + N×1 (playlistItems pages) = max 6 units per search.

### Discover page `?url=` param

On mount, read `decodeURIComponent(searchParams.get('url') ?? '')`. If present:
- Auto-fill the URL input state
- Wrap `handleFetchVideo` in `useCallback` with its dependencies so it is stable
- Trigger it inside a `useEffect([authenticated, urlParam, handleFetchVideo])` — only fires when `authenticated === true`

### 已匯入 known limitation

The `importedVideoIds` Set is built once on mount and is not refreshed when the user imports a stream from the discover page and navigates back. This means a newly imported stream will not show the 已匯入 badge until the page is hard-reloaded. Acceptable in v1 — document as known limitation.

### Channel browser `?url=` navigation

```ts
router.push(`/admin/discover?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`)
```

### 已匯入 cross-reference

On mount, call `loadStreams()` from `lib/supabase-data.ts`. Build:
```ts
const importedVideoIds = new Set(streams.map(s => s.video_id));
```
Use `importedVideoIds.has(videoId)` to show the 已匯入 badge.

## Keyword List

```ts
const KARAOKE_KEYWORDS = [
  // Japanese
  '歌回', '歌枠', 'カラオケ', '歌ってみた', '歌配信',
  // Chinese
  '卡拉OK', '唱歌', '翻唱',
  // English — only 'karaoke' to avoid false positives from 'song'/'singing'
  'karaoke',
];
```

Hardcoded — not user-editable in v1.

## Navigation Entry Point

Add "瀏覽頻道" button to the admin dashboard streams tab header (next to "匯入歌曲"). Clicking it calls `router.push('/admin/channel')`.

## Error Handling

| Scenario | Behavior |
|---|---|
| Invalid URL format | Inline error: "請輸入有效的 YouTube 頻道網址" |
| Channel not found | Inline error: "找不到此頻道" |
| No matching streams | Empty state: "此頻道目前沒有符合的歌回直播" |
| API quota exceeded | Inline error with raw API message |
| Pagination partial fail | Show results fetched so far + warning |

## Testing

- Unit test `fetchChannelUploads` with mocked API responses (keyword filtering, pagination)
- E2E: paste channel URL → verify stream list renders with 已匯入 badges → click 匯入 → verify discover page loads with pre-filled URL
