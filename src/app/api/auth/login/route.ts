import { NextResponse } from "next/server";
import { findUserByUsername, logActivity } from "@/lib/db";
import { startSession, validPassword, validUsername, verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username.trim() : "";
    if (!validUsername(username) || !validPassword(body.password)) {
      await logActivity(username?{username:username.slice(0,32)}:null,"auth.login","session","error","Invalid sign-in input.",{});
      return NextResponse.json({ error: "Enter a valid username and password." }, { status: 400 });
    }
    const user = await findUserByUsername(username);
    if (!user || !verifyPassword(body.password, user.password_salt, user.password_hash)) {
      await logActivity({username:username.slice(0,32)},"auth.login","session","error","Invalid username or password.",{});
      return NextResponse.json({ error: "The username or password is incorrect." }, { status: 401 });
    }
    await startSession(user.id);
    await logActivity(user,"auth.login","session","success","User signed in.",{});
    return NextResponse.json({ ok: true });
  } catch {
    await logActivity(null,"auth.login","session","error","Sign-in request could not be completed.",{});
    return NextResponse.json({ error: "Could not sign in." }, { status: 500 });
  }
}



