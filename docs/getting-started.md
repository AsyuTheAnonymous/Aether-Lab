# Getting started

Aether Lab is a static website: one `index.html` plus CSS, JavaScript, fonts and a logo. There is no build step and no back end — every bit of work happens in the visitor's browser.

## Two editions

| Edition | Stations | Where it comes from |
| --- | --- | --- |
| **Full** | Patch, Create, Forwarder, Analyze, Codex | The repository itself (`main`). No build. |
| **Patcher** | Patch, Create, Analyze, Codex | The `patcher-site` branch, rebuilt automatically on every push to `main`. You can also build it yourself with `node tools/build-patcher.js`. |

The patcher edition leaves out the Switch forwarder station and all of its code. It exists so you can host the patching tools on a server you'd rather keep separate from Switch tooling, such as hosting shared with a business or client sites, and run the full edition somewhere else, like GitHub Pages.

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
2. Repository: `https://github.com/AsyuTheAnonymous/Aether-Lab.git` (or your fork).
   - Branch **`patcher-site`** for the patcher edition.
   - Branch **`main`** for the full edition.
3. Leave the install directory empty to deploy into the site's `public_html`.
4. Turn on **auto-deployment** if you want updates to go live on their own. Hostinger gives you a webhook URL to add under the repo's **Settings → Webhooks**. For `patcher-site`, that's every time the publish workflow updates the branch after a push to `main`.
5. Turn on **Force HTTPS** for the domain (hPanel → *Security* → *SSL*).

`.htaccess` adds the security headers and stops non-site files (`docs/`, `tests/`, `.github/`, `server.js`, `package.json`, Markdown) from being served.

#### Switching an existing deployment to the patcher edition

Hostinger deploys a branch into an empty folder, so you switch by starting fresh:

1. hPanel → your site → **Git** → delete the existing repository entry.
2. hPanel → **File Manager** → open the site's folder (`public_html` for the main domain, or the subdomain's own folder) and delete the old Aether Lab files.
3. Back in **Git**, add the repository again with branch `patcher-site`, then click **Deploy**.
4. Open the site and hard-refresh. The tab bar should read Patch, Create, Analyze, Codex, with no Forwarder tab.

### Hostinger — Node.js web app

If you deploy through Hostinger's Node.js hosting instead, point it at the repository (branch `patcher-site` or `main`, as above) and use:

| Setting | Value |
| --- | --- |
| Install / build command | none needed (there are no dependencies) |
| Start command | `npm start` |
| Node version | 20 or newer |

`server.js` listens on the `PORT` the platform provides.

### GitHub Pages (full edition)

1. On GitHub, open the repository → **Settings** → **Pages**.
2. Under *Build and deployment*, set **Source** to **Deploy from a branch**, then pick **`main`** and **`/ (root)`** → **Save**.
3. After a minute the site is live at `https://<user>.github.io/<repo>/` (for this repo: `https://asyutheanonymous.github.io/Aether-Lab/`). Every push to `main` updates it.

No workflow is needed. The empty `.nojekyll` file in the root tells Pages to serve the files as they are. Pages ignores `.htaccess` and `_headers`, but the `<meta>` CSP in the page still blocks all network requests. Pages is always HTTPS, so forwarder signature #2 works there.

### Netlify / Cloudflare Pages

| | Full edition | Patcher edition |
| --- | --- | --- |
| Build command | *(none)* | `node tools/build-patcher.js dist/patcher` |
| Publish directory | `/` (the repo root) | `dist/patcher` |

The `_headers` file carries the security headers for both hosts, and it's copied into the patcher edition.

## Updating

Pull or download the new version and replace the files. Nothing is stored on the server, so there is nothing to migrate. `index.html` is served with `Cache-Control: no-cache` by `server.js`; on other hosts a hard refresh may be needed right after an update.
