import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSongsFromSheet, loadStreamsFromSheet, loadMetadataFromSheet, loadLyricsFromSheet } from '../../sheets-data';

vi.mock('../../sheets', () => ({
  fetchSheet: vi.fn(),
}));

import { fetchSheet } from '../../sheets';
const mockFetchSheet = vi.mocked(fetchSheet);

describe('loadSongsFromSheet', () => {
  beforeEach(() => { mockFetchSheet.mockReset(); });

  it('groups flat performance rows into nested Song objects', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { songId: 'song-1', title: '誰', originalArtist: '李友廷', tags: '',
        streamId: 'stream-1', date: '2025-03-26', videoId: 'abc',
        timestamp: '263', endTimestamp: '506', note: '' },
      { songId: 'song-1', title: '誰', originalArtist: '李友廷', tags: '',
        streamId: 'stream-2', date: '2026-01-01', videoId: 'def',
        timestamp: '100', endTimestamp: '300', note: 'encore' },
      { songId: 'song-2', title: '僕が死のうと思ったのは', originalArtist: '中島美嘉', tags: '',
        streamId: 'stream-1', date: '2025-03-26', videoId: 'abc',
        timestamp: '884', endTimestamp: '1255', note: '' },
    ]);

    const songs = await loadSongsFromSheet();
    expect(songs).toHaveLength(2);
    expect(songs[0].id).toBe('song-1');
    expect(songs[0].title).toBe('誰');
    expect(songs[0].performances).toHaveLength(2);
    expect(songs[0].performances[0].timestamp).toBe(263);
    expect(songs[0].performances[0].endTimestamp).toBe(506);
    expect(songs[0].performances[1].note).toBe('encore');
    expect(songs[1].performances).toHaveLength(1);
  });

  it('handles null endTimestamp', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { songId: 'song-1', title: 'Test', originalArtist: 'Artist', tags: '',
        streamId: 'stream-1', date: '2025-01-01', videoId: 'abc',
        timestamp: '100', endTimestamp: '', note: '' },
    ]);
    const songs = await loadSongsFromSheet();
    expect(songs[0].performances[0].endTimestamp).toBeNull();
  });

  it('parses comma-separated tags', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { songId: 'song-1', title: 'Test', originalArtist: 'Artist', tags: 'jpop,anime',
        streamId: 's1', date: '2025-01-01', videoId: 'v1',
        timestamp: '0', endTimestamp: '', note: '' },
    ]);
    const songs = await loadSongsFromSheet();
    expect(songs[0].tags).toEqual(['jpop', 'anime']);
  });
});

describe('loadStreamsFromSheet', () => {
  beforeEach(() => { mockFetchSheet.mockReset(); });

  it('parses stream rows with credit object', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { id: 'stream-1', channelId: 'UC123', title: 'Test Stream', date: '2025-03-26',
        videoId: 'abc', youtubeUrl: 'https://youtube.com/watch?v=abc',
        creditAuthor: '@hydai', creditAuthorUrl: 'UC456', creditCommentUrl: 'https://comment' },
    ]);

    const streams = await loadStreamsFromSheet();
    expect(streams).toHaveLength(1);
    expect(streams[0].id).toBe('stream-1');
    expect(streams[0].credit).toEqual({
      author: '@hydai',
      authorUrl: 'UC456',
      commentUrl: 'https://comment',
    });
  });

  it('omits credit when creditAuthor is empty', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { id: 'stream-1', channelId: 'UC123', title: 'Test', date: '2025-01-01',
        videoId: 'abc', youtubeUrl: 'https://youtube.com/watch?v=abc',
        creditAuthor: '', creditAuthorUrl: '', creditCommentUrl: '' },
    ]);
    const streams = await loadStreamsFromSheet();
    expect(streams[0].credit).toBeUndefined();
  });
});

describe('loadMetadataFromSheet', () => {
  beforeEach(() => { mockFetchSheet.mockReset(); });

  it('parses metadata rows', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { songId: 'song-1', fetchStatus: 'matched', matchConfidence: 'exact',
        albumArtUrl: 'https://img.example.com/art.jpg',
        albumArtSmall: 'https://img.example.com/art-60.jpg',
        albumArtMedium: 'https://img.example.com/art-200.jpg',
        albumArtBig: 'https://img.example.com/art-400.jpg',
        albumArtXl: 'https://img.example.com/art-600.jpg',
        albumTitle: 'Test Album', itunesTrackId: '12345', itunesCollectionId: '67890',
        trackDuration: '240', fetchedAt: '2025-01-01', lastError: '' },
    ]);

    const { songMetadata, artistInfo } = await loadMetadataFromSheet();
    expect(songMetadata).toHaveLength(1);
    expect(songMetadata[0].songId).toBe('song-1');
    expect(songMetadata[0].itunesTrackId).toBe(12345);
    expect(songMetadata[0].trackDuration).toBe(240);
    expect(artistInfo).toEqual([]);
  });
});

describe('loadLyricsFromSheet', () => {
  beforeEach(() => { mockFetchSheet.mockReset(); });

  it('parses lyrics rows', async () => {
    mockFetchSheet.mockResolvedValueOnce([
      { songId: 'song-1', fetchStatus: 'matched',
        syncedLyrics: '[00:01.00] Hello', plainLyrics: 'Hello',
        fetchedAt: '2025-01-01', lastError: '' },
    ]);
    const lyrics = await loadLyricsFromSheet();
    expect(lyrics).toHaveLength(1);
    expect(lyrics[0].syncedLyrics).toBe('[00:01.00] Hello');
  });
});
