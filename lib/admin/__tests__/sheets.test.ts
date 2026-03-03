import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSheet, appendRows, updateRow } from '../../sheets';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('fetchSheet', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('fetches and parses sheet rows into objects', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        values: [
          ['songId', 'title', 'originalArtist'],
          ['song-1', '誰', '李友廷'],
          ['song-2', '僕が死のうと思ったのは', '中島美嘉'],
        ],
      }),
    });

    const result = await fetchSheet('Performances');
    expect(result).toEqual([
      { songId: 'song-1', title: '誰', originalArtist: '李友廷' },
      { songId: 'song-2', title: '僕が死のうと思ったのは', originalArtist: '中島美嘉' },
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('sheets.googleapis.com/v4/spreadsheets/'),
      expect.any(Object),
    );
  });

  it('returns empty array when sheet is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ values: [['songId', 'title']] }),
    });
    const result = await fetchSheet('Performances');
    expect(result).toEqual([]);
  });

  it('throws on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
    await expect(fetchSheet('Performances')).rejects.toThrow('Sheets API error: 403');
  });
});

describe('appendRows', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('appends rows to a sheet tab', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ updates: { updatedRows: 2 } }),
    });

    await appendRows('Streams', [
      { id: 'stream-1', title: 'Test' },
      { id: 'stream-2', title: 'Test 2' },
    ], ['id', 'title']);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(':append?'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('updateRow', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('updates a specific row in the sheet', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ updatedCells: 2 }),
    });

    await updateRow('Streams', 3, { id: 'stream-1', title: 'Updated' }, ['id', 'title']);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('Streams!A5'),  // rowIndex 3 + 2 = row 5
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
