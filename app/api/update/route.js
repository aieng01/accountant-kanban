import { NextResponse } from "next/server";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY  = process.env.GOOGLE_API_KEY;

export async function POST(request) {
  const { sheetName, rowIndex, colIndex, value } = await request.json();

  if (!sheetName || rowIndex == null || colIndex == null || value == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const rowNum = rowIndex + 2;
  const col    = String.fromCharCode(65 + colIndex);
  const range  = encodeURIComponent(`${sheetName}!${col}${rowNum}`);
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?valueInputOption=RAW&key=${API_KEY}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [[value]] }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to update cell" }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
