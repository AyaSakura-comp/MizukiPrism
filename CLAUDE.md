# MizukiPrism

Fan-facing song catalog and player for VTuber karaoke livestream archives. Deployed as a fully static site on GitHub Pages, backed by Supabase as the live database.

## Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL, anon key, RLS disabled)
- **CLI Tool**: Python 3.10+ (MizukiLens at `tools/mizukilens/`)
- **Icons**: Lucide React
- **E2E Tests**: Playwright (Chromium only, `tests/*.spec.ts`)
- **Python Tests**: pytest (`tools/mizukilens/tests/`)
- **Deployment**: GitHub Pages via GitHub Actions (`output: 'export'`)

## Project Structure

```
app/
├── page.tsx                  Fan-facing song catalog (~2400 lines)
├── layout.tsx                Root layout, imports globals.css
├── now-playing/page.tsx      Full-screen now-playing view
├── auth/page.tsx             Fan auth placeholder
├── admin/
│   ├── login/page.tsx        Admin login (localStorage password check)
│   ├── page.tsx              Admin dashboard — streams/songs CRUD
│   ├── discover/page.tsx     Import new streams from YouTube URL
│   ├── stamp/page.tsx        Timestamp marking UI for performances
│   ├── metadata/page.tsx     View metadata coverage (read-only, CLI for fetching)
│   └── deploy/page.tsx       Info page — explains Supabase is live, no deploy needed
├── components/
│   ├── AlbumArt.tsx          Reusable album art with gradient placeholder fallback
│   ├── MiniPlayer.tsx        Bottom mini player bar
│   ├── NowPlayingModal.tsx   Full modal with lyrics + controls
│   ├── NowPlayingControls.tsx Playback controls (play/pause/skip/shuffle)
│   ├── QueuePanel.tsx        Queue sidebar
│   ├── SyncedLyrics.tsx      LRC karaoke-style synced lyrics display
│   ├── PlaylistPanel.tsx     User playlist sidebar
│   ├── LikedSongsPanel.tsx   Liked songs sidebar
│   ├── RecentlyPlayedPanel.tsx Recently played sidebar
│   ├── SidebarNav.tsx        Left sidebar navigation
│   ├── YouTubePlayerContainer.tsx Hidden YouTube iframe (reused across tracks)
│   ├── PlayerWrapper.tsx     Wraps player iframe + mini player
│   ├── Toast.tsx             Notification toast
│   ├── VolumeControl.tsx     Volume slider
│   ├── UpNextSection.tsx     Up next queue display
│   ├── AddToPlaylistDropdown.tsx Dropdown to add song to playlist
│   └── CreatePlaylistDialog.tsx Dialog to create new playlist
├── contexts/
│   ├── PlayerContext.tsx     YouTube player state, playback, queue, shuffle
│   ├── PlaylistContext.tsx   User playlists (localStorage)
│   ├── LikedSongsContext.tsx Liked songs (localStorage)
│   ├── RecentlyPlayedContext.tsx Recently played (localStorage)
│   └── FanAuthContext.tsx    Fan auth context (unused/placeholder)
lib/
├── config.ts                 Supabase URL/anon key + YouTube API key (hardcoded)
├── supabase.ts               Supabase client singleton
├── supabase-data.ts          Read-only Supabase queries (loadSongs, loadStreams, loadStreamers, loadMetadata, loadLyrics)
├── supabase-admin.ts         Admin write operations (createStream, importStreamWithSongs, saveStreamer, etc.)
├── types.ts                  Data models (Song, Performance, Stream, SongMetadata, SongLyrics, ArtistInfo, LyricLine)
├── lyrics.ts                 LRC parser (parseLRC, getActiveLyricIndex)
├── utils.ts                  General utilities (validateYoutubeUrl, extractVideoId, timestampToSeconds, etc.)
├── youtube-api.ts            YouTube Data API v3 client (browser-safe, uses API key)
├── data.ts                   Legacy data utilities (kept for compatibility)
└── admin/
    ├── extraction.ts         parseTextToSongs, findCandidateComment, parseSongLine
    ├── youtube.ts            Innertube scraping (server-side only — fetchVideoPage, fetchComments, fetchChannelProfile)
    ├── metadata.ts           Deezer + LRCLIB API clients
    ├── data-writer.ts        File I/O for JSON data files (legacy, pre-Supabase)
    └── git.ts                Git service (legacy, pre-Supabase)
data/                         Legacy static JSON files (kept but no longer used by frontend)
├── songs.json
├── streams.json
├── streamer.json
└── metadata/
    ├── song-metadata.json
    ├── song-lyrics.json
    └── artist-info.json
tools/mizukilens/             Python CLI for metadata pipeline
├── src/mizukilens/
│   ├── cli.py                Click CLI entry point
│   ├── metadata.py           Deezer + LRCLIB API clients, metadata file I/O
│   └── ...
└── tests/
```

