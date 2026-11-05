import { NextResponse } from "next/server";
import { currentUser, endSession } from "@/lib/auth";
import { logActivity } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const user=await currentUser();
  await endSession();
  if(user)await logActivity(user,"auth.logout","session","success","User signed out.",{});
  return NextResponse.json({ ok: true });
}

