/**
 * Case-insensitive substring match for a Prisma string filter.
 *
 * Prisma's bare `contains` is case-sensitive on PostgreSQL, so searching for
 * "networks" would miss a title stored as "Networks". Every user-facing search
 * field goes through this helper instead, which keeps the behaviour in one
 * place rather than relying on each new query to remember the mode flag.
 *
 * Substring matching is deliberate: full-text search matches whole words and
 * stems, which would stop "IN21" finding module IN2130 and "235091" finding
 * index number 235091X.
 */
export const contains = (value) => ({ contains: value, mode: "insensitive" });
