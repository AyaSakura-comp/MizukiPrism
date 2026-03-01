// app/api/admin/deploy/route.ts
// Git status, diff, commit, and push operations

import { NextRequest, NextResponse } from 'next/server';
import { getDataStatus, getDataDiff, commitDataChanges } from '@/lib/admin/git';

export const dynamic = 'force-static';

const PROJECT_ROOT = process.cwd();

// GET: Return current git status for data/ files
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const status = getDataStatus(PROJECT_ROOT);
    const diff = getDataDiff(PROJECT_ROOT);
    return NextResponse.json({ status, diff, hasChanges: status.length > 0 });
  } catch (err) {
    return NextResponse.json({ error: `Git status failed: ${err}` }, { status: 500 });
  }
}

// POST: Commit and optionally push
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const { message, push } = await request.json();
    if (!message) {
      return NextResponse.json({ error: 'Commit message is required' }, { status: 400 });
    }

    const result = commitDataChanges(PROJECT_ROOT, message, push);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: `Commit failed: ${err}` }, { status: 500 });
  }
}
