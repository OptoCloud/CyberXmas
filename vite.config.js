import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-cloudflare';

// Turnstile loads its script and renders its challenge in an iframe from this origin.
const turnstile = 'https://challenges.cloudflare.com';

export default defineConfig({
  plugins: [sveltekit({
    adapter: adapter({
      // Workers AI only runs remotely, which needs a Cloudflare login. Local dev and preview use
      // local bindings unless CLOUDFLARE_REMOTE_BINDINGS=true.
      platformProxy: { remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS === 'true' }
    }),
    // Content Security Policy for rendered pages. SvelteKit adds a per-request nonce to its own
    // scripts and to the theme script in app.html (%sveltekit.nonce%). Static files get the other
    // security headers from _headers, and API responses from src/hooks.server.ts.
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        // Cloudflare Web Analytics injects its beacon when it is enabled for the zone.
        'script-src': ['self', `${turnstile}/turnstile/`, 'https://static.cloudflareinsights.com'],
        // Components set CSS custom properties through style attributes, which need unsafe-inline.
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:'],
        'font-src': ['self'],
        'connect-src': ['self', 'https://cloudflareinsights.com'],
        'frame-src': [turnstile],
        // form-action does not fall back to default-src. Sign-in is a link, not a form.
        'form-action': ['self'],
        'base-uri': ['self'],
        'object-src': ['none'],
        'frame-ancestors': ['none']
      }
    }
  })]
});
