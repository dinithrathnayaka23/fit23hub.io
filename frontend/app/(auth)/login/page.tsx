"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightToBracket, faEnvelope, faLock } from "@fortawesome/free-solid-svg-icons";
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
  const [error, setError] = useState("");
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
      const result = await api.login({ email, password });
      setAuth(result.token, result.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
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
        <motion.p variants={item} className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
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
            <motion.input
              whileFocus={{ scale: 1.01 }}
              className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter Password"
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
            {loading ? "Signing In..." : "Sign In"}
            <FontAwesomeIcon icon={faArrowRightToBracket} className="h-4 w-4" />
          </motion.button>
        </motion.form>
        <motion.p variants={item} className="mt-4 text-sm text-[var(--muted)]">
          New student? <Link className="text-[var(--accent)]" href="/register">Create account</Link>
        </motion.p>
        <motion.p variants={item} className="mt-2 text-sm text-[var(--muted)]">
          Batch admin? <Link className="text-[var(--accent)]" href="/admin-login">Use admin login</Link> for admin panel controls.
        </motion.p>
      </motion.div>
    </div>
  );
}
