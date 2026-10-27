import { redirect } from "next/navigation";
import AuthForm from "@/components/auth-form";
import { currentUser } from "@/lib/auth";
import { userCount } from "@/lib/db";

export const runtime = "nodejs";

export default async function LoginPage() {
  if (await currentUser()) redirect("/");
  if (await userCount() === 0) redirect("/setup");
  return <AuthForm mode="login" />;
}



