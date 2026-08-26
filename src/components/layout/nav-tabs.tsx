"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/performance", label: "Performance" },
  { href: "/grading", label: "AI Auto-Grading" },
  { href: "/settings", label: "Settings" },
];

export function NavTabs() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-5xl px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-semibold tracking-tight shrink-0">Totally N.F.A.</span>
          {/* Full nav — laptop/tablet only. Hidden below sm to avoid the row
              overflowing/wrapping on narrow phones; those get the hamburger. */}
          <nav className="hidden sm:flex gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <ThemeToggle />
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="sm:hidden inline-flex items-center justify-center size-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="sm:hidden border-t px-4 py-2 flex flex-col gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "px-3 py-2 text-sm rounded-md transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
