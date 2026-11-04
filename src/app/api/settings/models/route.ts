import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getAiSettings } from "@/lib/db";
import { decryptApiKey } from "@/lib/ai-crypto";
import { text } from "@/lib/validation";

export const runtime="nodejs";

type ModelOption={id:string;label:string};
async function fetchModels(provider:string,key:string):Promise<ModelOption[]> {
  const headers:Record<string,string>={};
  let response:Response;
  if(provider==="openai") {
    headers.Authorization=`Bearer ${key}`;
    response=await fetch("https://api.openai.com/v1/models",{headers,cache:"no-store",signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error("The provider rejected the API key.");
    return (result.data??[]).filter((model:{id?:string})=>typeof model.id==="string"&&/^(gpt-|o[1-9]|ft:)/i.test(model.id)&&!/audio|transcribe|tts|realtime|image|embedding|moderation/i.test(model.id)).sort((a:{id:string;created?:number},b:{id:string;created?:number})=>(b.created??0)-(a.created??0)).map((model:{id:string})=>({id:model.id,label:model.id}));
  }
  if(provider==="anthropic") {
    headers["x-api-key"]=key;headers["anthropic-version"]="2023-06-01";
    const models:ModelOption[]=[];let pageToken="";
    for(let i=0;i<5;i++) {
      const query=new URLSearchParams({limit:"100"});if(pageToken)query.set("after_id",pageToken);
      response=await fetch(`https://api.anthropic.com/v1/models?${query}`,{headers,cache:"no-store",signal:AbortSignal.timeout(20000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error("The provider rejected the API key.");
      for(const model of result.data??[])if(typeof model.id==="string")models.push({id:model.id,label:model.display_name?`${model.display_name} · ${model.id}`:model.id});
      if(!result.has_more||!result.last_id)break;pageToken=result.last_id;
    }
    return models;
  }
  headers["x-goog-api-key"]=key;
  const models:ModelOption[]=[];let pageToken="";
  for(let i=0;i<5;i++) {
    const query=new URLSearchParams({pageSize:"100"});if(pageToken)query.set("pageToken",pageToken);
    response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?${query}`,{headers,cache:"no-store",signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error("The provider rejected the API key.");
    for(const model of result.models??[])if(typeof model.name==="string"&&(model.supportedGenerationMethods??[]).includes("generateContent"))models.push({id:model.name.replace(/^models\//,""),label:model.displayName?`${model.displayName} · ${model.name.replace(/^models\//,"")}`:model.name.replace(/^models\//,"")});
    if(!result.nextPageToken)break;pageToken=result.nextPageToken;
  }
  return models;
}

export async function POST(request:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(user.role!=="admin")return NextResponse.json({error:"Admin access required."},{status:403});
  try {
    const body=await request.json(),provider=text(body.provider,20),submittedKey=text(body.apiKey,500);
    if(!["openai","gemini","anthropic"].includes(provider??""))return NextResponse.json({error:"Choose a supported AI provider."},{status:400});
    let key=submittedKey;
    if(!key) {
      const saved=await getAiSettings(user.id);
      if(saved?.provider===provider&&saved.cipher)key=decryptApiKey(saved);
    }
    if(!key)return NextResponse.json({error:"Enter your API key to load this provider's models."},{status:400});
    const models=await fetchModels(provider!,key);
    if(!models.length)return NextResponse.json({error:"No supported text models were found for this API key."},{status:404});
    return NextResponse.json({models},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {
    return NextResponse.json({error:error instanceof Error?error.message:"Could not load the provider's models. Check the API key and try again."},{status:502});
  }
}
