"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCircleCheck, faEye, faEyeSlash, faLock } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { api } from "@/lib/api";



const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,72}$/;

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
};

function PasswordField({ label, value, onChange, placeholder }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block text-sm">
      <span className="mb-1 inline-flex items-center gap-2 text-[var(--muted)]">
        <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
        {label}
      </span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          required
          className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 pr-10 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--muted)] transition hover:text-white"
        >
          <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} className="h-4 w-4" />
        </button>
      </div>
    </label>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [state, setState] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [email, setEmail] = useState("");
  const [tokenMessage, setTokenMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenMessage("This reset link is missing its token.");
      setState("invalid");
      return;
    }

    api.verifyResetToken(token)
      .then((result) => {
        setEmail(result.email);
        setState("valid");
      })
      .catch((err) => {
        setTokenMessage(err instanceof Error ? err.message : "This reset link is invalid or has expired.");
        setState("invalid");
      });
  }, [token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!STRONG_PASSWORD_REGEX.test(newPassword)) {
      setError("Password must be 10-72 characters with uppercase, lowercase, number, and symbol.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    try {
      await api.resetPassword({ token, newPassword });
      setState("done");
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        className="glass-card w-full max-w-md p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
          FIT23Hub Account Recovery
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-2 text-2xl font-semibold">
          Choose a New Password
        </motion.h1>

        {state === "checking" && (
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-5 text-sm text-[var(--muted)]">
            Checking your reset link...
          </motion.p>
        )}

        {state === "invalid" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
            <div className="rounded-lg border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] p-4 text-sm text-red-200">
              {tokenMessage}
            </div>
            <Link
              className="mt-4 inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]"
              href="/forgot-password"
            >
              Request a new link
            </Link>
          </motion.div>
        )}

        {state === "done" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
            <div className="flex items-start gap-3 rounded-lg border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.08)] p-4 text-sm text-emerald-200">
              <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Password reset successfully. Taking you to the sign-in page...</span>
            </div>
            <Link className="mt-4 inline-block text-sm text-[var(--accent)]" href="/login">
              Sign in now
            </Link>
          </motion.div>
        )}

        {state === "valid" && (
          <>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-2 text-sm text-[var(--muted)]">
              Setting a new password for <span className="text-white">{email}</span>. Use at least 10
              characters with uppercase, lowercase, a number, and a symbol.
            </motion.p>
            <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-6 space-y-4" onSubmit={onSubmit}>
              <PasswordField
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password"
              />
              <PasswordField
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Re-enter new password"
              />
              {error && <p className="text-sm text-red-300">{error}</p>}
              <motion.button
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-70"
                type="submit"
                disabled={saving}
              >
                {saving ? "Updating..." : "Reset Password"}
              </motion.button>
            </motion.form>
          </>
        )}

        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-5 text-sm text-[var(--muted)]">
          <Link className="inline-flex items-center gap-2 text-[var(--accent)]" href="/login">
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Back to sign in
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-6 text-sm text-[var(--muted)]">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
