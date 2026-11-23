# Getting started

Aether Lab is a static website: one `index.html` plus CSS, JavaScript, fonts and a logo. There is no build step and no back end — every bit of work happens in the visitor's browser.

## Run it on your own computer

### Option 1 — just open it

1. Download the repository (**Code → Download ZIP** on GitHub) and unzip it.
2. Double-click `index.html`.

It works straight from disk (`file://`) in current Chrome, Edge, Firefox and Safari, forwarders included. The scripts are plain `<script>` files rather than ES modules precisely so this keeps working.

### Option 2 — the bundled server

With [Node.js](https://nodejs.org) 20 or newer:

```bash
npm start              # http://localhost:3000
PORT=8080 npm start    # pick another port
```

`server.js` has no dependencies. It serves only the site's own folders (`index.html`, `css/`, `js/`, `fonts/`, `images/`, `licenses/`) and sends the same security headers as `.htaccess`.

## Browser support

| Feature | Needs |
| --- | --- |
| Patching, creating, analyzing | Any current browser |
| Forwarder signature #2 | WebCrypto — available on HTTPS, `localhost` and `file://`. Over plain HTTP the NSP is still built, just without that signature. |
| Big disc images | Memory: ~2 GB is the practical ceiling. Desktop Chrome and Firefox do best. |

## Deploy it

Any static host works. The site's own Content-Security-Policy is in a `<meta>` tag, so the "nothing can be uploaded" guarantee holds everywhere; the server-level headers below add frame protection and friends on top.

### Hostinger — static site from GitHub

1. In hPanel open your website, then the **Git** section (under *Advanced*).
2. Repository: `https://github.com/AsyuTheAnonymous/Aether-Lab.git` (or your fork), branch `main`. Leave the install directory empty to deploy into `public_html`.
3. Turn on **auto-deployment** if you want every push to `main` to go live — Hostinger gives you a webhook URL to add under the repo's **Settings → Webhooks**.
4. Turn on **Force HTTPS** for the domain (hPanel → *Security* → *SSL*).

`.htaccess` adds the security headers and stops the repo's non-site files (`docs/`, `tests/`, `.github/`, `server.js`, `package.json`, Markdown) from being served.

### Hostinger — Node.js web app

If you deploy through Hostinger's Node.js hosting instead, point it at the repository and use:

| Setting | Value |
| --- | --- |
| Install / build command | none needed (there are no dependencies) |
| Start command | `npm start` |
| Node version | 20 or newer |

`server.js` listens on the `PORT` the platform provides.

### GitHub Pages

**Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`.** No workflow is needed. GitHub Pages ignores `.htaccess`; the `<meta>` CSP still applies.

### Netlify / Cloudflare Pages

Build command: *(none)*. Publish directory: `/` (the repo root). The `_headers` file in the root carries the security headers for both.

## Updating

Pull or download the new version and replace the files. Nothing is stored on the server, so there is nothing to migrate. `index.html` is served with `Cache-Control: no-cache` by `server.js`; on other hosts a hard refresh may be needed right after an update.
