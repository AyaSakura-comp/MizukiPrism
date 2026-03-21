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
│   ├── page.tsx              Admin dashboard — streams/songs CRUD; "新增直播場次" navigates to /admin/discover; "瀏覽頻道" navigates to /admin/channel
│   ├── discover/page.tsx     Import new streams from YouTube URL (with embedded preview player); reads ?url= param on mount to auto-fill and trigger fetch
│   ├── channel/page.tsx      Channel browser — paste YouTube channel URL, auto-fetch karaoke streams, click to open discover
│   ├── stamp/page.tsx        Timestamp marking UI for performances
│   ├── metadata/page.tsx     View metadata coverage (read-only, CLI for fetching)
│   ├── deploy/page.tsx       Info page — explains Supabase is live, no deploy needed
│   └── components/
│       └── AdminHeader.tsx   Shared sticky nav bar used by admin/discover and admin/channel pages (logo, nav buttons, logout)
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
    ├── metadata.ts           iTunes + LRCLIB API clients
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
iTunes API primary → MusicBrainz fallback (supabase-admin.ts) — enriches missing end timestamps + artist names
    ↓
Discover review table — shows provenance badges for duration and artist (iTunes/MusicBrainz/comment/none)
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

`extractVideoId` in both `lib/utils.ts` and `lib/admin/youtube.ts` supports:
- `youtube.com/watch?v=ID`
- `youtu.be/ID`
- `youtube.com/live/ID` (including `?si=` suffix)
- `youtube.com/embed/ID` (admin/youtube.ts only)

### Discover Page Preview Player

When in the review step (YouTube URL mode), the discover page shows a responsive layout:
- **Mobile**: Player card stacked full-width at top (sticky), song list below
- **Desktop (lg:)**: Two-column layout — sticky 400px player card on left, song list on right

Player card has:
- `↺ 重新載入播放器` button to destroy and recreate the YouTube iframe if it fails to load (increments `playerReloadKey` state)
- Keyboard shortcut tips panel (visible in YouTube URL mode only): ←/→ ±1s, Shift+←/→ ±5s, Space play/pause, ↺ reset

Player is initialized by polling `window.YT?.Player` (avoids React state batching race). Uses a `useRef` container with a dynamically-appended child div so React re-renders don't detach the YT iframe.

**Live end-timestamp sync**: While the player is playing, the active song's end-timestamp input updates every 500ms to match the current player time. `activeSongIndexRef` (a ref mirroring `activeSongIndex` state) is used inside the interval to avoid stale closure. Locked songs are skipped by the interval.

End-timestamp input keyboard workflow (while focused):
- **Type timestamp** → debounced 400ms seek; player jumps to typed time
- **Blur** → cancels pending debounce (no seek fires)
- **←/→** → nudge ±1s; input value syncs back after 80ms
- **Shift+←/→** → nudge ±5s; input value syncs back
- **Space** → play/pause (no space typed into input)
- **↺ button (還原)** → restores API-detected (iTunes/MusicBrainz) end-timestamp AND clears `activeSongIndex` so live-sync stops overwriting the restored value; also clears lock
- **Focus** → seeks player to existing end time

**End-timestamp lock** (`lockedEndTimestamps: Set<number>` + `lockedEndTimestampsRef`):
- 🔒/🔓 button next to end-timestamp input — toggles lock per song
- Locked songs are skipped by live-sync interval
- **Auto-lock on pause**: when player transitions playing→paused, active song auto-locks
- **Auto-unlock on play**: when player transitions paused→playing, active song auto-unlocks
- Lock clears when `resetSong()` is called; indices shift correctly when a song is deleted
- **Race condition note**: `onStateChange` YouTube event (states 1/3 → playing, 2/0 → paused) is the authoritative source for `isPreviewPlaying`. A `manualToggleTimeRef` 1-second cooldown prevents the polling interval from overriding state immediately after a manual toggle. `seekPreview()` immediately stamps the cooldown and sets `isPreviewPlaying=true` to avoid stale state in headless environments where buffering (state 3) is the first observed state.

**Visual change indicators**:
- End-timestamp input turns **pink** when value differs from iTunes/MusicBrainz detected original
- ↺ reset button turns **pink** when end differs from original, signalling it can restore the detected value
- `originalSongsRef` stores the pre-enrichment snapshot; must be kept in sync with `songs` array (filtered in `removeSong` alongside `setSongs`)

Mobile song rows use a two-line layout (`flex-col sm:flex-row`): timestamps + badge on line 1, song name / artist on line 2.