## Commands

### Frontend

```bash
npm run dev          # Dev server on localhost:3000
npm run dev:clean    # Clear .next cache and restart (use when DB data changes aren't reflecting)
npm run build        # Production build — all routes must be ○ (static), no ƒ (server)
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests (lib/admin/__tests__/)
npx playwright test  # E2E tests (requires dev server running on port 3000)
```

### MizukiLens CLI

```bash
cd tools/mizukilens
.venv/bin/python3 -m pytest tests/ -v   # Run Python tests (840+)
.venv/bin/pip install -e .              # Install in dev mode
mizukilens metadata fetch --missing     # Fetch album art + lyrics for new songs
mizukilens metadata status              # View metadata coverage
mizukilens metadata override <id>       # Manual override
mizukilens metadata clear <id>          # Clear metadata entry
```

The Python venv is at `tools/mizukilens/.venv/`. Use `.venv/bin/python3` to run tests, not system `python3`.

## Architecture

### Data Flow

```
YouTube Video
    ↓
/admin/discover (paste URL)
    ↓
YouTube Data API v3 (lib/youtube-api.ts) — fetches title, date, channelId
    ↓
YouTube Comments API — fetches top comments
    ↓
findCandidateComment + parseTextToSongs (lib/admin/extraction.ts)
    — strips HTML (<br> → \n, removes <a> tags) before parsing
    ↓
iTunes API (supabase-admin.ts fetchItunesDuration) — enriches missing end timestamps
    ↓
importStreamWithSongs (lib/supabase-admin.ts) — upserts stream + songs + performances
    ↓
Supabase PostgreSQL
    ↓
loadSongs / loadStreams / loadStreamers (lib/supabase-data.ts) — fan page reads
    ↓
app/page.tsx — merges data, renders catalog
```

### Supabase Schema

Tables (RLS disabled on all):
- **streamers**: `channel_id` (PK), `handle`, `display_name`, `avatar_url`, `description`, `social_links` (jsonb)
- **streams**: `id`, `title`, `date`, `video_id`, `youtube_url`, `channel_id` (FK→streamers), `credit_author`, `credit_author_url`, `credit_comment_url`
- **songs**: `id`, `title`, `original_artist`, `tags` (array)
- **performances**: `id`, `song_id` (FK→songs), `stream_id` (FK→streams), `date`, `stream_title`, `video_id`, `timestamp_sec`, `end_timestamp_sec`, `note`
- **song_metadata**: `song_id` (FK→songs), `fetch_status`, `album_art_url`, `album_art_small/medium/big/xl`, `album_title`, `itunes_track_id`, `track_duration`, `fetched_at`, `last_error`
- **song_lyrics**: `song_id` (FK→songs), `fetch_status`, `synced_lyrics` (LRC), `plain_lyrics`, `fetched_at`, `last_error`

No unique constraint on `performances(stream_id, timestamp_sec)` — duplicate check is done manually with SELECT before INSERT in `importStreamWithSongs`.

### Admin Auth

Purely client-side localStorage check. Password `mizuki-admin` is hardcoded in `lib/supabase-admin.ts`. No server, no cookies, no JWT. Adequate for a single-curator tool with no sensitive data.

### YouTube API

