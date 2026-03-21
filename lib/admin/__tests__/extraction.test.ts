import { describe, it, expect } from 'vitest';
import {
  parseTimestamp,
  parseSongLine,
  parseTextToSongs,
  findCandidateComment,
  secondsToTimestamp,
  countTimestamps,
} from '../extraction';

describe('parseTimestamp', () => {
  it('parses MM:SS', () => {
    expect(parseTimestamp('4:23')).toBe(263);
  });

  it('parses HH:MM:SS', () => {
    expect(parseTimestamp('1:23:45')).toBe(5025);
  });

  it('parses 0:00', () => {
    expect(parseTimestamp('0:00')).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(parseTimestamp('abc')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });
});

describe('secondsToTimestamp', () => {
  it('formats seconds as MM:SS', () => {
    expect(secondsToTimestamp(263)).toBe('4:23');
  });

  it('formats seconds as H:MM:SS when >= 1 hour', () => {
    expect(secondsToTimestamp(5025)).toBe('1:23:45');
  });

  it('formats 0 seconds', () => {
    expect(secondsToTimestamp(0)).toBe('0:00');
  });
});

describe('parseSongLine', () => {
  it('parses "timestamp songname / artist"', () => {
    const result = parseSongLine('4:23 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('parses "timestamp - songname - artist"', () => {
    const result = parseSongLine('0:30 - Shape of You - Ed Sheeran');
    expect(result).toEqual({
      startSeconds: 30,
      songName: 'Shape of You',
      artist: 'Ed Sheeran',
    });
  });

  it('strips numbering prefixes', () => {
    const result = parseSongLine('01. 4:23 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('strips box-drawing characters', () => {
    const result = parseSongLine('├── 4:23 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('parses range end timestamp', () => {
    const result = parseSongLine('4:23 ~ 8:26 誰 / 李友廷');
    expect(result).toEqual({
      startSeconds: 263,
      endSeconds: 506,
      songName: '誰',
      artist: '李友廷',
    });
  });

  it('returns null for empty or non-timestamp lines', () => {
    expect(parseSongLine('')).toBeNull();
    expect(parseSongLine('Just some text')).toBeNull();
    expect(parseSongLine('   ')).toBeNull();
  });
});

describe('parseTextToSongs', () => {
  it('parses multi-line comment into song list', () => {
    const text = `4:23 誰 / 李友廷
8:26 Shape of You / Ed Sheeran
12:00 夜曲 / 周杰倫`;

    const songs = parseTextToSongs(text);
    expect(songs).toHaveLength(3);
    expect(songs[0]).toMatchObject({
      orderIndex: 0,
      songName: '誰',
      artist: '李友廷',
      startSeconds: 263,
      endSeconds: null,  // no inference; iTunes/MusicBrainz enriches later
      suspicious: false,
    });
    expect(songs[2].endSeconds).toBeNull();  // last song
  });

  it('skips non-timestamp lines', () => {
    const text = `歌單 Songlist
4:23 誰 / 李友廷
This is a comment
8:26 Shape of You / Ed Sheeran`;

    const songs = parseTextToSongs(text);
    expect(songs).toHaveLength(2);
  });

  it('flags suspicious timestamps (>12 hours)', () => {
    const text = `13:00:00 Some Song / Artist`;
    const songs = parseTextToSongs(text);
    expect(songs[0].suspicious).toBe(true);
  });

  it('returns empty array for no timestamps', () => {
    expect(parseTextToSongs('no timestamps here')).toEqual([]);
  });

  it('stops parsing at 【時間軸】 section header', () => {
    const text = `01. 25:30 I See the Light / Mandy Moore
02. 41:51 Once Upon a Dream / Lana del Rey
【時間軸||Timestamp】
3:55 開始
4:36 魯尼的頭上有米妮`;
    const songs = parseTextToSongs(text);
    expect(songs).toHaveLength(2);
    expect(songs[0].songName).toContain('I See the Light');
    expect(songs[1].songName).toContain('Once Upon a Dream');
  });

  it('strips fullwidth/mathematical bold digit prefix (𝟎𝟏.)', () => {
    const text = `𝟎𝟏. 25:30 I See the Light / Mandy Moore
𝟎𝟐. 41:51 Once Upon a Dream / Lana del Rey`;
    const songs = parseTextToSongs(text);
    expect(songs).toHaveLength(2);
    expect(songs[0].songName).toContain('I See the Light');
  });

  it('stops parsing at 【Timestamp】 section header', () => {
    const text = `1:00 Song A / Artist A
2:00 Song B / Artist B
【Timestamp】
3:55 some chat moment
4:00 another chat moment`;
    const songs = parseTextToSongs(text);
    expect(songs).toHaveLength(2);
  });
});

describe('countTimestamps', () => {
  it('counts timestamp patterns in text', () => {
    expect(countTimestamps(`4:23 song\n8:26 song2\n12:00 song3`)).toBe(3);
  });

  it('returns 0 for no timestamps', () => {
    expect(countTimestamps('no timestamps here')).toBe(0);
  });
});

describe('findCandidateComment', () => {
  it('selects pinned comment over high-vote comment', () => {
    const comments = [
      { text: `1:00 a\n2:00 b\n3:00 c`, votes: '100', isPinned: false },
      { text: `1:00 a\n2:00 b\n3:00 c`, votes: '10', isPinned: true },
    ];
    const best = findCandidateComment(comments);
    expect(best?.isPinned).toBe(true);
  });

  it('selects highest votes when no pinned comment', () => {
    const comments = [
      { text: `1:00 a\n2:00 b\n3:00 c`, votes: '50' },
      { text: `1:00 a\n2:00 b\n3:00 c`, votes: '1.2K' },
    ];
    const best = findCandidateComment(comments);
    expect(best?.votes).toBe('1.2K');
  });

  it('returns null when no comment has >= 3 timestamps', () => {
    const comments = [
      { text: `1:00 a\n2:00 b`, votes: '10' },
    ];
    expect(findCandidateComment(comments)).toBeNull();
  });
});
