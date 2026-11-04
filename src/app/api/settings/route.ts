import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getAiSettings, saveAiSettings } from "@/lib/db";
import { decryptApiKey, encryptApiKey } from "@/lib/ai-crypto";
import { text } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(user.role!=="admin")return NextResponse.json({error:"Admin access required."},{status:403});
  try {
    const setting=await getAiSettings(user.id);
    return NextResponse.json({provider:setting?.provider??"openai",model:setting?.model??"",hasApiKey:Boolean(setting?.cipher),autoAnalyze:Boolean(setting?.autoAnalyze),consent:Boolean(setting?.consent)},{headers:{"Cache-Control":"private, no-store"}});
  } catch { return NextResponse.json({error:"Could not load AI settings."},{status:500}); }
}

export async function PUT(request:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(user.role!=="admin")return NextResponse.json({error:"Admin access required."},{status:403});
  try {
    const body=await request.json();
    const provider=text(body.provider,20),model=text(body.model,120),apiKey=text(body.apiKey,500);
    if(!["openai","gemini","anthropic"].includes(provider??""))return NextResponse.json({error:"Choose a supported AI provider."},{status:400});
    if(!model)return NextResponse.json({error:"Enter a model ID."},{status:400});
    const consent=body.consent===true,autoAnalyze=body.autoAnalyze===true;
    if(autoAnalyze&&!consent)return NextResponse.json({error:"Accept the provider data-sharing notice before enabling automatic analysis."},{status:400});
    const existing=await getAiSettings(user.id);
    const key=apiKey?encryptApiKey(apiKey):existing?{cipher:existing.cipher,iv:existing.iv,tag:existing.tag}:null;
    if(consent&&!key)return NextResponse.json({error:"Enter an API key to save these settings."},{status:400});
    const encrypted=key??{cipher:"",iv:"",tag:""};
    await saveAiSettings(user.id,{provider:provider!,model,cipher:encrypted.cipher,iv:encrypted.iv,tag:encrypted.tag,autoAnalyze,consent});
    return NextResponse.json({ok:true,hasApiKey:Boolean(key)});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Could not save settings."},{status:500}); }
}
