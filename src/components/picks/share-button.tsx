"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shares a pick detail page. Uses the native Web Share sheet where available
 * (mostly mobile browsers), otherwise falls back to copying the link.
 * `navigator` is only ever touched inside the click handler so this stays
 * SSR-safe.
 */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const absoluteUrl =
      typeof window !== "undefined" && url.startsWith("/")
        ? `${window.location.origin}${url}`
        : url;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: absoluteUrl });
      } catch {
        // User cancelled the share sheet or it failed silently — no action needed.
      }
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(absoluteUrl);
        setCopied(true);
        toast.success("Link copied!");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Couldn't copy link");
      }
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      {copied ? <Check /> : <Share2 />}
      {copied ? "Copied!" : "Share"}
    </Button>
  );
}
