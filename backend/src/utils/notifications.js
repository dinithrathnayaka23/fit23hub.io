import { prisma } from "../prisma.js";

/**
 * Notification delivery is always best-effort: an event that produced a real
 * change (an upload, a suspension, a password reset) must still succeed even if
 * writing the notification rows fails. Every helper here swallows and logs its
 * own errors, and callers are expected to fire them without awaiting the result
 * on the critical path.
 */
async function createMany(rows) {
  if (!rows.length) return 0;

  try {
    const result = await prisma.notification.createMany({ data: rows });
    return result.count;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[notifications] Failed to write notifications:", error);
    return 0;
  }
}

function buildRow(userId, { type, title, body, link = null, actorName = null }) {
  return { userId, type, title, body, link, actorName };
}

/** Notify one specific user. */
export async function notifyUser(userId, payload) {
  if (!userId) return 0;
  return createMany([buildRow(userId, payload)]);
}

/** Notify an explicit set of users. */
export async function notifyUsers(userIds, payload) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  return createMany(unique.map((id) => buildRow(id, payload)));
}

async function findRecipients(where, excludeUserId) {
  try {
    const users = await prisma.user.findMany({
      where: {
        ...where,
        status: "ACTIVE",
        isSystemAccount: false,
        emailVerifiedAt: { not: null },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    return users.map((user) => user.id);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[notifications] Failed to resolve recipients:", error);
    return [];
  }
}

/** Fan out to every active, verified student. */
export async function notifyAllStudents(payload, { excludeUserId } = {}) {
  const ids = await findRecipients({ role: "STUDENT" }, excludeUserId);
  return notifyUsers(ids, payload);
}

/** Fan out to every active admin. */
export async function notifyAdmins(payload, { excludeUserId } = {}) {
  const ids = await findRecipients({ role: "ADMIN" }, excludeUserId);
  return notifyUsers(ids, payload);
}

/** Fan out to the whole batch - students and admins alike. */
export async function notifyEveryone(payload, { excludeUserId } = {}) {
  const ids = await findRecipients({}, excludeUserId);
  return notifyUsers(ids, payload);
}

/**
 * Fire a notification job without blocking the response. Any rejection is
 * logged rather than surfacing as an unhandled promise rejection.
 */
export function dispatch(promiseFactory) {
  Promise.resolve()
    .then(promiseFactory)
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[notifications] Dispatch failed:", error);
    });
}
