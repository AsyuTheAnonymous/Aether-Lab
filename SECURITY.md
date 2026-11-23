# Security policy

Aether Lab handles sensitive files, including console keys and ROM dumps. Its core promise is that **nothing leaves the user's device**. Anything that breaks that promise is a security bug.

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x (latest release and `main`) | ✅ |
| Older | ❌ — please update |

## Reporting a vulnerability

**Please don't open a public issue.** Report privately through GitHub: go to the repository's **Security** tab and click **Report a vulnerability**, or use [this link](https://github.com/AsyuTheAnonymous/Aether-Lab/security/advisories/new).

Please include:

- what the problem is and what an attacker could do with it
- steps to reproduce, or a proof of concept (a crafted patch or file is fine, but no real ROMs or keys)
- the browser and version, plus how the app was served (`file://`, `npm start`, which host)

You should hear back within a week. Once a fix ships, you'll be credited in the release notes unless you'd rather not be.

## In scope

- Script injection through file names, ROM headers, patch metadata or `prod.keys` contents
- Anything that makes the page send data over the network, or weakens the Content Security Policy
- Keys, ROMs or derived data being written to storage, logs or anywhere outside memory
- Crafted patches or ROMs that hang the page, exhaust memory or run code when they should fail with an error
- Problems with the forwarder template integrity check (`js/nsp/template.js`)
- Path traversal or file exposure in `server.js`, `.htaccess` or `_headers`

## Out of scope

- Whether a forwarder or homebrew is allowed on a particular console or online service
- Bugs in Atmosphère, sigpatches, installers or RetroArch (please report those upstream)
- Self-inflicted cases, such as pasting code into your own browser console

## How the app protects you

- A strict Content Security Policy in the page, `.htaccess`, `_headers` and `server.js`. It allows no network connections (`connect-src 'none'`) and no inline scripts or styles, and only same-origin scripts, styles, fonts and images. When served with the bundled headers, the page can't be framed by other sites.
- Files are read with the File API and processed in memory. `prod.keys` is parsed on the device, and only the two keys the forwarder needs (`header_key` and `key_area_key_application_00`) are kept, in memory, until the page is closed.
- Every user-controlled string reaches the page through `textContent`.
- The embedded forwarder ExeFS is checked against a pinned SHA-256 before every build.
- No third-party code, CDNs, trackers or dependencies at runtime.
