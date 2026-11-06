import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { logActivity } from "@/lib/db";

export const runtime="nodejs";
const allowedFields=new Set(["billDate","periodFrom","periodTo","total","avgPerDay","generation","transmission","systemLoss","ancillary","bill","pricePerKwh"]);

export async function POST(request:Request) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Sign in required."},{status:401});
  if(user.role!=="admin")return NextResponse.json({error:"Admin access required."},{status:403});
  try {
    const body=await request.json(),status=body.status;
    if(!["started","success","error"].includes(status))return NextResponse.json({error:"Invalid OCR log status."},{status:400});
    const fields=Array.isArray(body.fields)?body.fields.filter((field:unknown)=>typeof field==="string"&&allowedFields.has(field)).slice(0,11):[];
    const fileType=["image/jpeg","image/png","image/webp"].includes(body.fileType)?body.fileType:null;
    const fileBytes=Number.isSafeInteger(body.fileBytes)&&body.fileBytes>=0&&body.fileBytes<=8*1024*1024?body.fileBytes:null;
    const message=status==="started"?"Local bill photo OCR started.":status==="success"?"Local bill photo OCR completed.":"Local bill photo OCR failed.";
    await logActivity(user,"bill.photo.ocr","bill_photo",status,message,{engine:"Tesseract.js in browser",fields,fileType,fileBytes,imageUploaded:false,imageStored:false});
    return NextResponse.json({ok:true},{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({error:"Could not record the OCR event."},{status:500});
  }
}
