import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

// ── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string
  task_name: string
  assigned_to: string
  client_name: string
  due_date: string
  priority: string
  entry_type: string
  status: string
  source_message: string
  posted_by: string
  posted_at: string
  slack_ts: string
  channel_id: string
  permalink: string
  recurrence: string | null
  created_at: string
  updated_at: string
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: Task
  old_record?: Task
}

interface ConfigRow {
  name: string
  email: string
  slackUserId: string
  tabName: string
  active: string
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function getAuthClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID!

// Fetch config sheet to get tab name → assigned_to mapping
async function getConfig(sheets: ReturnType<typeof google.sheets>): Promise<ConfigRow[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'config!A2:E',
  })
  return (res.data.values ?? []).map((row) => ({
    name: row[0] ?? '',
    email: row[1] ?? '',
    slackUserId: row[2] ?? '',
    tabName: row[3] ?? '',
    active: row[4] ?? '',
  }))
}

// Find a row by ID in a given sheet tab, returns 1-based row number or -1
async function findRowById(
  sheets: ReturnType<typeof google.sheets>,
  tabName: string,
  id: string
): Promise<number> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A:A`,
  })
  const rows = res.data.values ?? []
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) return i + 1 // 1-based
  }
  return -1
}

// Upsert a row: update if exists, append if not
async function upsertRow(
  sheets: ReturnType<typeof google.sheets>,
  tabName: string,
  id: string,
  values: (string | null)[]
) {
  const rowNum = await findRowById(sheets, tabName, id)
  if (rowNum > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tabName}!A${rowNum}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${tabName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    })
  }
}

// Delete a row by ID from a sheet tab
async function deleteRow(
  sheets: ReturnType<typeof google.sheets>,
  tabName: string,
  sheetId: number,
  id: string
) {
  const rowNum = await findRowById(sheets, tabName, id)
  if (rowNum < 0) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNum - 1,
              endIndex: rowNum,
            },
          },
        },
      ],
    },
  })
}

// Get sheetId (numeric) for a tab by name
async function getSheetId(
  sheets: ReturnType<typeof google.sheets>,
  tabName: string
): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === tabName)
  return sheet?.properties?.sheetId ?? 0
}

// ── Row builders per tab ─────────────────────────────────────────────────────

function masterRow(t: Task) {
  return [
    t.id, t.task_name, t.assigned_to, t.client_name, t.due_date,
    t.priority, t.entry_type, t.status, t.source_message,
    t.posted_by, t.posted_at, t.slack_ts, t.channel_id, t.permalink,
    t.recurrence ?? '',
  ]
}

function generalRow(t: Task) {
  return [
    t.id, t.task_name, t.client_name, t.due_date,
    t.priority, t.entry_type, t.status, t.source_message,
    t.posted_at, t.permalink,
  ]
}

function individualRow(t: Task) {
  return [
    t.id, t.task_name, t.client_name, t.due_date,
    t.priority, t.status, t.permalink,
  ]
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret
    const secret = req.headers.get('x-webhook-secret')
    if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload: WebhookPayload = await req.json()
    const { type, record, old_record } = payload

    const auth = getAuthClient()
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() as never })

    // Load config to find individual tab for assigned_to
    const config = await getConfig(sheets)
    const assignedTo = (record ?? old_record)?.assigned_to ?? ''
    const personConfig = config.find(
      (c) => c.active === 'TRUE' && c.name.toLowerCase() === assignedTo.toLowerCase()
    )

    if (type === 'DELETE' && old_record) {
      const masterSheetId = await getSheetId(sheets, 'master sheet')
      const generalSheetId = await getSheetId(sheets, 'general')
      await deleteRow(sheets, 'master sheet', masterSheetId, old_record.id)
      await deleteRow(sheets, 'general', generalSheetId, old_record.id)
      if (personConfig) {
        const indivSheetId = await getSheetId(sheets, personConfig.tabName)
        await deleteRow(sheets, personConfig.tabName, indivSheetId, old_record.id)
      }
      return NextResponse.json({ ok: true, action: 'deleted' })
    }

    if (type === 'INSERT' || type === 'UPDATE') {
      await upsertRow(sheets, 'master sheet', record.id, masterRow(record))
      await upsertRow(sheets, 'general', record.id, generalRow(record))
      if (personConfig) {
        await upsertRow(sheets, personConfig.tabName, record.id, individualRow(record))
      }
      return NextResponse.json({ ok: true, action: type.toLowerCase() })
    }

    return NextResponse.json({ ok: true, action: 'noop' })
  } catch (err) {
    console.error('[sync-to-sheet]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
