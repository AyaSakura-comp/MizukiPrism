import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichMissingEndTimestamps } from '../extraction';
import * as youtube from '../youtube';

// Mock the youtube fetcher
vi.mock('../youtube', () => ({
  fetchYouTubeDuration: vi.fn(),
  searchDict: vi.fn(), // needed because youtube.ts uses it
  extractVideoId: vi.fn(),
  fetchComments: vi.fn(),
  findCandidateComment: vi.fn(),
  secondsToTimestamp: vi.fn((s) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }),
}));

describe('enrichMissingEndTimestamps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fills missing endSeconds using YouTube duration with 0 buffer', async () => {
    // 200 seconds
    vi.mocked(youtube.fetchYouTubeDuration).mockResolvedValueOnce(200);

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
    
    // 100 + 200 + 0 buffer = 300
    expect(enriched[0].endSeconds).toBe(300);
    expect(enriched[0].endTimestamp).toBe('5:00');
    expect(youtube.fetchYouTubeDuration).toHaveBeenCalledWith('李友廷', '誰');
  });

  it('leaves endSeconds as null if YouTube returns null', async () => {
    vi.mocked(youtube.fetchYouTubeDuration).mockResolvedValueOnce(null);

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

  it('does not call YouTube if endSeconds is already set', async () => {
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
    expect(youtube.fetchYouTubeDuration).not.toHaveBeenCalled();
  });

  it('catches and ignores fetch errors', async () => {
    vi.mocked(youtube.fetchYouTubeDuration).mockRejectedValueOnce(new Error('Network error'));

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