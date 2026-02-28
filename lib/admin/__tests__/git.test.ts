import { describe, it, expect, vi } from 'vitest';
import { buildCommitMessage, parseGitStatus, GitFileStatus } from '../git';

describe('buildCommitMessage', () => {
  it('builds conventional commit message for single stream', () => {
    const msg = buildCommitMessage({
      streamDate: '2026-02-28',
      streamTitle: '午後歌枠',
      songCount: 18,
    });
    expect(msg).toBe('feat: add February 28th karaoke stream with 18 songs');
  });
});

describe('parseGitStatus', () => {
  it('parses git status --porcelain output', () => {
    const output = ` M data/songs.json
 M data/streams.json
 M data/metadata/song-metadata.json
?? new-file.txt`;

    const files = parseGitStatus(output);
    expect(files).toHaveLength(4);
    expect(files[0]).toEqual({ status: 'M', path: 'data/songs.json' });
    expect(files[3]).toEqual({ status: '??', path: 'new-file.txt' });
  });

  it('returns empty array for clean status', () => {
    expect(parseGitStatus('')).toEqual([]);
  });
});
