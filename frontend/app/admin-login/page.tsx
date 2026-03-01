"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRightToBracket, faEnvelope, faLock } from "@fortawesome/free-solid-svg-icons";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { clearAuth, setAuth } from "@/lib/auth";

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

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!UOM_EMAIL_REGEX.test(email)) {
      setError("Admin email must use @uom.lk domain.");
      return;
    }

    setLoading(true);

    try {
      const result = await api.login({ email, password });

      if (result.user.role !== "ADMIN") {
        clearAuth();
        setError("This portal is only for batch admins.");
        return;
      }

      setAuth(result.token, result.user);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin login failed");
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
      >
        <motion.p variants={item} className="text-xs uppercase tracking-[0.14em] text-[var(--accent)]">
          FIT23Hub Administrator
        </motion.p>
        <motion.h1 variants={item} className="mt-2 text-2xl font-semibold">
          Admin Login
        </motion.h1>
        <motion.form variants={item} className="mt-6 space-y-4" onSubmit={onSubmit}>
          <motion.label variants={item} className="block text-sm">
            <span className="mb-1 inline-flex items-center gap-2 text-[var(--muted)]"><FontAwesomeIcon icon={faEnvelope} className="h-3 w-3" />Admin Email</span>
            <motion.input
              whileFocus={{ scale: 1.01 }}
              className="w-full rounded-lg border border-[var(--border)] bg-[rgba(11,18,32,0.6)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              placeholder="admin@uom.lk"
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
              placeholder="Enter admin password"
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
            {loading ? "Signing In..." : "Sign In as Admin"}
            <FontAwesomeIcon icon={faArrowRightToBracket} className="h-4 w-4" />
          </motion.button>
        </motion.form>
        <motion.p variants={item} className="mt-4 text-sm text-[var(--muted)]">
          Student? <Link className="text-[var(--accent)]" href="/login">Use student login</Link>
        </motion.p>
      </motion.div>
    </div>
  );
}