Two separate YouTube clients exist:
- `lib/youtube-api.ts` — Uses YouTube Data API v3 with an API key. **Browser-safe** (CORS allowed). Used in `/admin/discover`. Key is HTTP-referrer restricted in Google Cloud Console (allowed: `localhost:*/*`, `https://prism.mizuki.tw/*`).
- `lib/admin/youtube.ts` — Uses YouTube's internal Innertube API by scraping `ytInitialData` from HTML pages. **Server-side only** (no CORS). Used by MizukiLens CLI tools.

### Streamer Filter

- Filter buttons on fan page are derived from `streamersWithSongs` — only streamers that have at least one performance in the loaded song catalog are shown.
- `streamChannelMap` (streamId → channelId) is built from the live `streams` Supabase state, not from static JSON.
- Filter is multi-select (clicking multiple streamers shows union of their songs).

### YouTube Comment Parsing

YouTube Data API v3 returns `textDisplay` in HTML format — timestamps are inside `<a href="...&t=684">0:11:24</a>` tags, lines separated by `<br>`. The `stripHtml()` function in `discover/page.tsx` converts `<br>` to `\n` and strips all tags before passing to `parseTextToSongs`.

### Player

- Single hidden YouTube iframe (`YouTubePlayerContainer.tsx`) persists across track switches — uses `loadVideoById` to avoid reloading the YouTube script on every play.
- `PlayerContext` manages: current track, queue, shuffle, skip, timestamp seeking, unavailable video detection.
- Liked songs, playlists, recently played — all stored in `localStorage` (client-side only, fan-specific).

## Deployment

### GitHub Pages

- URL: `https://ayasakura-comp.github.io/MizukiPrism/`
- Triggered automatically on every push to `master` via `.github/workflows/deploy.yml`
- Build: `npm ci && npm run build` → uploads `out/` directory
- **Critical**: `next.config.ts` sets `basePath: "/MizukiPrism"` and `assetPrefix: "/MizukiPrism/"` in production. Without these, all `/_next/static/...` asset paths 404 because the site lives at a subdirectory, not the root.

```ts
// next.config.ts
const isProd = process.env.NODE_ENV === "production";
const nextConfig = {
  output: "export",
  basePath: isProd ? "/MizukiPrism" : "",
  assetPrefix: isProd ? "/MizukiPrism/" : "",
};
```

