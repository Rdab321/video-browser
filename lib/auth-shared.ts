// Shared by middleware (edge runtime) and the login route (node runtime); no imports allowed here.
export const AUTH_COOKIE = "vb_auth";
// The cookie holds HMAC-SHA256(password, AUTH_MESSAGE): changing the password logs everyone out.
export const AUTH_MESSAGE = "video-browser-auth-v1";
