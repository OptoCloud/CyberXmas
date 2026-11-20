// Editor authentication. EDITORIAL_AUTH selects the method:
//   token            shared EDITOR_TOKEN as a Bearer token (pilot default)
//   access           Cloudflare Access application token (per-editor identity)
//   access_and_token both, for defense in depth while migrating
import { timingSafeEqual } from '#lib/util/crypto.ts';
import { accessJwtHeader, verifyAccessJwt, type AccessIdentity } from '../clients/cloudflare/access.ts';
import type { Context } from '../context.ts';
import { error, json } from '../http/respond.ts';

export interface Editor {
  method: 'token' | 'access';
  /** Who is acting: Access email or service token, or "shared editor key". */
  name: string;
  access?: AccessIdentity;
}

export type EditorAuthResult = { editor: Editor; response?: never } | { editor?: never; response: Response };

async function validToken(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ') || header.length > 1024) return false;
  return timingSafeEqual(header.slice(7), secret);
}

export async function authenticateEditor(request: Request, ctx: Context): Promise<EditorAuthResult> {
  const { auth } = ctx.config.editorial;
  const useToken = auth !== 'access';
  const useAccess = auth !== 'token';
  if ((useToken && !ctx.features.editorToken) || (useAccess && !ctx.features.access)) {
    return { response: error(503, 'Editorial access is not configured') };
  }
  // `auth` tells the editorial UI whether to ask for a key.
  const denied = (message: string) => ({
    response: json({ error: message, auth }, 401, useToken ? { 'WWW-Authenticate': 'Bearer' } : {})
  });

  let access: AccessIdentity | null = null;
  if (useAccess) {
    access = await verifyAccessJwt(ctx.http, request.headers.get(accessJwtHeader), { ...ctx.config.access, now: ctx.now });
    if (!access) return denied('Sign in through Cloudflare Access');
  }
  if (useToken && !(await validToken(request, ctx.env.EDITOR_TOKEN!))) return denied('Invalid editor key');
  return {
    editor: access
      ? { method: 'access', name: access.email ?? access.commonName ?? access.subject, access }
      : { method: 'token', name: 'shared editor key' }
  };
}
