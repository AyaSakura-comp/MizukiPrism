import { describe, it, expect } from 'vitest';
import { parseChannelProfile, extractChannelInfo } from '../youtube';

describe('extractChannelInfo', () => {
  it('extracts channelId and author from videoDetails', () => {
    const videoData = {
      videoDetails: {
        videoId: 'abc123',
        title: 'Test Video',
        channelId: 'UCxxxxxxxx',
        author: 'Test Streamer',
        shortDescription: '',
        lengthSeconds: '3600',
      },
      microformat: {
        playerMicroformatRenderer: {
          ownerProfileUrl: 'http://www.youtube.com/@TestStreamer',
          uploadDate: '2026-01-01',
        },
      },
    };
    const info = extractChannelInfo(videoData);
    expect(info).toEqual({
      channelId: 'UCxxxxxxxx',
      author: 'Test Streamer',
      handle: '@TestStreamer',
    });
  });

  it('returns null handle when ownerProfileUrl is missing', () => {
    const videoData = {
      videoDetails: { channelId: 'UCxxxxxxxx', author: 'Test' },
      microformat: {},
    };
    const info = extractChannelInfo(videoData);
    expect(info.handle).toBeNull();
  });
});

describe('parseChannelProfile', () => {
  it('parses c4TabbedHeaderRenderer for avatar and metadata', () => {
    const mockData = {
      header: {
        c4TabbedHeaderRenderer: {
          avatar: {
            thumbnails: [
              { url: 'https://yt3.ggpht.com/small', width: 48, height: 48 },
              { url: 'https://yt3.ggpht.com/large', width: 176, height: 176 },
            ],
          },
          title: '煌Kirali',
          channelHandleText: { simpleText: '@KiraliHikari' },
        },
      },
      metadata: {
        channelMetadataRenderer: {
          description: 'A VTuber who loves singing',
          externalId: 'UCxxxxxxxx',
        },
      },
    };
    const profile = parseChannelProfile(mockData, 'UCxxxxxxxx');
    expect(profile).toEqual({
      channelId: 'UCxxxxxxxx',
      handle: '@KiraliHikari',
      displayName: '煌Kirali',
      avatarUrl: 'https://yt3.ggpht.com/large',
      description: 'A VTuber who loves singing',
      socialLinks: {},
    });
  });

  it('falls back to pageHeaderRenderer when c4TabbedHeaderRenderer is absent', () => {
    const mockData = {
      header: {
        pageHeaderRenderer: {
          content: {
            pageHeaderViewModel: {
              title: { dynamicTextViewModel: { text: { content: 'FallbackName' } } },
              image: {
                decoratedAvatarViewModel: {
                  avatar: {
                    avatarViewModel: {
                      image: {
                        sources: [{ url: 'https://yt3.ggpht.com/fallback', width: 176, height: 176 }],
                      },
                    },
                  },
                },
              },
              metadata: {
                contentMetadataViewModel: {
                  metadataRows: [{ metadataParts: [{ text: { content: '@FallbackHandle' } }] }],
                },
              },
            },
          },
        },
      },
      metadata: {
        channelMetadataRenderer: { description: 'Fallback description', externalId: 'UCfallback' },
      },
    };
    const profile = parseChannelProfile(mockData, 'UCfallback');
    expect(profile.displayName).toBe('FallbackName');
    expect(profile.avatarUrl).toBe('https://yt3.ggpht.com/fallback');
    expect(profile.handle).toBe('@FallbackHandle');
  });

  it('returns minimal profile when scraping yields nothing', () => {
    const profile = parseChannelProfile({}, 'UCempty');
    expect(profile.channelId).toBe('UCempty');
    expect(profile.displayName).toBe('');
    expect(profile.avatarUrl).toBe('');
  });
});
