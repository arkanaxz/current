import { NextResponse } from "next/server";
import { findUserByUsername } from "@/lib/db";
import { startSession, validPassword, validUsername, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!validUsername(username) || !validPassword(body.password)) {
      return NextResponse.json({ error: "Enter a valid username and password." }, { status: 400 });
    }
    const user = await findUserByUsername(username);
    if (!user || !verifyPassword(body.password, user.password_salt, user.password_hash)) {
      return NextResponse.json({ error: "The username or password is incorrect." }, { status: 401 });
    }
    await startSession(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}



