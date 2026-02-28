import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractVideoId,
  parseYtInitialData,
  parseVideoInfo,
  parseComments,
  VideoInfo,
} from '../youtube';

describe('extractVideoId', () => {
  it('extracts from standard URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('extracts from short URL', () => {
    expect(extractVideoId('https://youtu.be/lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('extracts from embed URL', () => {
    expect(extractVideoId('https://www.youtube.com/embed/lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('extracts bare video ID', () => {
    expect(extractVideoId('lVAiHsvF8z8')).toBe('lVAiHsvF8z8');
  });

  it('returns null for invalid input', () => {
    expect(extractVideoId('not-a-url')).toBeNull();
    expect(extractVideoId('')).toBeNull();
  });
});

describe('parseVideoInfo', () => {
  it('parses ytInitialData into VideoInfo', () => {
    // Minimal mock of YouTube's embedded data structure
    const mockData = {
      videoDetails: {
        videoId: 'lVAiHsvF8z8',
        title: '【午後歌枠】不開心要唱歌',
        shortDescription: `Song list:
0:04:23 誰 / 李友廷
0:08:26 Shape of You / Ed Sheeran`,
        lengthSeconds: '7200',
      },
      microformat: {
        playerMicroformatRenderer: {
          uploadDate: '2025-03-26',
          publishDate: '2025-03-26',
        },
      },
    };

    const info = parseVideoInfo(mockData);
    expect(info).toEqual({
      videoId: 'lVAiHsvF8z8',
      title: '【午後歌枠】不開心要唱歌',
      date: '2025-03-26',
      description: `Song list:
0:04:23 誰 / 李友廷
0:08:26 Shape of You / Ed Sheeran`,
      durationSeconds: 7200,
    });
  });
});

describe('parseComments', () => {
  it('parses innertube comment response into Comment objects', () => {
    // Minimal mock of YouTube's comment continuation response
    const mockResponse = {
      onResponseReceivedEndpoints: [
        {
          reloadContinuationItemsCommand: {
            continuationItems: [
              {
                commentThreadRenderer: {
                  comment: {
                    commentRenderer: {
                      commentId: 'abc123',
                      authorText: { simpleText: '@hydai' },
                      authorEndpoint: {
                        browseEndpoint: { browseId: 'UCL96VcILiOIp4PAYIPzotoQ' },
                      },
                      contentText: {
                        runs: [
                          { text: `0:04:23 誰 / 李友廷
0:08:26 Shape of You / Ed Sheeran
0:12:00 夜曲 / 周杰倫` },
                        ],
                      },
                      voteCount: { simpleText: '345' },
                      pinnedCommentBadge: {},
                    },
                  },
                },
              },
            ],
          },
        },
      ],
    };

    const comments = parseComments(mockResponse);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({
      cid: 'abc123',
      author: '@hydai',
      text: expect.stringContaining('0:04:23 誰 / 李友廷'),
      votes: '345',
      isPinned: true,
    });
  });
});
