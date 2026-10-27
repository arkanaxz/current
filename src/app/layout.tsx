import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Current — Home electricity",
  description: "Track home electricity use, bills, air conditioners, and meter readings.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

