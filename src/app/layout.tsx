import type { Metadata } from "next";
import "./globals.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "./light-admin.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Quevra | Network dashboard",
  description: "A clear view of the Quevra network.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700&display=swap" rel="stylesheet" />
      </head>
      <body className="menu-position-side menu-side-left full-screen with-content-panel">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
