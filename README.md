# AI Free for Boomers

Production source for aifreeforboomers.com. Static site, deployed on Cloudflare Pages.

## Layout

```
public/            the site itself (this is what ships)
  index.html         homepage — signup form, video, demo card, quiz
  about.html         founders
  resources.html     article index
  consulting.html    1-on-1 help + booking form
  cheat-sheet.html   printable lead magnet (fixed 816x1056 for PDF export)
  articles/          7 article pages
  uploads/           photos
  support.js         prototype component runtime (renders the {{ }} templates)
functions/api/
  subscribe.js       Cloudflare Pages Function — receives forms, calls Klaviyo
build.mjs          copies public/ to dist/
```

## Build

```
npm run build      # copies public/ into dist/
```

Cloudflare Pages settings: build command `npm run build`, output directory `dist`.
The `functions/` directory is picked up automatically from the repo root.

## Forms → Klaviyo

Three forms submit to `POST /api/subscribe`:

| Form | Sends |
|---|---|
| Homepage hero | email |
| Homepage quiz result | email + the three question/answer pairs + computed result |
| Consulting booking | email, name, note |

All land on Klaviyo list **`Y3RxhC`**. Each profile gets a `Signup source`
property so the three can be segmented apart, and quiz signups additionally
carry `Quiz answers` and `Quiz result`.

### Required setup before forms will work

The API key is read from the environment — it is deliberately **not** in this
repo, because anything in `public/` is downloadable by visitors.

In the Cloudflare Pages dashboard: **Settings → Environment variables**, add

| Name | Value |
|---|---|
| `KLAVIYO_API_KEY` | a **private** Klaviyo key, starts with `pk_` |
| `KLAVIYO_LIST_ID` | optional — overrides the default `Y3RxhC` |

Create the private key in Klaviyo under **Settings → Account → API Keys**. It
needs write access to profiles and list subscriptions. Do not use the public
6-character site ID here; that is a different value and will not authenticate.

Add the variable to both the Production and Preview environments if you want
the preview URL to accept signups too. Redeploy after adding it — environment
variables are read at deploy time.

### Opt-in behaviour

The endpoint sends `consent: SUBSCRIBED`. Whether someone receives a
confirmation email before joining is controlled by the list's own single- vs
double-opt-in setting in Klaviyo, not by this code.

## Editing copy

Every page is plain HTML with styling inline. Open the file, find the
sentence, retype it, save. No build step needed for text changes.

## Known constraints

- `support.js` loads React from unpkg.com at runtime. It works, but the site
  depends on that CDN being reachable. Rebuilding the pages as plain HTML +
  a small vanilla script would remove that dependency.
- Both founder images on the About page are the logo mark, not headshots.
- `cheat-sheet.html` is intentionally fixed-width for printing and is not
  linked from the navigation.
