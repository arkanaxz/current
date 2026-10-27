import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { dashboardData, insertAc, insertBill, insertMeter } from "@/lib/db";
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
      if (!billDate || !periodFrom || !periodTo || values.total == null || values.bill == null) return NextResponse.json({ error: "Bill date, billing dates, total kWh, and bill total are required." }, { status: 400 });
      await insertBill(user.id, { ...values, billDate, periodFrom, periodTo, comment: text(row.comment, 500) } as Record<string, string | number | null>);
    } else if (type === "ac") {
      const room = text(row.room, 80), from = dateString(row.from), to = dateString(row.to), kwh = optionalNumber(row.kwh);
      if (!room || !from || !to || kwh == null || kwh === undefined || kwh < 0) return NextResponse.json({ error: "Enter a room, date range, and a non-negative kWh value." }, { status: 400 });
      await insertAc(user.id, { room, from, to, kwh });
    } else if (type === "meter") {
      const date = dateString(row.date), reading = optionalNumber(row.reading);
      if (!date || reading == null || reading === undefined || reading < 0) return NextResponse.json({ error: "Enter a date and a non-negative meter reading." }, { status: 400 });
      await insertMeter(user.id, { date, reading });
    } else {
      return NextResponse.json({ error: "Unknown entry type." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, ...dashboardData(user.id) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not save the entry." }, { status: 500 });
  }
}



