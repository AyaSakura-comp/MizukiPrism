import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  readStreamers,
  writeStreamers,
  findStreamerByChannelId,
  addStreamer,
} from '../data-writer';

function createTempData() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizuki-streamer-'));
  fs.writeFileSync(
    path.join(tmpDir, 'streamer.json'),
    JSON.stringify([
      {
        channelId: 'UC111',
        handle: '@Mizuki',
        displayName: '浠Mizuki',
        avatarUrl: 'https://example.com/mizuki.jpg',
        description: 'A VTuber',
        socialLinks: { youtube: 'https://youtube.com/@Mizuki' },
      },
    ])
  );
  return tmpDir;
}

describe('readStreamers', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempData(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads streamer array from file', () => {
    const streamers = readStreamers(tmpDir);
    expect(streamers).toHaveLength(1);
    expect(streamers[0].channelId).toBe('UC111');
  });

  it('returns empty array when file is empty', () => {
    fs.writeFileSync(path.join(tmpDir, 'streamer.json'), '');
    const streamers = readStreamers(tmpDir);
    expect(streamers).toEqual([]);
  });
});

describe('findStreamerByChannelId', () => {
  it('finds existing streamer', () => {
    const streamers = [{ channelId: 'UC111', handle: '@Mizuki', displayName: '浠Mizuki', avatarUrl: '', description: '', socialLinks: {} }];
    expect(findStreamerByChannelId(streamers, 'UC111')).toBeTruthy();
  });

  it('returns null for unknown channelId', () => {
    const streamers = [{ channelId: 'UC111', handle: '@Mizuki', displayName: '浠Mizuki', avatarUrl: '', description: '', socialLinks: {} }];
    expect(findStreamerByChannelId(streamers, 'UC999')).toBeNull();
  });
});

describe('addStreamer', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = createTempData(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('appends new streamer to file', () => {
    addStreamer(tmpDir, {
      channelId: 'UC222',
      handle: '@Kirali',
      displayName: '煌Kirali',
      avatarUrl: 'https://example.com/kirali.jpg',
      description: 'Singer',
      socialLinks: { youtube: 'https://youtube.com/@Kirali' },
    });
    const streamers = readStreamers(tmpDir);
    expect(streamers).toHaveLength(2);
    expect(streamers[1].channelId).toBe('UC222');
  });

  it('skips duplicate channelId', () => {
    addStreamer(tmpDir, {
      channelId: 'UC111',
      handle: '@Mizuki',
      displayName: '浠Mizuki',
      avatarUrl: '',
      description: '',
      socialLinks: {},
    });
    const streamers = readStreamers(tmpDir);
    expect(streamers).toHaveLength(1);
  });
});
