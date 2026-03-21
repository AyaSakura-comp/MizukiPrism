import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseIsoDuration, fetchVideoInfo, fetchVideoComments, fetchChannelInfo, extractChannelInput, fetchChannelUploads, KARAOKE_KEYWORDS } from '../../youtube-api';

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

describe('extractChannelInput', () => {
  it('parses /channel/UC... URL', () => {
    expect(extractChannelInput('https://www.youtube.com/channel/UCjv4bfP_67WLuPheS-Z8Ekg')).toEqual(
      { type: 'id', value: 'UCjv4bfP_67WLuPheS-Z8Ekg' }
    );
  });

  it('parses /@handle URL', () => {
    expect(extractChannelInput('https://www.youtube.com/@mizukiTW')).toEqual(
      { type: 'handle', value: 'mizukiTW' }
    );
  });

  it('parses /@handle URL with trailing slash', () => {
    expect(extractChannelInput('https://www.youtube.com/@mizukiTW/')).toEqual(
      { type: 'handle', value: 'mizukiTW' }
    );
  });

  it('returns null for unrecognized URL', () => {
    expect(extractChannelInput('https://youtube.com/watch?v=abc')).toBeNull();
    expect(extractChannelInput('not a url')).toBeNull();
  });
});

describe('KARAOKE_KEYWORDS', () => {
  it('includes Japanese, Chinese, and English keywords', () => {
    expect(KARAOKE_KEYWORDS).toContain('歌回');
    expect(KARAOKE_KEYWORDS).toContain('カラオケ');
    expect(KARAOKE_KEYWORDS).toContain('卡拉OK');
    expect(KARAOKE_KEYWORDS).toContain('karaoke');
  });
});

describe('fetchChannelUploads', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  function makeChannelsResponse(uploadsPlaylistId: string) {
    return {
      ok: true,
      json: async () => ({
        items: [{
          snippet: {
            title: 'TestChannel',
            customUrl: '@test',
            thumbnails: { high: { url: 'https://example.com/avatar.jpg' } },
            description: '',
          },
          contentDetails: {
            relatedPlaylists: { uploads: uploadsPlaylistId },
          },
        }],
      }),
    };
  }

  function makePlaylistResponse(titles: string[], nextPageToken?: string) {
    return {
      ok: true,
      json: async () => ({
        items: titles.map((title, i) => ({
          snippet: {
            title,
            publishedAt: `2025-0${i + 1}-01T00:00:00Z`,
            resourceId: { videoId: `vid${i}` },
            thumbnails: { medium: { url: `https://example.com/thumb${i}.jpg` } },
          },
        })),
        nextPageToken,
      }),
    };
  }

  it('filters videos by karaoke keywords', async () => {
    mockFetch
      .mockResolvedValueOnce(makeChannelsResponse('PLtest'))
      .mockResolvedValueOnce(makePlaylistResponse(['秋日歌回 #3', 'Gaming Video', '【カラオケ】夏夜']));

    const onProgress = vi.fn();
    const result = await fetchChannelUploads({ type: 'id', value: 'UCtest' }, onProgress);

    expect(result.videos).toHaveLength(2);
    expect(result.videos[0].title).toBe('秋日歌回 #3');
    expect(result.videos[1].title).toBe('【カラオケ】夏夜');
    expect(result.channel.displayName).toBe('TestChannel');
  });

  it('calls onProgress for each page', async () => {
    mockFetch
      .mockResolvedValueOnce(makeChannelsResponse('PLtest'))
      .mockResolvedValueOnce(makePlaylistResponse(['歌回 1'], 'page2token'))
      .mockResolvedValueOnce(makePlaylistResponse(['歌回 2']));

    const onProgress = vi.fn();
    await fetchChannelUploads({ type: 'id', value: 'UCtest' }, onProgress);

    expect(onProgress).toHaveBeenCalledWith(1);
    expect(onProgress).toHaveBeenCalledWith(2);
  });

  it('uses forHandle when input type is handle', async () => {
    mockFetch
      .mockResolvedValueOnce(makeChannelsResponse('PLtest'))
      .mockResolvedValueOnce(makePlaylistResponse([]));

    await fetchChannelUploads({ type: 'handle', value: 'mizukiTW' }, vi.fn());

    const channelUrl = mockFetch.mock.calls[0][0] as string;
    expect(channelUrl).toContain('forHandle=mizukiTW');
    expect(channelUrl).not.toContain('&id=');
  });

  it('throws when channel not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    await expect(fetchChannelUploads({ type: 'id', value: 'UCbad' }, vi.fn())).rejects.toThrow('找不到此頻道');
  });
});
