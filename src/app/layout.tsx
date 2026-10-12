import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./Providers";
import "../styles/global.scss";

export const metadata: Metadata = {
  title: "Quevra | Network dashboard",
  description: "A clear view of the Quevra network.",
};

export default function RootLayout({ user }: { user: ReactNode }) {
  return (
    <html lang="en">
      <body className="menu-position-side menu-side-left full-screen color-scheme-dark with-content-panel">
        <Providers>{user}</Providers>
      </body>
    </html>
  );
}
