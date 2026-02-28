import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeArtist,
  stripFeaturing,
  cleanTitle,
  buildSearchStrategies,
  parseItunesResult,
  parseLrclibResult,
  MetadataResult,
} from '../metadata';

describe('normalizeArtist', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeArtist('YOASOBI')).toBe('yoasobi');
    expect(normalizeArtist('Ed  Sheeran')).toBe('ed sheeran');
  });
});

describe('stripFeaturing', () => {
  it('removes feat. suffix', () => {
    expect(stripFeaturing('Artist feat. Other')).toBe('Artist');
    expect(stripFeaturing('Artist ft. Other')).toBe('Artist');
  });

  it('returns unchanged if no featuring', () => {
    expect(stripFeaturing('Plain Artist')).toBe('Plain Artist');
  });
});

describe('cleanTitle', () => {
  it('removes CJK punctuation variants', () => {
    expect(cleanTitle('花（feat.明日）')).toBe('花');
  });
});

describe('buildSearchStrategies', () => {
  it('builds ordered search strategies', () => {
    const strategies = buildSearchStrategies('李友廷', '誰');
    expect(strategies[0]).toEqual({
      term: '李友廷 誰',
      confidence: 'exact',
    });
  });

  it('includes cleaned artist strategy when featuring present', () => {
    const strategies = buildSearchStrategies('Artist feat. Other', 'Song');
    expect(strategies.some(s => s.confidence === 'exact_cleaned')).toBe(true);
  });
});

describe('parseItunesResult', () => {
  it('parses iTunes API result into metadata', () => {
    const itunesResult = {
      trackId: 123,
      collectionId: 456,
      collectionName: 'Album Name',
      artworkUrl100: 'https://example.com/100x100bb.jpg',
      trackTimeMillis: 240000,
      artistName: 'YOASOBI',
      artistId: 789,
    };

    const meta = parseItunesResult(itunesResult);
    expect(meta.albumArtUrl).toBe('https://example.com/400x400bb.jpg');
    expect(meta.albumArtUrls).toEqual({
      small: 'https://example.com/60x60bb.jpg',
      medium: 'https://example.com/200x200bb.jpg',
      big: 'https://example.com/400x400bb.jpg',
      xl: 'https://example.com/600x600bb.jpg',
    });
    expect(meta.trackDuration).toBe(240);
    expect(meta.itunesTrackId).toBe(123);
  });
});

describe('parseLrclibResult', () => {
  it('prefers synced lyrics over plain', () => {
    const result = {
      syncedLyrics: '[00:05.00] Hello\\n[00:10.00] World',
      plainLyrics: 'Hello\\nWorld',
    };
    const lyrics = parseLrclibResult(result);
    expect(lyrics.syncedLyrics).toBe('[00:05.00] Hello\\n[00:10.00] World');
    expect(lyrics.plainLyrics).toBe('Hello\\nWorld');
  });

  it('returns plain lyrics when no synced available', () => {
    const result = { plainLyrics: 'Hello\\nWorld' };
    const lyrics = parseLrclibResult(result);
    expect(lyrics.syncedLyrics).toBeUndefined();
    expect(lyrics.plainLyrics).toBe('Hello\\nWorld');
  });
});
