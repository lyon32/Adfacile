// Cookies de session : HttpOnly, SameSite=Lax, Secure dès que l'application est en https
// (SECURITE-BACKEND §3). Partagé par proxy.ts et les gestionnaires de routes.
export function authCookieOptions(appUrl: string): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
} {
  return { httpOnly: true, sameSite: 'lax', secure: appUrl.startsWith('https://'), path: '/' };
}
