"use client";

import { ArrowLeft, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import { Logo } from "@/components/ui/logo";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((response) => response.json())
      .then((data: { authenticated?: boolean }) => {
        if (data.authenticated) window.location.href = "/admin";
      })
      .catch(() => undefined)
      .finally(() => setChecking(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || "Sign-in failed.");
      window.location.href = "/admin";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center justify-center gap-3">
          <Logo />
          <div>
            <p className="font-display text-[24px] leading-none text-ink">Luma Studio</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">
              Studio dashboard
            </p>
          </div>
        </div>
        <div className="paper-card rounded-[28px] p-6 sm:p-8">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft/50 text-accent-dark">
            <LockKeyhole size={18} />
          </div>
          <h1 className="mt-4 font-display text-[28px] leading-tight text-ink">Welcome back.</h1>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Sign in to see today&apos;s appointments, manage services, and check the studio
            calendar.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Admin password
              </span>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoFocus
                  required
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-line bg-paper/60 px-3 py-2.5 pr-10 text-[13px] text-ink outline-none transition focus:border-accent/50 focus:bg-card"
                />
                <button
                  type="button"
                  onClick={() => setShow((current) => !current)}
                  className="focus-ring absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-paper hover:text-ink"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            {error && (
              <p className="rounded-xl border border-accent/25 bg-accent-soft/30 px-3 py-2 text-[11px] text-accent-dark">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || checking || !password}
              className="focus-ring w-full rounded-xl bg-ink px-4 py-2.5 text-[12px] font-semibold text-paper transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-[10px] leading-relaxed text-muted">
            The password is set by <code className="rounded bg-paper px-1 py-0.5">ADMIN_PASSWORD</code>{" "}
            in <code className="rounded bg-paper px-1 py-0.5">.env.local</code>.
          </p>
        </div>
        <a
          href="/"
          className="focus-ring mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted transition hover:text-accent"
        >
          <ArrowLeft size={12} /> Back to the customer site
        </a>
      </div>
    </div>
  );
}
