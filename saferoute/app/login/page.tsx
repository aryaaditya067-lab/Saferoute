"use client";

import { ArrowRight, Building2, Eye, EyeOff, Shield, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CityBackdrop } from "@/components/site/CityBackdrop";
import { LogoMark } from "@/components/ui/Logo";
import { useAuth, type UserRole } from "@/lib/auth";

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
    <div className="sr-about relative min-h-dvh bg-[#eef1f4] font-sans text-ink antialiased">
      <CityBackdrop />

      {/* Fixed header */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/50 bg-white/60 backdrop-blur-md backdrop-saturate-150">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8 lg:px-12">
          <Link href="/about" className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-[17px] font-semibold tracking-tight">SafeRoute</span>
          </Link>
          <Link
            href="/"
            className="group inline-flex h-9 items-center justify-center gap-2 rounded-full bg-brand px-4 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_20px_-6px_rgb(232_117_36/0.55)] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-brand-strong"
          >
            Open app
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      {/* Login card centred over the city */}
      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 pt-20 pb-10 sm:items-center sm:pt-16">
        <div className="sr-persp w-full max-w-[26rem]">
          <div className="sr-glass-card sr-glare rounded-[28px] p-7 sm:p-9">
            {/* Logo + tagline */}
            <div className="mb-7 flex flex-col items-center gap-1 text-center">
              <div className="sr-intro mb-2 flex items-center gap-2.5" style={{ "--d": "80ms" } as React.CSSProperties}>
                <LogoMark size={36} />
                <span className="sr-display text-[22px] font-semibold tracking-tight text-ink">SafeRoute</span>
              </div>
              <p className="sr-intro text-[14px] text-ink-muted" style={{ "--d": "180ms" } as React.CSSProperties}>
                Sign in to access safety features
              </p>
            </div>

            {/* Role toggle */}
            <div className="sr-intro mb-6 flex gap-1.5 rounded-2xl bg-white/40 p-1.5 ring-1 ring-white/50" style={{ "--d": "260ms" } as React.CSSProperties}>
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

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <h1 className="sr-intro sr-display text-[1.5rem] font-semibold tracking-tight text-ink" style={{ "--d": "320ms" } as React.CSSProperties}>
                {role === "government" ? "Government Portal" : "Welcome back"}
              </h1>
              <p className="sr-intro mt-1 mb-5 text-[13px] leading-relaxed text-ink-muted" style={{ "--d": "380ms" } as React.CSSProperties}>
                {role === "government"
                  ? "Sign in with your official .gov.in email to access incident management."
                  : "Sign in to use SOS, trip sharing and saved places."}
              </p>

              <div className="flex flex-col gap-4">
                <Field label="Full name" id="login-name" delay={420}>
                  <input
                    id="login-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={role === "government" ? "Officer name" : "Your name"}
                    autoComplete="name"
                    className="sr-login-input"
                  />
                </Field>

                <Field label="Email" id="login-email" delay={480}>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={role === "government" ? "name@police.gov.in" : "you@example.com"}
                    autoComplete="email"
                    className="sr-login-input"
                  />
                </Field>

                <Field label="Password" id="login-password" delay={540}>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="sr-login-input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted transition-colors hover:text-ink"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
              </div>

              {error && (
                <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-[15px] font-semibold text-white shadow-[0_1px_2px_rgb(0_0_0/0.08),0_8px_20px_-6px_rgb(232_117_36/0.55)] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-brand-strong active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? (
                  <span className="inline-block size-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    <Shield className="size-4" />
                    Sign in
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              {role === "government" && (
                <p className="mt-4 text-center text-[12px] text-ink-muted">
                  Government access is verified. Contact your department admin for credentials.
                </p>
              )}
            </form>

            <div className="mt-6 border-t border-black/[0.06] pt-5 text-center">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-soft transition-colors hover:text-brand"
              >
                Continue without signing in
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function RoleTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-semibold transition-all duration-200 ${
        active
          ? "bg-white/80 text-ink shadow-[0_1px_3px_rgb(0_0_0/0.08)] backdrop-blur"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({ label, id, delay, children }: { label: string; id: string; delay: number; children: React.ReactNode }) {
  return (
    <div className="sr-intro flex flex-col gap-1.5" style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">{label}</label>
      {children}
    </div>
  );
}
