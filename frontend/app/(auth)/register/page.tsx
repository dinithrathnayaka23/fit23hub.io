"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIdCard, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { setAuth } from "@/lib/auth";

const container = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
      staggerChildren: 0.07,
    },
  },
} as const;

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
} as const;

const UOM_EMAIL_REGEX = /^[^\s@]+@uom\.lk$/i;
const INDEX_REGEX = /^23\d{4}[A-Z]$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,72}$/;

function hasFirstAndLastName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length >= 2;
}

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [indexNo, setIndexNo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!hasFirstAndLastName(fullName)) {
      setError("Full name must include first name and last name.");
      return;
    }

    if (!INDEX_REGEX.test(indexNo)) {
      setError("Index number must match format 23XXXXA (example: 235091X).");
      return;
    }

    if (!UOM_EMAIL_REGEX.test(email)) {
      setError("Student email must use @uom.lk domain.");
      return;
    }

    if (!STRONG_PASSWORD_REGEX.test(password)) {
      setError("Password must be 10-72 chars with uppercase, lowercase, number, and special character.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const result = await api.register({ fullName, indexNo, email, password });
      setAuth(result.token, result.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        className="glass-card w-full max-w-lg p-6"
        variants={container}
        initial="hidden"
        animate="show"
        whileHover={{ y: -3 }}
      >
        <motion.p variants={item} className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
          FIT23Hub Onboarding
        </motion.p>
        <motion.h1 variants={item} className="mt-2 text-2xl font-semibold">
          Create Student Account
        </motion.h1>
        <motion.form variants={item} className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={onSubmit}>
          <motion.input whileFocus={{ scale: 1.01 }} className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]" type="text" placeholder="Full name (First Last)" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <motion.input whileFocus={{ scale: 1.01 }} className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]" type="text" placeholder="Index number (235091X)" value={indexNo} onChange={(e) => setIndexNo(e.target.value.toUpperCase().trim())} required />
          <motion.input whileFocus={{ scale: 1.01 }} className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)] md:col-span-2" type="email" placeholder="Student email (@uom.lk)" value={email} onChange={(e) => setEmail(e.target.value.trim())} required />
          <motion.input whileFocus={{ scale: 1.01 }} className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <motion.input whileFocus={{ scale: 1.01 }} className="rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]" type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          <p className="text-xs text-[var(--muted)] md:col-span-2">Use at least 10 characters including uppercase, lowercase, number, and symbol.</p>
          {error && <p className="text-sm text-red-300 md:col-span-2">{error}</p>}
          <motion.button
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm hover:bg-[#2a4fb5] md:col-span-2 disabled:opacity-70"
            type="submit"
            disabled={loading}
          >
            {loading ? "Registering..." : "Register Account"}
            <FontAwesomeIcon icon={faUserPlus} className="h-4 w-4" />
          </motion.button>
        </motion.form>
        <motion.p variants={item} className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <FontAwesomeIcon icon={faIdCard} className="h-4 w-4" />
          Already registered? <Link className="text-[var(--accent)]" href="/login">Sign in</Link>
        </motion.p>
      </motion.div>
    </div>
  );
}
