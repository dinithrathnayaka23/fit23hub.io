"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCircleCheck, faEnvelopeCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { api } from "@/lib/api";

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
} as const;

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  // A missing token is knowable during render, so it seeds state directly
  // rather than being set from inside the effect.
  const [state, setState] = useState<"verifying" | "done" | "invalid">(token ? "verifying" : "invalid");
  const [message, setMessage] = useState(token ? "" : "This verification link is missing its token.");
  const [email, setEmail] = useState("");
  const ranRef = useRef(false);

  useEffect(() => {
    if (!token) return;

    // StrictMode double-invokes effects in dev and the token is single-use,
    // so guard against firing the mutation twice.
    if (ranRef.current) return;
    ranRef.current = true;

    api.verifyEmail(token)
      .then((result) => {
        setEmail(result.email);
        setState("done");
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "This verification link is invalid or has expired.");
        setState("invalid");
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        className="glass-card w-full max-w-md p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.p {...fadeIn} className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
          FIT23Hub Account
        </motion.p>
        <motion.h1 {...fadeIn} className="mt-2 text-2xl font-semibold">
          Email Verification
        </motion.h1>

        {state === "verifying" && (
          <motion.p {...fadeIn} className="mt-5 text-sm text-[var(--muted)]">
            Verifying your email address...
          </motion.p>
        )}

        {state === "done" && (
          <motion.div {...fadeIn} className="mt-5">
            <div className="flex items-start gap-3 rounded-lg border border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.08)] p-4 text-sm text-emerald-200">
              <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="text-white">{email}</span> is verified. Your account is now active.
              </span>
            </div>
            <Link
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]"
              href="/login"
            >
              <FontAwesomeIcon icon={faEnvelopeCircleCheck} className="h-4 w-4" />
              Sign in
            </Link>
          </motion.div>
        )}

        {state === "invalid" && (
          <motion.div {...fadeIn} className="mt-5">
            <div className="rounded-lg border border-[rgba(248,113,113,0.35)] bg-[rgba(248,113,113,0.08)] p-4 text-sm text-red-200">
              {message}
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              Verification links expire after 24 hours. Try signing in and use the resend option.
            </p>
            <Link
              className="mt-4 inline-block rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5]"
              href="/login"
            >
              Go to sign in
            </Link>
          </motion.div>
        )}

        <motion.p {...fadeIn} className="mt-5 text-sm text-[var(--muted)]">
          <Link className="inline-flex items-center gap-2 text-[var(--accent)]" href="/login">
            <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
            Back to sign in
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-6 text-sm text-[var(--muted)]">Loading...</div>}>
      <VerifyEmailInner />
    </Suspense>
  );
}
