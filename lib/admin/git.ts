// lib/admin/git.ts
'use server';
// Git operations via child_process

import { execSync } from 'child_process';
import path from 'path';

export interface GitFileStatus {
  status: string;
  path: string;
}

export interface CommitInfo {
  streamDate: string;
  streamTitle: string;
  songCount: number;
}

// ---------------------------------------------------------------------------
// Status parsing
// ---------------------------------------------------------------------------

export function parseGitStatus(output: string): GitFileStatus[] {
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({
      status: line.slice(0, 2).trim() || line.slice(0, 2),
      path: line.slice(3),
    }));
}

// ---------------------------------------------------------------------------
// Commit message building
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export function buildCommitMessage(info: CommitInfo): string {
  const [, month, day] = info.streamDate.split('-').map(Number);
  const monthName = MONTH_NAMES[month - 1];
  const dayStr = `${day}${ordinalSuffix(day)}`;
  return `feat: add ${monthName} ${dayStr} karaoke stream with ${info.songCount} songs`;
}

// ---------------------------------------------------------------------------
// Git operations (all synchronous, run in project root)
// ---------------------------------------------------------------------------

function runGit(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', timeout: 30000 }).trim();
}

/**
 * Get git status for the data/ directory.
 */
export function getDataStatus(projectRoot: string): GitFileStatus[] {
  const output = runGit('status --porcelain data/', projectRoot);
  return parseGitStatus(output);
}

/**
 * Get git diff for data/ files (staged + unstaged).
 */
export function getDataDiff(projectRoot: string): string {
  return runGit('diff data/', projectRoot);
}

/**
 * Stage all data/ files, commit with the given message, and optionally push.
 */
export function commitDataChanges(
  projectRoot: string,
  message: string,
  push: boolean = false,
): { success: boolean; output: string } {
  try {
    runGit('add data/', projectRoot);
    const output = runGit(`commit -m "${message}"`, projectRoot);
    if (push) {
      runGit('push', projectRoot);
    }
    return { success: true, output };
  } catch (err) {
    return { success: false, output: String(err) };
  }
}
