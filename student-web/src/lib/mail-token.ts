// Captured before Vue mounts; neither the token nor its URL enters storage or logs.
let mailToken: string | null = null;
if (["/verify-email", "/reset-password"].includes(location.pathname)) {
  mailToken = new URLSearchParams(location.hash.slice(1)).get("token");
  if (location.hash)
    history.replaceState(
      history.state,
      "",
      location.pathname + location.search,
    );
}
export function takeMailToken() {
  const token = mailToken;
  mailToken = null;
  return token;
}
