import { redirect } from "next/navigation";

/**
 * Admin sign-in was merged into the single /login page - where you land after
 * signing in now depends on your role. This route stays so existing bookmarks
 * and links keep working.
 */
export default function AdminLoginRedirect() {
  redirect("/login");
}
