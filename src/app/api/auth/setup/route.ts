import { NextResponse } from "next/server";
import { createFirstUser, userCount } from "@/lib/db";
import { hashPassword, startSession, validPassword, validUsername } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!validUsername(username)) return NextResponse.json({ error: "Use 3–32 letters, numbers, dots, dashes, or underscores for your username." }, { status: 400 });
    if (!validPassword(body.password)) return NextResponse.json({ error: "Use a password between 10 and 200 characters." }, { status: 400 });
    if (await userCount() > 0) return NextResponse.json({ error: "An account is already set up. Please sign in." }, { status: 409 });
    const credentials = hashPassword(body.password);
    const userId = await createFirstUser(username, credentials.hash, credentials.salt);
    await startSession(userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_ALREADY_EXISTS") {
      return NextResponse.json({ error: "An account is already set up. Please sign in." }, { status: 409 });
    }
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "That username is already in use." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}



