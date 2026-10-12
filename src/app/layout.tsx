import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./Providers";
import "../styles/tailwind.css";

export const metadata: Metadata = {
  title: "Quevra | Network dashboard",
  description: "A clear view of the Quevra network.",
};

export default function RootLayout({ user }: { user: ReactNode }) {
  return (
    <html lang="en">
      <body className="qv:min-h-screen qv:overflow-x-hidden qv:bg-[#0b0c12] qv:font-[Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe_UI,sans-serif] qv:text-[#f2f2f8] qv:antialiased">
        <Providers>{user}</Providers>
      </body>
    </html>
  );
}
