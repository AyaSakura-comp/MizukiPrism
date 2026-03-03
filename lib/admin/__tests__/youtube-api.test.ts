import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseIsoDuration, fetchVideoInfo, fetchVideoComments, fetchChannelInfo } from '../../youtube-api';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('parseIsoDuration', () => {
  it('parses hours, minutes, seconds', () => {
    expect(parseIsoDuration('PT1H30M5S')).toBe(5405);
  });
  it('parses minutes and seconds only', () => {
    expect(parseIsoDuration('PT4M30S')).toBe(270);
  });
  it('parses seconds only', () => {
    expect(parseIsoDuration('PT45S')).toBe(45);
  });
  it('returns 0 for invalid', () => {
    expect(parseIsoDuration('invalid')).toBe(0);
  });
});

describe('fetchVideoInfo', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns video title, date, duration, channel info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{
          snippet: {
            title: '【歌枠】テスト',
            publishedAt: '2025-03-26T12:00:00Z',
            channelId: 'UCjv4bfP_67WLuPheS-Z8Ekg',
            channelTitle: '浠Mizuki',
            description: 'description text',
          },
          contentDetails: { duration: 'PT1H30M5S' },
        }],
      }),
    });

    const info = await fetchVideoInfo('lVAiHsvF8z8');
    expect(info).toEqual({
      videoId: 'lVAiHsvF8z8',
      title: '【歌枠】テスト',
      date: '2025-03-26',
      description: 'description text',
      durationSeconds: 5405,
      channelId: 'UCjv4bfP_67WLuPheS-Z8Ekg',
      channelName: '浠Mizuki',
    });
  });

  it('throws when video not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    await expect(fetchVideoInfo('bad-id')).rejects.toThrow('Video not found');
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(fetchVideoInfo('any')).rejects.toThrow('YouTube API error: 403');
  });
});

describe('fetchVideoComments', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns top-level comments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{
          snippet: {
            topLevelComment: {
              id: 'c1',
              snippet: {
                authorDisplayName: 'Kirali',
                authorChannelUrl: 'http://youtube.com/channel/UC123',
                textDisplay: '0:00 Song1\n3:45 Song2',
                likeCount: 10,
              },
            },
          },
        }],
      }),
    });

    const comments = await fetchVideoComments('lVAiHsvF8z8');
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      cid: 'c1',
      author: 'Kirali',
      text: '0:00 Song1\n3:45 Song2',
      likeCount: 10,
      isPinned: false,
    });
  });

  it('returns empty array when no comments', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    const comments = await fetchVideoComments('vid');
    expect(comments).toEqual([]);
  });
});

describe('fetchChannelInfo', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns channel profile info', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{
          snippet: {
            title: '浠Mizuki',
            customUrl: '@浠Mizuki',
            description: 'VTuber desc',
            thumbnails: { high: { url: 'https://img.example.com/avatar.jpg' } },
          },
        }],
      }),
    });

    const info = await fetchChannelInfo('UCjv4bfP_67WLuPheS-Z8Ekg');
    expect(info).toEqual({
      channelId: 'UCjv4bfP_67WLuPheS-Z8Ekg',
      handle: '@浠Mizuki',
      displayName: '浠Mizuki',
      avatarUrl: 'https://img.example.com/avatar.jpg',
      description: 'VTuber desc',
    });
  });

  it('throws when channel not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });
    await expect(fetchChannelInfo('bad-id')).rejects.toThrow('Channel not found');
  });
});
