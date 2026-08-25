import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavTabs } from "@/components/layout/nav-tabs";
import { DisclaimerFooter } from "@/components/layout/disclaimer-footer";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Totally N.F.A. — AI Stock Picks",
  description: "Educational AI-driven stock narrative & alert tracker. Not financial advice.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NavTabs />
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        <DisclaimerFooter />
        <Toaster />
      </body>
    </html>
  );
}
