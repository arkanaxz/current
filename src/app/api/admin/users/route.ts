import { NextResponse } from "next/server";
import { currentUser, hashPassword, validPassword, validUsername } from "@/lib/auth";
import { createRegularUser, listUsers, logActivity } from "@/lib/db";

export const runtime="nodejs";

export async function GET() {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(user.role!=="admin")return NextResponse.json({error:"Admin access required."},{status:403});
  return NextResponse.json({users:await listUsers()},{headers:{"Cache-Control":"private, no-store"}});
}

export async function POST(request:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(user.role!=="admin")return NextResponse.json({error:"Admin access required."},{status:403});
  try {
    const body=await request.json(),username=typeof body.username==="string"?body.username.trim():"";
    if(!validUsername(username))return NextResponse.json({error:"Use 3–32 letters, numbers, dots, dashes, or underscores."},{status:400});
    if(!validPassword(body.password))return NextResponse.json({error:"Use a password between 10 and 200 characters."},{status:400});
    const credentials=hashPassword(body.password);
    await createRegularUser(username,credentials.hash,credentials.salt);
    await logActivity(user,"admin.account.create","account","success","Viewer account created.",{username});
    return NextResponse.json({ok:true,users:await listUsers()},{status:201});
  } catch { await logActivity(user,"admin.account.create","account","error","Viewer account could not be created.",{}); return NextResponse.json({error:"Could not create the account. The username may already be in use."},{status:409}); }
}
