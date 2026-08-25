import { NtfyTopicForm } from "@/components/settings/ntfy-topic-form";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure how you receive alerts.</p>
      </div>
      <NtfyTopicForm />
    </div>
  );
}
