import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Lucent", description: "Verifiable PDF summaries" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
