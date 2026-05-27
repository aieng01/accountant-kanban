import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────

// Payload sent by Apps Script onEdit trigger
interface SheetSyncPayload {
  source: 'master' | 'general' | 'individual'
  id: string
  task_name?: string
  assigned_to?: string
  client_name?: string
  due_date?: string
  priority?: string
  entry_type?: string
  status?: string
  source_message?: string
  posted_by?: string
  posted_at?: string
  slack_ts?: string
  channel_id?: string
  permalink?: string
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Verify shared secret set in Apps Script
    const secret = req.headers.get('x-webhook-secret')
    if (secret !== process.env.APPS_SCRIPT_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: SheetSyncPayload = await req.json()

    if (!body.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // service role — bypasses RLS
    )

    // Build update object — only include fields that were sent
    // Different tabs send different subsets of columns
    const update: Record<string, string> = { updated_at: new Date().toISOString() }

    const fields: (keyof SheetSyncPayload)[] = [
      'task_name', 'assigned_to', 'client_name', 'due_date',
      'priority', 'entry_type', 'status', 'source_message',
      'posted_by', 'posted_at', 'slack_ts', 'channel_id', 'permalink',
    ]

    for (const field of fields) {
      if (body[field] !== undefined && body[field] !== null) {
        update[field] = body[field] as string
      }
    }

    const { data, error } = await supabase
      .from('tasks') // ← change to your actual table name if different
      .update(update)
      .eq('id', body.id)
      .select()
      .single()

    if (error) {
      console.error('[sync-from-sheet] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, updated: data })
  } catch (err) {
    console.error('[sync-from-sheet]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
