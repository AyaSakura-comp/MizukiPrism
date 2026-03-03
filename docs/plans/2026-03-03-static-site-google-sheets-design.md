# Design: Fully Static Site with Google Sheets Backend

**Date:** 2026-03-03
**Status:** Approved

## Motivation

Deploy MizukiPrism as a pure static site on GitHub Pages with no backend server. Use Google Sheets as a live data store so fans see updates immediately without rebuilding/redeploying the site.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Google Sheet (source of truth)       │
│  ┌────────────┬─────────┬──────────┬───────────┐ │
│  │Performances│ Streams │Streamers │ Metadata  │ │
│  │  (flat)    │         │          │ & Lyrics  │ │
│  └────────────┴─────────┴──────────┴───────────┘ │
└─────────┬────────────────────────┬───────────────┘
          │ read (API key)         │ read+write (API key)
          ▼                        ▼
 ┌─────────────────┐     ┌──────────────────────┐
 │  Fan site        │     │  Admin UI             │
 │  (static pages)  │     │  (static, hidden URL) │
 │                  │     │                        │
 │  - Sheets API    │     │  - YouTube Data API v3 │
 │    for song data │     │    (fetch comments,    │
 │  - YouTube embed │     │     video info)        │
 │    for playback  │     │  - Sheets API          │
 │                  │     │    (write new songs)   │
 └─────────────────┘     └────────────────────────┘

Both deployed as static HTML/JS on GitHub Pages.
Zero backend. All API calls from browser.
```

## Key Decisions

### Data Store: Google Sheets
- Google Sheet is the single source of truth (replaces `data/*.json` files)
- Sheet is publicly readable; anyone with the link can edit (simple API-key auth)
- Version history in Google Sheets serves as safety net for accidental edits
- Fan site fetches data at runtime — no rebuild needed for data updates

### Data Structure: Flat Performances Table
One row per performance instead of nested JSON. Frontend groups by `songId` to reconstruct the current nested structure.

**Tabs:**

| Tab | Columns |
|-----|---------|
| **Performances** | songId, title, originalArtist, tags, streamId, date, videoId, timestamp, endTimestamp, note |
| **Streams** | id, channelId, title, date, videoId, youtubeUrl, creditAuthor, creditAuthorUrl, creditCommentUrl |
| **Streamers** | channelId, handle, displayName, avatarUrl, description, youtube, twitter, facebook, instagram, twitch |
| **Metadata** | songId, albumArt, artistImageUrl, ... |
| **Lyrics** | songId, syncedLyrics, plainLyrics |

### API Access: Google Sheets API v4 + YouTube Data API v3 + iTunes API
- **Sheets API v4** — fan site reads data, admin UI reads+writes data
- **YouTube Data API v3** — admin UI fetches video info, comments, channel profile (replaces server-side scraping)
- **iTunes API** — song durations and album art (free, no API key, CORS-friendly)
- **LRCLIB API** — lyrics (free, no API key, CORS-friendly)
- Single Google Cloud API key, restricted by domain + API scope
- Free quotas: Sheets 300 req/min, YouTube 10,000 units/day — more than sufficient
- Exceeding quota returns 429 errors (no auto-billing)
- YouTube search endpoint is NOT used (saves 100 units/call) — iTunes handles durations instead

### YouTube Data API v3 Replaces Scraping

| Current (server-side scrape) | New (client-side API) |
|-----|---------|
| Scrape video page HTML for title/duration | YouTube Data API: `GET /videos?part=snippet,contentDetails&id={videoId}` |
| Scrape innertube API for comments | YouTube Data API: `GET /commentThreads?part=snippet&videoId={videoId}` |
| Scrape search results for song duration | **iTunes API**: `GET /search?term={artist+title}&media=music` (free, no quota) |
| Scrape channel page for profile | YouTube Data API: `GET /channels?part=snippet&id={channelId}` |

### Admin Protection: Hidden URL
- Admin UI deployed at a non-obvious path (e.g., `/admin-{random}`)
- No server-side auth (static site)
- Sheet is "anyone with link can edit" — risk accepted for simplicity
- Google Sheets version history allows rollback if needed

### Static Export: Next.js `output: 'export'`
- Already configured in `next.config.ts`
- Produces `out/` directory for GitHub Pages deployment

## What Gets Removed

- All Next.js API routes (`app/api/`)
- `middleware.ts`
- Server-side YouTube scraping (`lib/admin/youtube.ts` scraping/innertube logic)
- `fs.readFileSync` data loading (`lib/data.ts`)
- Local JSON files as source of truth (`data/*.json` become optional backups)

## What Stays

- Fan-facing UI components (player, queue, lyrics, album art, etc.)
- Song extraction/parsing logic (Kirali comment timestamp parsing)
- Next.js static export for page shell
- MizukiLens Python CLI (unchanged, still useful for batch operations)

## What's New

- `lib/sheets.ts` — Google Sheets API client (read/write)
- `lib/youtube-api.ts` — YouTube Data API v3 client (replaces scraping)
- `lib/config.ts` — API key and Sheet ID constants
- Frontend data layer rewritten to fetch from Sheets instead of API routes
- Admin UI rewritten to use Sheets API for writes + YouTube Data API for discovery

## Google Cloud Setup Steps

1. Create project at console.cloud.google.com
2. Enable Google Sheets API + YouTube Data API v3
3. Create API key under Credentials
4. Restrict key: HTTP referrers (GitHub Pages domain + localhost), API scope (Sheets + YouTube only)
5. Create Google Sheet with tabs: Performances, Streams, Streamers, Metadata, Lyrics
6. Set Sheet sharing to "Anyone with the link can edit"
7. Store API key + Sheet ID in `lib/config.ts`

## Quotas & Costs

| API | Free Quota | Typical Usage |
|-----|-----------|---------------|
| Sheets API | 300 req/min | ~3-4 reads per fan page load |
| YouTube Data API v3 | 10,000 units/day | ~3 units per stream import (video info + comments + channel) |
| iTunes API | No quota (free) | Song durations + album art, rate-limited 3s between calls |
| LRCLIB API | No quota (free) | Lyrics, rate-limited 200ms between calls |

No auto-billing. Exceeding quota = 429 error, not charges. YouTube search endpoint is NOT used (saves 100 units/call).
