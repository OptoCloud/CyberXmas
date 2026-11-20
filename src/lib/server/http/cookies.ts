export function readCookie(request: Request, name: string): string | undefined {
  return request.headers.get('Cookie')?.split(';')
    .map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

/** A host-only, HTTPS-only cookie that scripts cannot read. Max-Age 0 clears it. */
export const secureCookie = (name: string, value: string, maxAgeSeconds: number): string =>
  `${name}=${value}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Lax`;
