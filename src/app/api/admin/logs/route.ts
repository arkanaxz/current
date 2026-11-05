import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { listActivityLogs } from "@/lib/db";

export const runtime="nodejs";

export async function GET() {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(user.role!=="admin")return NextResponse.json({error:"Admin access required."},{status:403});
  return NextResponse.json({logs:await listActivityLogs(250)},{headers:{"Cache-Control":"private, no-store"}});
}
