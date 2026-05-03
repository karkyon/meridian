import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Meridian", description: "Project Intelligence System" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body>{children}</body></html>;
}
