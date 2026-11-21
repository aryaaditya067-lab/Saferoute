"use client";

import { Building2, Eye, EyeOff, Shield, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth, type UserRole } from "@/lib/auth";
import { LogoMark } from "@/components/ui/Logo";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("user");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError("Name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (role === "government" && !email.endsWith(".gov.in") && !email.endsWith(".gov")) {
      setError("Government accounts require a .gov.in or .gov email.");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      login({ name: name.trim(), email: email.trim(), role });
      router.push("/");
    }, 600);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={40} />
            <span className="text-xl font-bold tracking-tight text-ink">SafeRoute</span>
          </Link>
          <p className="text-sm text-ink-muted">Sign in to access safety features</p>
        </div>

        {/* Role toggle */}
        <div className="mb-6 flex gap-2 rounded-2xl bg-cream-deep p-1.5">
          <RoleTab
            active={role === "user"}
            icon={<User className="size-4" />}
            label="User"
            onClick={() => setRole("user")}
          />
          <RoleTab
            active={role === "government"}
            icon={<Building2 className="size-4" />}
            label="Government"
            onClick={() => setRole("government")}
          />
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="rounded-3xl border border-line bg-paper p-6 shadow-control">
          <h1 className="mb-1 text-lg font-semibold text-ink">
            {role === "government" ? "Government Portal" : "Welcome back"}
          </h1>
          <p className="mb-5 text-[13px] text-ink-muted">
            {role === "government"
              ? "Sign in with your official .gov.in email to access incident management."
              : "Sign in to use SOS, trip sharing and saved places."}
          </p>

          <div className="flex flex-col gap-4">
            <Field label="Full name" id="name">
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={role === "government" ? "Officer name" : "Your name"}
                autoComplete="name"
                className="sr-input"
              />
            </Field>

            <Field label="Email" id="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === "government" ? "name@police.gov.in" : "you@example.com"}
                autoComplete="email"
                className="sr-input"
              />
            </Field>

            <Field label="Password" id="password">
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="sr-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
          </div>

          {error && (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-semibold text-white shadow-control transition-[background-color,transform] duration-150 hover:bg-brand-strong active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-block size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <>
                <Shield className="size-4" />
                Sign in
              </>
            )}
          </button>

          {role === "government" && (
            <p className="mt-4 text-center text-[12px] text-ink-muted">
              Government access is verified. Contact your department admin if you need credentials.
            </p>
          )}
        </form>

        <p className="mt-5 text-center text-[13px] text-ink-muted">
          <Link href="/" className="text-brand hover:underline">
            Continue without signing in
          </Link>
        </p>
      </div>
    </div>
  );
}

function RoleTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150 ${
        active
          ? "bg-paper text-ink shadow-control"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  );
}
