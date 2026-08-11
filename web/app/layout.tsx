import "./globals.css";
import type { ReactNode } from "react";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";

const ui = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono" });

export const metadata = {
  title: "Lucent — verifiable PDF summaries",
  description: "Every summary point beams back to the exact source region it came from.",
};

// Applied before paint so a dark-theme user never sees a light flash.
const THEME_INIT = `try{var t=localStorage.getItem('lucent-theme');
if(!t)t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${ui.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