- No server-side rendering. All routes are `○` (static). No API routes — they are incompatible with `output: 'export'`.
- Supabase credentials are hardcoded in `lib/config.ts` and baked into the static JS bundle. The anon key is safe to expose (it's a publishable key). The YouTube API key is referrer-restricted.

### Local Dev vs Production

| | Local (`npm run dev`) | Production (GitHub Pages) |
|---|---|---|
| Base path | `/` | `/MizukiPrism/` |
| CSS/JS paths | `/_next/static/...` | `/MizukiPrism/_next/static/...` |
| Data source | Supabase (live) | Supabase (live) |
| Admin auth | localStorage | localStorage |

## Conventions

### Git

- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- One concern per commit
- Run `lineguard <files>` before committing to fix format issues
- Pre-commit hooks auto-run format, lint, and test checks

### Frontend

- All components use `'use client'` directive (no server components)
- CSS variables for theming: `--accent-pink`, `--bg-surface-frosted`, `--text-secondary`, `--text-tertiary`
- Glassmorphism UI: `backdrop-blur-xl`, `bg-white/80`, semi-transparent borders
- Tailwind classes + inline styles with CSS vars
- Gradient placeholder pattern for missing album art (see `AlbumArt.tsx`)
- Metadata loaded at page init, lyrics lazy-loaded on first open
- `useMemo` dependencies must include Supabase state variables (not static JSON imports) — a past bug had `streamChannelMap` depending on `[]` instead of `[streams]`

### Python CLI

- Click for CLI commands, Rich for progress bars and tables
- Follow existing patterns in `cli.py` when adding commands
- All API clients mock external calls in tests (no live API hits)
- `data/metadata/` files are JSON arrays, read/written atomically

## Known Rabbit Holes

### 1. `output: 'export'` breaks API routes
Next.js API routes (`app/api/`) are completely incompatible with `output: 'export'`. They silently fail during build or cause routes to be skipped. All data operations must be client-side (direct Supabase calls). If you need server logic, you'd need to switch to a different hosting platform (Vercel, Netlify) and remove `output: 'export'`.

### 2. YouTube API key HTTP referrer restriction
The YouTube Data API key (`lib/config.ts`) has HTTP referrer restrictions in Google Cloud Console. If you test from a new origin (new port, new domain, CI environment), you'll get `403 "Requests from referer X are blocked"`. Fix: add the new origin to allowed referrers at console.cloud.google.com → APIs & Services → Credentials.

### 3. `lib/admin/youtube.ts` is server-side only
The Innertube scraping functions (`fetchVideoPage`, `fetchComments`, `fetchChannelProfile`) fetch directly from `youtube.com` and will be blocked by CORS if called from the browser. They are intended for use in the MizukiLens CLI (Node.js). Do not import them in any `'use client'` component.

### 4. No unique constraint on performances
`performances(stream_id, timestamp_sec)` has no DB-level unique constraint. Duplicate check in `importStreamWithSongs` is done manually with a SELECT. If two imports race, duplicates can be created. Upsert with `onConflict` will fail with an error if attempted.

### 5. `streamersData` / `streamsData` static JSON imports (legacy)
`data/songs.json`, `data/streams.json`, `data/streamer.json` still exist in the repo but are **no longer used by the frontend**. They are legacy artifacts from before the Supabase migration. Do not add new imports of these files — use `lib/supabase-data.ts` functions instead.

### 6. `useMemo` with empty dependency arrays
Several `useMemo` hooks that depend on async-loaded Supabase state were originally written with `[]` (runs once on mount, before data loads). Always ensure Supabase state variables are listed as dependencies. Past bug: `streamChannelMap` used `streamsData` (static import) instead of `streams` (Supabase state), causing the streamer filter to always show 0 results.

### 7. YouTube comment HTML format
YouTube Data API v3 `textDisplay` field returns HTML, not plain text. Line breaks are `<br>`, timestamps are wrapped in `<a href="...&t=NNN">HH:MM:SS</a>`. Always call `stripHtml()` (defined in `discover/page.tsx`) before passing comment text to `parseTextToSongs`.

### 8. `basePath` breaks local routing if set unconditionally
If `basePath: "/MizukiPrism"` is set without the `isProd` guard, all local dev routes break (e.g., `localhost:3000` becomes `localhost:3000/MizukiPrism`). Always gate on `process.env.NODE_ENV === 'production'`.

### 9. Admin auth is not secure
The admin password (`mizuki-admin`) is hardcoded in `lib/supabase-admin.ts` and visible in the JS bundle. Anyone can read it from the built JS. This is acceptable because the Supabase anon key allows the same writes anyway (RLS disabled). Do not store genuinely sensitive data or use this auth pattern for anything beyond casual protection.

## Testing & Verification

### Unit Tests

Run `npm run test:unit` for Vitest tests in `lib/admin/__tests__/`. These cover extraction, YouTube parsing, data-writer, metadata, and git services. All use mock data — no live API calls.

### E2E Tests

Playwright tests live in `tests/*.spec.ts`. Key test files:
- `tests/e2e-verify.spec.ts` — 3 core flows: fan page playback, admin login, discover import
- `tests/discover-kirali-manual.spec.ts` — import `TGuSYMpwepw` via discover UI
- `tests/core-001.spec.ts` — core fan-facing page assertions

### E2E Video Recording & Verification Flow

When adding or modifying UI features, verify changes with permanent E2E video recordings:

1. **Configuration**: Confirm `playwright.config.ts` has `video: 'on'` and `outputDir: 'test-results'`.
2. **Start Dev Server**: Use `npm run dev` (or `npm run dev:clean` if Supabase data was changed).
3. **Run Playwright Test(s)**: Execute the specific E2E test file.
4. **Export Videos**: Copy `.webm` files from `test-results/` to `videos/`. Rename descriptively.
5. **Visual Verification**: Use `/verify-video` to send the `.webm` to Gemini CLI for analysis.

### Cache Troubleshooting

If the dev server shows errors after data changes, the `.next` cache may be stale:

```bash
npm run dev:clean    # Clears .next cache and restarts dev server
```
