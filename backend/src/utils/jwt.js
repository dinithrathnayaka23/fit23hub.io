import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
// Kept short because there is no refresh flow: a stolen token's blast radius
// is bounded by this expiry alone between the events (password change,
// suspension, "sign out everywhere") that bump tokenVersion and revoke it early.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1d";
const JWT_ISSUER = process.env.JWT_ISSUER || "fit23hub";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "fit23hub-users";

if (process.env.NODE_ENV === "production" && (JWT_SECRET === "change-this-secret" || JWT_SECRET.length < 32)) {
  throw new Error("JWT_SECRET must be changed and at least 32 chars in production.");
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      // Compared against the user's current tokenVersion on every request, so
      // a token issued before a revoking event is rejected even though its
      // signature and expiry are still perfectly valid.
      tv: user.tokenVersion ?? 0,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: "HS256",
    },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: ["HS256"],
  });
}
