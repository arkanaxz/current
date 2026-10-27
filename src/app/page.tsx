import { redirect } from "next/navigation";
import Dashboard from "@/components/dashboard";
import { currentUser } from "@/lib/auth";
import { userCount } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect(await userCount() === 0 ? "/setup" : "/login");
  return <Dashboard username={user.username} />;
}



