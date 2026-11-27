/**
 * The anti-forgery header for cookie-authenticated admin changes. The server sets the readable `admin_csrf` cookie at
 * sign-in and accepts a change only when this header repeats it (see docs and #549). Login and logout don't need it.
 */
export function adminCsrfHeaders(): Record<string, string> {
  if (typeof document === "undefined") return {};
  const match = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith("admin_csrf="));
  return match ? { "X-CSRF-Token": decodeURIComponent(match.slice("admin_csrf=".length)) } : {};
}
