"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRightToBracket, faEnvelope, faEnvelopeCircleCheck, faEye, faEyeSlash, faLock } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { setAuth } from "@/lib/auth";
import SuspendedModal from "@/components/SuspendedModal";
import { isAdminRole } from "@/lib/types";

const container = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.08,
    },
  },
} as const;

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
} as const;

const UOM_EMAIL_REGEX = /^[^\s@]+@uom\.lk$/i;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [suspended, setSuspended] = useState<{ message: string; reason: string | null } | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuspended(null);
    setUnverifiedEmail("");
    setResendNotice("");

    if (!UOM_EMAIL_REGEX.test(email)) {
      setError("Email must use @uom.lk domain.");
      return;
    }

    setLoading(true);

    try {
      const result = await api.login({ email, password });
      setAuth(result.token, result.user);
      // One sign-in for everyone; where you land depends on your role.
      router.push(isAdminRole(result.user.role) ? "/admin" : "/dashboard");
    } catch (err) {
      if (err instanceof ApiError && err.payload?.suspended) {
        setSuspended({
          message: typeof err.payload.message === "string" ? err.payload.message : "You are suspended by the Admin",
          reason: typeof err.payload.reason === "string" ? err.payload.reason : null,
        });
      } else if (err instanceof ApiError && err.payload?.requiresVerification) {
        setUnverifiedEmail(typeof err.payload.email === "string" ? err.payload.email : email);
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const onResendVerification = async () => {
    setResendNotice("");
    setResending(true);
    try {
      const result = await api.resendVerification(unverifiedEmail);
      setPreviewUrl(result.previewUrl ?? null);
      setResendNotice("Verification email sent. Check your inbox and spam folder.");
    } catch (err) {
      setResendNotice(err instanceof Error ? err.message : "Could not resend the verification email");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        className="glass-card w-full max-w-md p-6"
        variants={container}
        initial="hidden"
        animate="show"
        whileHover={{ y: -3 }}
      >
        <motion.div variants={item}>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-[var(--muted)] transition hover:text-white"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Back to home
          </Link>
        </motion.div>
        <motion.p variants={item} className="mt-4 text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
          FIT23Hub Authentication
        </motion.p>
        <motion.h1 variants={item} className="mt-2 text-2xl font-semibold">
          Student Login
        </motion.h1>
        <motion.form variants={item} className="mt-6 space-y-4" onSubmit={onSubmit}>
          <motion.label variants={item} className="block text-sm">
            <span className="mb-1 inline-flex items-center gap-2 text-[var(--muted)]"><FontAwesomeIcon icon={faEnvelope} className="h-3 w-3" />Email</span>
            <motion.input
              whileFocus={{ scale: 1.01 }}
              className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder="student@uom.lk"
              required
            />
          </motion.label>
          <motion.label variants={item} className="block text-sm">
            <span className="mb-1 inline-flex items-center gap-2 text-[var(--muted)]"><FontAwesomeIcon icon={faLock} className="h-3 w-3" />Password</span>
            <div className="relative">
              <motion.input
                whileFocus={{ scale: 1.01 }}
                className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 pr-10 outline-none focus:border-[var(--accent)]"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--muted)] transition hover:text-white"
              >
                <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4" />
              </button>
            </div>
          </motion.label>
          <div className="flex justify-end">
            <Link className="text-xs text-[var(--accent)] hover:underline" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
          {unverifiedEmail && (
            <div className="rounded-lg border border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.08)] p-3 text-sm text-amber-100">
              <p className="flex items-start gap-2">
                <FontAwesomeIcon icon={faEnvelopeCircleCheck} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Verify <span className="text-white">{unverifiedEmail}</span> before signing in. We
                  emailed you a link when you registered.
                </span>
              </p>
              {resendNotice && <p className="mt-2 text-xs text-[var(--accent)]">{resendNotice}</p>}
              <button
                type="button"
                onClick={onResendVerification}
                disabled={resending}
                className="mt-2 rounded-lg border border-[rgba(250,204,21,0.4)] px-3 py-1.5 text-xs text-amber-100 transition hover:bg-[rgba(250,204,21,0.14)] disabled:opacity-60"
              >
                {resending ? "Sending..." : "Resend verification email"}
              </button>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block text-xs text-[var(--accent)] underline"
                >
                  Dev only: open the sent email preview
                </a>
              )}
            </div>
          )}
          {error && <p className="text-sm text-red-300">{error}</p>}
          <motion.button
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-70"
            type="submit"
            disabled={loading}
          >
            {loading ? "Signing In..." : "Sign In"}
            <FontAwesomeIcon icon={faArrowRightToBracket} className="h-4 w-4" />
          </motion.button>
        </motion.form>
        <motion.p variants={item} className="mt-4 text-sm text-[var(--muted)]">
          New student? <Link className="text-[var(--accent)]" href="/register">Create account</Link>
        </motion.p>
      </motion.div>
      <SuspendedModal
        open={suspended !== null}
        message={suspended?.message ?? ""}
        reason={suspended?.reason}
        onClose={() => setSuspended(null)}
      />
    </div>
  );
}
