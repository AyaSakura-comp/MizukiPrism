import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichMissingEndTimestamps } from '../extraction';
import * as metadata from '../metadata';

// Mock the metadata fetcher
vi.mock('../metadata', () => ({
  fetchItunesMetadata: vi.fn(),
}));

describe('enrichMissingEndTimestamps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills missing endSeconds using iTunes trackDuration plus buffer', async () => {
    // 200 seconds
    vi.mocked(metadata.fetchItunesMetadata).mockResolvedValueOnce({
      data: { trackDuration: 200 } as any,
      confidence: 'exact'
    });

    const songs = [
      {
        orderIndex: 0,
        songName: '誰',
        artist: '李友廷',
        startSeconds: 100,
        endSeconds: null,
        startTimestamp: '1:40',
        endTimestamp: null,
        suspicious: false,
      }
    ];

    const enriched = await enrichMissingEndTimestamps(songs);
    
    // 100 + 200 + 15 buffer = 315
    expect(enriched[0].endSeconds).toBe(315);
    expect(enriched[0].endTimestamp).toBe('5:15');
    expect(metadata.fetchItunesMetadata).toHaveBeenCalledWith('李友廷', '誰');
  });

  it('leaves endSeconds as null if iTunes returns null', async () => {
    vi.mocked(metadata.fetchItunesMetadata).mockResolvedValueOnce(null);

    const songs = [
      {
        orderIndex: 0,
        songName: 'Unknown',
        artist: 'Unknown',
        startSeconds: 100,
        endSeconds: null,
        startTimestamp: '1:40',
        endTimestamp: null,
        suspicious: false,
      }
    ];

    const enriched = await enrichMissingEndTimestamps(songs);
    
    expect(enriched[0].endSeconds).toBeNull();
  });

  it('does not call iTunes if endSeconds is already set', async () => {
    const songs = [
      {
        orderIndex: 0,
        songName: '誰',
        artist: '李友廷',
        startSeconds: 100,
        endSeconds: 300,
        startTimestamp: '1:40',
        endTimestamp: '5:00',
        suspicious: false,
      }
    ];

    const enriched = await enrichMissingEndTimestamps(songs);
    
    expect(enriched[0].endSeconds).toBe(300);
    expect(metadata.fetchItunesMetadata).not.toHaveBeenCalled();
  });

  it('catches and ignores iTunes fetch errors', async () => {
    vi.mocked(metadata.fetchItunesMetadata).mockRejectedValueOnce(new Error('Network error'));

    const songs = [
      {
        orderIndex: 0,
        songName: '誰',
        artist: '李友廷',
        startSeconds: 100,
        endSeconds: null,
        startTimestamp: '1:40',
        endTimestamp: null,
        suspicious: false,
      }
    ];

    const enriched = await enrichMissingEndTimestamps(songs);
    
    expect(enriched[0].endSeconds).toBeNull();
  });
});