import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  addStreamAndSongs,
  updateMetadataFiles,
  generateSongId,
  generatePerformanceId,
  findExistingSong,
} from '../data-writer';

// Helper: create a temp data directory with initial files
function createTempData() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuki-test-'));
  const metaDir = path.join(tmpDir, 'metadata');
  fs.mkdirSync(metaDir);

  fs.writeFileSync(
    path.join(tmpDir, 'songs.json'),
    JSON.stringify([
      {
        id: 'song-1',
        title: '誰',
        originalArtist: '李友廷',
        tags: [],
        performances: [
          {
            id: 'p1-1',
            streamId: 'stream-2025-03-26',
            date: '2025-03-26',
            streamTitle: '午後歌枠',
            videoId: 'lVAiHsvF8z8',
            timestamp: 263,
            endTimestamp: 506,
            note: '',
          },
        ],
      },
    ])
  );

  fs.writeFileSync(
    path.join(tmpDir, 'streams.json'),
    JSON.stringify([
      {
        id: 'stream-2025-03-26',
        title: '午後歌枠',
        date: '2025-03-26',
        videoId: 'lVAiHsvF8z8',
        youtubeUrl: 'https://www.youtube.com/watch?v=lVAiHsvF8z8',
      },
    ])
  );

  fs.writeFileSync(path.join(metaDir, 'song-metadata.json'), '[]');
  fs.writeFileSync(path.join(metaDir, 'song-lyrics.json'), '[]');
  fs.writeFileSync(path.join(metaDir, 'artist-info.json'), '[]');

  return tmpDir;
}

describe('findExistingSong', () => {
  it('finds song by title + artist match', () => {
    const songs = [
      { id: 'song-1', title: '誰', originalArtist: '李友廷', tags: [], performances: [] },
    ];
    expect(findExistingSong(songs, '誰', '李友廷')).toBe('song-1');
  });

  it('returns null for no match', () => {
    const songs = [
      { id: 'song-1', title: '誰', originalArtist: '李友廷', tags: [], performances: [] },
    ];
    expect(findExistingSong(songs, 'Unknown', 'Artist')).toBeNull();
  });
});

describe('generateSongId', () => {
  it('generates next sequential ID', () => {
    const songs = [
      { id: 'song-1' }, { id: 'song-3' }, { id: 'song-2' },
    ] as any[];
    expect(generateSongId(songs)).toBe('song-4');
  });

  it('starts at song-1 for empty list', () => {
    expect(generateSongId([])).toBe('song-1');
  });
});

describe('addStreamAndSongs', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = createTempData(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('adds new stream and new songs', () => {
    const result = addStreamAndSongs(tmpDir, {
      videoId: 'newVideo123',
      title: '新歌枠',
      date: '2026-02-28',
      youtubeUrl: 'https://www.youtube.com/watch?v=newVideo123',
      songs: [
        { songName: 'New Song', artist: 'New Artist', startSeconds: 100, endSeconds: 300 },
      ],
      credit: { author: '@curator', authorUrl: 'UC123' },
    });

    expect(result.newSongs).toBe(1);
    expect(result.newPerformances).toBe(1);
    expect(result.existingSongMatches).toBe(0);

    // Verify files
    const songs = JSON.parse(fs.readFileSync(path.join(tmpDir, 'songs.json'), 'utf-8'));
    expect(songs).toHaveLength(2);
    expect(songs[1].title).toBe('New Song');

    const streams = JSON.parse(fs.readFileSync(path.join(tmpDir, 'streams.json'), 'utf-8'));
    expect(streams).toHaveLength(2);
    expect(streams[1].videoId).toBe('newVideo123');
  });

  it('adds performance to existing song when title+artist matches', () => {
    const result = addStreamAndSongs(tmpDir, {
      videoId: 'newVideo456',
      title: '新歌枠2',
      date: '2026-03-01',
      youtubeUrl: 'https://www.youtube.com/watch?v=newVideo456',
      songs: [
        { songName: '誰', artist: '李友廷', startSeconds: 200, endSeconds: 500 },
      ],
    });

    expect(result.newSongs).toBe(0);
    expect(result.existingSongMatches).toBe(1);
    expect(result.newPerformances).toBe(1);

    const songs = JSON.parse(fs.readFileSync(path.join(tmpDir, 'songs.json'), 'utf-8'));
    expect(songs).toHaveLength(1); // Still 1 song
    expect(songs[0].performances).toHaveLength(2); // But 2 performances
  });
});
