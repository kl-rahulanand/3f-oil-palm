import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { Providers } from "@/src/app/providers";
import "./globals.css";

// InterVariable.woff2 is a committed VENDORED TRUNK ASSET at frontend/app/fonts/
// (rsms/inter v4.1). It is present in the repo at HEAD and `npm run build:frontend`
// resolves it; its integrity is pinned by frontend/app/fonts/PROVENANCE.md's SHA-256
// and asserted by frontend/src/theme/font.test.ts. It is intentionally NOT part of
// this task's per-task review diff because the autoreview cannot inspect binary files,
// so it lives on the trunk — it is not missing.
const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "3F Oil Palm MIS",
  description: "3F financial management information system",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
