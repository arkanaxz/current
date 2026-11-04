import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { addAnalysisComment } from "@/lib/db";
import { text } from "@/lib/validation";

export const runtime="nodejs";

export async function POST(request:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  try {
    const body=await request.json(),runId=Number(body.runId),comment=text(body.comment,1000);
    if(!Number.isSafeInteger(runId)||runId<1||!comment)return NextResponse.json({error:"Enter a comment (up to 1,000 characters)."},{"status":400});
    if(!await addAnalysisComment(runId,user.id,comment))return NextResponse.json({error:"Review not found."},{status:404});
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:"Could not save the comment."},{status:500}); }
}
