"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { User } from "@/lib/types";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) return;

    api.adminUsers(token)
      .then((result) => setUsers(result.users))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load users"));
  }, [token]);

  const updateUser = async (id: string, payload: { role?: "STUDENT" | "ADMIN"; status?: "ACTIVE" | "SUSPENDED" }) => {
    if (!token) return;
    await api.updateUser(token, id, payload);
    const refreshed = await api.adminUsers(token);
    setUsers(refreshed.users);
  };

  return (
    <section className="glass-card overflow-hidden">
      {error && <p className="px-4 py-3 text-sm text-red-300">{error}</p>}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Index</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-b border-[var(--border)]/60">
              <td className="px-4 py-3">{user.fullName}</td>
              <td className="px-4 py-3 text-[var(--muted)]">{user.indexNo}</td>
              <td className="px-4 py-3">{user.role}</td>
              <td className="px-4 py-3">{user.status}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-white"
                    type="button"
                    onClick={() => updateUser(user.id, { role: user.role === "ADMIN" ? "STUDENT" : "ADMIN" })}
                  >
                    Toggle Role
                  </button>
                  <button
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-white"
                    type="button"
                    onClick={() => updateUser(user.id, { status: user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" })}
                  >
                    {user.status === "ACTIVE" ? "Suspend" : "Activate"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
