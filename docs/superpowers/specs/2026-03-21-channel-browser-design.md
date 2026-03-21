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
User pastes channel URL (youtube.com/@handle or /channel/UC...)
    ↓
extractChannelId() — parse URL → channelId or handle
    ↓
YouTube API: channels?part=contentDetails,snippet → uploadsPlaylistId + channel info
    ↓
YouTube API: playlistItems?playlistId=<uploadsId>&maxResults=50 (paginated, up to 5 pages)
    ↓ filter client-side by keywords (case-insensitive, title match)
  JP: 歌回, 歌枠, カラオケ, 歌ってみた, 歌配信
  ZH: 卡拉OK, 唱歌, 翻唱
  EN: karaoke, singing, song
    ↓
Show filtered stream list
Cross-reference Supabase `streams` table by video_id → show 已匯入 badge
    ↓
Click 匯入 → router.push('/admin/discover?url=https://youtube.com/watch?v=<id>')
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
│           1:45:30                    [匯入]  │
│                                              │
│  [thumb]  夏日歌枠             2025-08-12   │
│           2:10:00     [已匯入]      [匯入]  │
└──────────────────────────────────────────────┘
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

### `fetchChannelUploads(channelId, maxPages = 5)`

```ts
interface ChannelVideo {
  videoId: string;
  title: string;
  date: string;       // YYYY-MM-DD
  thumbnailUrl: string;
  durationSeconds?: number; // fetched separately if needed
}

async function fetchChannelUploads(
  channelId: string,
  maxPages = 5,
  keywords = KARAOKE_KEYWORDS,
): Promise<ChannelVideo[]>
```

Steps:
1. `channels?part=contentDetails&id=<channelId>` → get `uploadsPlaylistId`
2. Loop: `playlistItems?playlistId=<id>&maxResults=50&pageToken=<token>` until no `nextPageToken` or `maxPages` reached
3. Filter items where `title` contains any keyword (case-insensitive)
4. Return sorted newest-first

**Quota cost:** 1 (channels) + N×1 (playlistItems pages) = max 6 units per search.

### Discover page `?url=` param

On mount, read `searchParams.get('url')`. If present:
- Auto-fill the URL input
- Auto-trigger `handleFetchVideo()` after a short delay (100ms) to allow component initialization

## Keyword List

```ts
const KARAOKE_KEYWORDS = [
  // Japanese
  '歌回', '歌枠', 'カラオケ', '歌ってみた', '歌配信',
  // Chinese
  '卡拉OK', '唱歌', '翻唱',
  // English
  'karaoke', 'singing', 'song',
];
```

Hardcoded — not user-editable in v1.

## Navigation Entry Point

Add "瀏覽頻道" button to the admin dashboard streams tab header (next to "匯入歌曲").

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
