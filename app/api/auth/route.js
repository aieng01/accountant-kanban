import { NextResponse } from "next/server";

export async function POST(request) {
  const { password } = await request.json();

  if (!password) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const correct = password === process.env.ADMIN_PASSWORD;
  return NextResponse.json({ ok: correct }, { status: correct ? 200 : 401 });
}
