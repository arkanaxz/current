import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { dashboardData, insertAc, insertBill, insertMeter, updateBill } from "@/lib/db";
import { dateString, optionalNumber, text } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json({ user, ...await dashboardData(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only the Admin can change household readings." }, { status: 403 });
  try {
    const { type, row } = await request.json();
    if (!row || typeof row !== "object") return NextResponse.json({ error: "Entry is missing." }, { status: 400 });
    if (type === "bill") {
      const billDate = row.billDate ? dateString(row.billDate) : null;
      const periodFrom = row.periodFrom ? dateString(row.periodFrom) : null;
      const periodTo = row.periodTo ? dateString(row.periodTo) : null;
      if (row.billDate && !billDate || row.periodFrom && !periodFrom || row.periodTo && !periodTo) return NextResponse.json({ error: "Enter valid bill dates." }, { status: 400 });
      const fields = ["ac","other","total","avgPerDay","generation","transmission","systemLoss","ancillary","bill","pricePerKwh"] as const;
      const values = Object.fromEntries(fields.map((key) => [key, optionalNumber(row[key])]));
      if (Object.values(values).some((value) => value === undefined)) return NextResponse.json({ error: "Use numeric values for bill amounts and rates." }, { status: 400 });
      if (!periodFrom || !periodTo) return NextResponse.json({ error: "Enter the billing period start and end dates." }, { status: 400 });
      await insertBill(user.id, { ...values, billDate, periodFrom, periodTo, comment: text(row.comment, 500) } as Record<string, string | number | null>);
    } else if (type === "ac") {
      const room=text(row.room,40),from=dateString(row.from),to=dateString(row.to),kwh=optionalNumber(row.kwh),days=optionalNumber(row.operationDays),hours=optionalNumber(row.operationHours),minutes=optionalNumber(row.operationMinutes);
      const invalidTime=days===undefined||hours===undefined||minutes===undefined||days!=null&&(!Number.isInteger(days)||days<0)||hours!=null&&(!Number.isInteger(hours)||hours<0)||minutes!=null&&(!Number.isInteger(minutes)||minutes<0||minutes>59);
      if(!["Home Office","Living Room","Masters Bedroom"].includes(room??"")||!from||!to||kwh==null||kwh===undefined||kwh<0||invalidTime)return NextResponse.json({error:"Choose a room, enter a date range and non-negative kWh, and enter whole days/hours plus 0–59 minutes."},{status:400});
      const operationHours=days==null&&hours==null&&minutes==null?null:(days??0)*24+(hours??0)+(minutes??0)/60;
      await insertAc(user.id,{room:room!,from,to,kwh,operationHours});
    } else if (type === "meter") {
      const date = dateString(row.date), reading = optionalNumber(row.reading);
      if (!date || reading == null || reading === undefined || reading < 0) return NextResponse.json({ error: "Enter a date and a non-negative meter reading." }, { status: 400 });
      await insertMeter(user.id, { date, reading });
    } else {
      return NextResponse.json({ error: "Unknown entry type." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...await dashboardData(user.id) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not save the entry." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only the Admin can change household readings." }, { status: 403 });
  try {
    const { id, type, row } = await request.json();
    if (type !== "bill" || !Number.isSafeInteger(id) || id < 1 || !row || typeof row !== "object") return NextResponse.json({ error: "Invalid bill update." }, { status: 400 });
    const billDate = row.billDate ? dateString(row.billDate) : null;
    const periodFrom = row.periodFrom ? dateString(row.periodFrom) : null;
    const periodTo = row.periodTo ? dateString(row.periodTo) : null;
    if (row.billDate && !billDate || !periodFrom || !periodTo) return NextResponse.json({ error: "Enter valid billing period dates." }, { status: 400 });
    const fields = ["ac","other","total","avgPerDay","generation","transmission","systemLoss","ancillary","bill","pricePerKwh"] as const;
    const values = Object.fromEntries(fields.map((key) => [key, optionalNumber(row[key])]));
    if (Object.values(values).some((value) => value === undefined)) return NextResponse.json({ error: "Use numeric values for bill amounts and rates." }, { status: 400 });
    const result = await updateBill(user.id, id, { ...values, billDate, periodFrom, periodTo, comment: text(row.comment, 500) } as Record<string, string | number | null>);
    if (Number(result.changes ?? result.rowsAffected ?? 0) === 0) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not update the bill." }, { status: 500 });
  }
}