**Space key focus trap**: The review step wraps all content in a focusable `<div tabIndex={0}>` (`reviewFocusTrapRef`). Auto-focuses on step entry. Clicking outside inputs/buttons refocuses the container so Space always reaches the `onKeyDown` handler. Native `keydown` listener prevents Space-induced scroll; React `onKeyDown` calls `togglePreviewPlayPause()`. Skips only `INPUT`/`TEXTAREA` — buttons are NOT skipped (see rabbit hole #11).

Manual mode (videoId starts with `manual`): no player, single-column layout.

### Streamer Filter

- Filter buttons on fan page are derived from `streamersWithSongs` — only streamers that have at least one performance in the loaded song catalog are shown.
- Filter only renders when `streamersWithSongs.length > 1` — a single streamer shows no filter buttons.
- `streamChannelMap` (streamId → channelId) is built from the live `streams` Supabase state, not from static JSON.
- Filter is multi-select (clicking multiple streamers shows union of their songs).
- The fan page hero section is a **carousel** that auto-rotates every 5s across all streamers (both mobile and desktop). Only activates when `streamers.length > 1`. Uses `currentHeroIndex` state with CSS `translateX` transition.

### Duration & Artist Enrichment in Discover

The discover page enriches songs missing end timestamps **and** artist names using a two-tier API fallback:

1. **iTunes API** (primary) — `fetchItunesSongInfo()` in `lib/supabase-admin.ts`. Searches `itunes.apple.com/search` with `country=JP`. 3s rate limit. Returns `{ durationSeconds, artistName }`.
2. **MusicBrainz API** (fallback) — `fetchMusicBrainzSongInfo()` in `lib/supabase-admin.ts`. 1.1s rate limit. Returns `{ durationSeconds, artistName }`. Searches without artist if none provided.

Each song in the review table shows **provenance badges**:
- **Duration badge** (`durationSource`): Blue `iTunes` / Violet `MusicBrainz` / Green `comment` / Gray `none`
- **Artist badge** (`artistSource`): Blue `iTunes` / Violet `MusicBrainz` — only shown when artist was enriched from API (not shown for `comment` or `none`)

Both `durationSource` and `artistSource` are UI-only (not persisted to Supabase). Badge colors use `violet` not `purple` because Tailwind's purple palette is overridden by custom CSS variables in `tailwind.config.ts`.

### Channel Browser (`/admin/channel`)

- Paste any YouTube channel URL (supports `/channel/UC...`, `/@handle`, `?si=` suffix, URL-encoded CJK handles)
- `extractChannelInput()` in `lib/youtube-api.ts` parses the URL into `{ type: 'id' | 'handle', value }` — decodes pathname with `decodeURIComponent` before matching
- `fetchChannelUploads()` fetches uploads playlist via YouTube Data API v3, filters by `KARAOKE_KEYWORDS` (JP/ZH/EN), sorts newest-first, supports pagination with progress callback
- Shows existing streamers as **avatar cards** below the URL input — clicking auto-fills the URL and triggers fetch; a "← 返回" button appears in channel header to go back to cards
- Each stream row shows thumbnail, title, date, 已匯入 badge (if already in DB), and 匯入 button
- Import button navigates to `/admin/discover?url=<youtubeUrl>&from=channel&channelUrl=<channelUrl>` — discover page reads `?url=` on mount and auto-triggers fetch
- **Back navigation**: discover page reads `?from=channel&channelUrl=` params; back button returns to `/admin/channel?url=<channelUrl>` which re-triggers channel fetch automatically
- New streamers: discover page detects `isNewStreamer: true`, fetches channel profile, shows confirmation dialog before calling `saveStreamer()`
- E2E tests: `tests/channel-browser.spec.ts`

### Shared Admin Header

`app/admin/components/AdminHeader.tsx` provides a unified sticky nav bar used by the channel browser and discover pages. Contains: MizukiPrism logo (→ /admin), 中繼資料 (→ /admin/metadata), 標記時間 (→ /admin/stamp), 粉絲頁面 (→ /), 發布更改 (→ /admin/deploy), 登出 (calls `logout()` + redirect to /admin/login).

**Responsive layout**: Desktop (`md+`) shows all nav buttons inline. Mobile (`<md`) collapses to logo + hamburger menu icon (`Menu`/`X` from Lucide) that toggles a vertical dropdown with all nav items. Uses `useState` for menu open/close state; navigating closes the menu automatically.

### YouTube Comment Parsing

YouTube Data API v3 returns `textDisplay` in HTML format — timestamps are inside `<a href="...&t=684">0:11:24</a>` tags, lines separated by `<br>`. The `stripHtml()` function in `discover/page.tsx` converts `<br>` to `\n` and strips all tags before passing to `parseTextToSongs`.

**Comment format handling in `lib/admin/extraction.ts`**:
- `stripNonSonglistSections()` truncates text at 【時間軸】/【Timestamp】/etc. section headers before parsing — prevents chat highlight lines from being misread as songs
- `parseSongLine()` strips mathematical bold/fullwidth digit prefixes (𝟎𝟏., 𝟎𝟐.) common in CJK song lists
- `parseSongLine()` skips lines starting with `└`, `├`, `│` (tree sub-entries = alternate/previous versions, not main songs)

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

### 9. Tailwind custom colors override default palette
`tailwind.config.ts` defines custom `purple` as `var(--accent-purple)`, which replaces the entire default purple scale. `bg-purple-200`, `text-purple-800` etc. won't work — use `violet` instead for standard Tailwind purple shades.

### 10. `findCandidateComment` can pick chat logs instead of song lists
Some YouTube streams have timestamped chat log comments (e.g., 129 lines of viewer messages). `findCandidateComment` treats these as song lists because they contain timestamps. This causes extremely long duration enrichment times (129 × 3s = ~6.5 min). Partially mitigated: `stripNonSonglistSections()` truncates at 【時間軸】/【Timestamp】 headers when both sections appear in the same comment. Remaining gap: pure chat-log comments (no section header, no `Song / Artist` separator) are still misidentified.

### 11. Space key on buttons causes double-toggle
Pressing Space on a focused `<button>` triggers `click` on `keyup` (browser default). If a global/container `keydown` handler also calls `togglePreviewPlayPause()`, the function fires twice (once on keydown, once on the button's click from keyup), resulting in no visible change. Fix: the review container's `onKeyDown` handler skips only `INPUT`/`TEXTAREA` targets — it does NOT skip `BUTTON`, so Space on buttons is intercepted before the browser's default `click` fires. The `e.preventDefault()` in the handler suppresses the button activation.

### 12. React synthetic `preventDefault` doesn't prevent Space scroll
`e.preventDefault()` in React's synthetic `onKeyDown` fires AFTER the browser may have already queued scroll behavior for the Space key. To reliably prevent scroll, attach a **native** `keydown` listener directly on the element (`el.addEventListener('keydown', ...)`), which fires before React's delegated handler. The discover review container uses both: native listener for scroll prevention, React `onKeyDown` for play/pause toggle.

### 13. `focus()` causes unwanted viewport scroll
Calling `.focus()` on an element that is partially or fully off-screen causes the browser to scroll the viewport to make it visible. Use `focus({ preventScroll: true })` when programmatically focusing elements (e.g., the review container div) to avoid jarring scroll jumps. This applies to both initial focus on step entry and re-focus after clicking neutral areas.

### 14. CORS blocks browser-side fetches to external sites without headers
Sites like `nova.oshi.tw` have no `Access-Control-Allow-Origin` headers. Any browser-side `fetch()` from `localhost` or `prism.mizuki.tw` will be blocked by CORS. There is no workaround without a proxy server, which is incompatible with the static-site-only architecture (`output: 'export'`). Don't attempt to add browser-side API calls to external sites unless you've confirmed they have permissive CORS headers.

### 15. Admin auth is not secure
The admin password (`mizuki-admin`) is hardcoded in `lib/supabase-admin.ts` and visible in the JS bundle. Anyone can read it from the built JS. This is acceptable because the Supabase anon key allows the same writes anyway (RLS disabled). Do not store genuinely sensitive data or use this auth pattern for anything beyond casual protection.

## Testing & Verification

### Unit Tests

Run `npm run test:unit` for Vitest tests in `lib/admin/__tests__/`. These cover extraction, YouTube parsing, data-writer, metadata, and git services. All use mock data — no live API calls.

### E2E Tests

Playwright tests live in `tests/*.spec.ts`. All run in Chromium only, with `video: 'on'` and `outputDir: 'test-results'`. Requires the dev server running on `localhost:3000`.

**Core flows:**
- `tests/e2e-verify.spec.ts` — 3 core flows: fan page playback, admin login, discover import
- `tests/core-001.spec.ts` — core fan-facing page assertions (catalog rendering, search, filters)
- `tests/core-002.spec.ts` — additional fan-facing page tests
- `tests/core-003.spec.ts` — extended fan-facing tests

**Admin dashboard:**
- `tests/admin-001.spec.ts` — basic admin page navigation and rendering
- `tests/admin-full.spec.ts` — full admin CRUD workflow
- `tests/admin-regression.spec.ts` — admin regression tests
- `tests/admin-stamp.spec.ts` — timestamp marking UI

**Discover page:**
- `tests/discover-kirali-manual.spec.ts` — import `TGuSYMpwepw` via discover UI
- `tests/discover-itunes-duration.spec.ts` — iTunes duration badges: manual paste (none badges) + YouTube URL (iTunes/MusicBrainz badges)
- `tests/discover-preview-player.spec.ts` — 9 tests for YouTube preview player (layout, iframe load, active row, end-timestamp focus/type/blur/keyboard)
- `tests/discover-reset-restores-api-timestamp.spec.ts` — reset button restores iTunes/MusicBrainz timestamp after live-sync overwrites it
- `tests/discover-space-key.spec.ts` — Space key play/pause in discover review step
- `tests/discover-lock-timestamp.spec.ts` — end-timestamp lock button + auto-lock on pause / auto-unlock on play
- `tests/discover-mobile-layout.spec.ts` — discover page mobile responsive layout
- `tests/discover-pause-sets-end-time.spec.ts` — pausing sets end-timestamp of active song
- `tests/discover-reset-song.spec.ts` — reset song functionality
- `tests/discover-song-list-copy.spec.ts` — song list copy block (manual mode)
- `tests/discover-song-list-copy-youtube.spec.ts` — song list copy block (YouTube URL mode)
- `tests/discover-copy-block-sync.spec.ts` — copy block stays in sync with edits
- `tests/admin-discover.spec.ts` — discover page navigation and basic flow
- `tests/admin-kirali-import.spec.ts` — Kirali import flow via admin

**Channel browser:**
- `tests/channel-browser.spec.ts` — 3 tests: fetch streams + navigate to discover, streamer card click auto-loads, invalid URL error

**Player & playback:**
- `tests/play-001.spec.ts` — basic playback tests
- `tests/play-002.spec.ts` — queue and skip tests
- `tests/play-003.spec.ts` — shuffle and repeat tests
- `tests/play-004.spec.ts` — edge case playback tests
- `tests/now-playing.spec.ts` — now-playing modal/view

**Multi-streamer:**
- `tests/multi-streamer.spec.ts` — multi-streamer filter and carousel
- `tests/verify-new-streamer.spec.ts` — new streamer detection in discover

**Other:**
- `tests/ui-001.spec.ts` — general UI tests
- `tests/meta-006.spec.ts` — metadata coverage page
- `tests/admin-api.spec.ts` — admin API/Supabase operations
- `tests/fix-002.spec.ts`, `tests/fix-007.spec.ts` — regression fix verifications
- `tests/verify-e2e-kirali-play.spec.ts` — Kirali playback verification

**Debug tests (not committed, gitignored):**
- `tests/debug-*.spec.ts` — temporary debug/investigation tests

### E2E Testing Patterns

**Common test structure:**
1. Login: navigate to `/admin/login`, fill password `mizuki-admin`, click login, wait for redirect
2. Navigate to target page (often with `?url=` query params for auto-triggering)
3. Wait for async data with `toBeVisible({ timeout: 60000-90000 })` — YouTube API calls can be slow
4. Assert state via `data-testid` attributes, input values, and element visibility
5. Screenshots at key steps: `page.screenshot({ path: 'test-results/...' })`

**Timeouts:**
- `test.setTimeout(120000)` for tests involving YouTube API calls (extraction, channel fetch)
- Default Playwright timeout for simple navigation tests
- Element visibility waits: 60-90s for YouTube API-dependent content

**Selectors:**
- Prefer `data-testid` attributes (e.g., `page.getByTestId('extracted-song-0')`)
- Fallback to `locator()` with CSS selectors for elements without test IDs (e.g., `songRow.locator('button.font-mono').first()`)
- Use `page.getByTestId()` over `page.locator('[data-testid=...]')` for readability

### E2E Video Recording & Verification Flow

When adding or modifying UI features, verify changes with permanent E2E video recordings:

1. **Configuration**: Confirm `playwright.config.ts` has `video: 'on'` and `outputDir: 'test-results'`.
2. **Start Dev Server**: Use `npm run dev` (or `npm run dev:clean` if Supabase data was changed).
3. **Run Playwright Test(s)**: Execute the specific E2E test file.
4. **Export Videos**: Copy `.webm` files from `test-results/` to `videos/`. Rename descriptively.
5. **Visual Verification**: Use `/verify-video` to send the `.webm` to Gemini CLI for analysis.

### Chrome DevTools MCP for Visual Verification

For quick responsive/layout verification without full Playwright tests:
1. Use `resize_page` to set viewport (e.g., 375×667 for mobile, 1280×800 for desktop)
2. Use `navigate_page` to load the target page
3. Use `take_screenshot` to capture the viewport
4. Use `take_snapshot` to get the a11y tree for element UIDs
5. Use `click` with UIDs to interact (e.g., open hamburger menu)

This is faster than writing a Playwright test for one-off visual checks during development.

### Cache Troubleshooting

If the dev server shows errors after data changes, the `.next` cache may be stale:

```bash
npm run dev:clean    # Clears .next cache and restarts dev server
```
