import { NextResponse } from "next/server";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const API_KEY  = process.env.GOOGLE_API_KEY;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sheetName = searchParams.get("sheet");

  if (!sheetName) {
    return NextResponse.json({ error: "Missing sheet param" }, { status: 400 });
  }

  const range = encodeURIComponent(`${sheetName}!A2:N500`);
  const url   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    return NextResponse.json({ error: `Failed to fetch ${sheetName}` }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ values: data.values || [] });
}
