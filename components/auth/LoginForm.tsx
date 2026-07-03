"use client";

import { useState } from "react";
import { sendMagicLinkAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage(null);

    const result = await sendMagicLinkAction(email);

    if ("error" in result) {
      setStatus("error");
      setMessage(result.error);
      return;
    }

    setStatus("sent");
    setMessage("Check your email for the magic link.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm text-muted">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@studio.com"
          className="w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus-ring focus:ring-2 focus:ring-ring"
        />
      </div>
      <Button type="submit" className="w-full" disabled={status === "loading"}>
        {status === "loading" ? "Sending…" : "Send magic link"}
      </Button>
      {message ? (
        <p
          className={`text-sm ${status === "error" ? "text-red-600" : "text-muted"}`}
          role="status"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
