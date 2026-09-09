"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faEnvelope, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { api } from "@/lib/api";



const UOM_EMAIL_REGEX = /^[^\s@]+@uom\.lk$/i;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!UOM_EMAIL_REGEX.test(email)) {
      setError("Email must use @uom.lk domain.");
      return;
    }

    setLoading(true);

    try {
      const result = await api.forgotPassword(email);
      setPreviewUrl(result.previewUrl ?? null);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start password reset");
    } finally {
      setLoading(false);
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
          Forgot Password
        </motion.h1>

        {sent ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-5">
            <div className="rounded-lg border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.08)] p-4 text-sm text-emerald-200">
              If that email belongs to a FIT23Hub account, a reset link is on its way. The link
              expires in 60 minutes and can only be used once.
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Check your inbox and your spam folder. You can close this page once you have the email.
            </p>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-[var(--accent)] underline"
              >
                Dev only: open the sent email preview
              </a>
            )}
          </motion.div>
        ) : (
          <>
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-2 text-sm text-[var(--muted)]">
              Enter your student email and we will send you a link to choose a new password.
            </motion.p>
            <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="mt-6 space-y-4" onSubmit={onSubmit}>
              <motion.label initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="block text-sm">
                <span className="mb-1 inline-flex items-center gap-2 text-[var(--muted)]">
                  <FontAwesomeIcon icon={faEnvelope} className="h-3 w-3" />
                  Email
                </span>
                <motion.input
                  whileFocus={{ scale: 1.01 }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  placeholder="student@uom.lk"
                  autoComplete="email"
                  required
                />
              </motion.label>
              {error && <p className="text-sm text-red-300">{error}</p>}
              <motion.button
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] disabled:opacity-70"
                type="submit"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
                <FontAwesomeIcon icon={faPaperPlane} className="h-4 w-4" />
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
