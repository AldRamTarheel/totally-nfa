"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NtfyTopicForm() {
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: { ntfyTopic: string }) => setTopic(data.ntfyTopic))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ntfyTopic: topic }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("ntfy topic saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Push Notifications</CardTitle>
        <CardDescription>
          Picks and weekly retrospectives are sent as push notifications via{" "}
          <a href="https://ntfy.sh" target="_blank" rel="noopener noreferrer" className="underline">
            ntfy.sh
          </a>{" "}
          — a free, no-signup push service. Install the ntfy app (iOS/Android) or visit ntfy.sh in a
          browser, subscribe to the exact topic name below, and you&apos;ll receive alerts here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex flex-col gap-3 max-w-sm">
          <Label htmlFor="ntfy-topic">ntfy topic name</Label>
          <Input
            id="ntfy-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="totally-nfa-alerts-your-secret"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Anyone who knows this exact string can subscribe to your alerts — pick something
            unguessable rather than a real password (it is not encrypted or authenticated).
          </p>
          <Button type="submit" disabled={loading || saving} className="w-fit">
            {saving ? "Saving..." : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
