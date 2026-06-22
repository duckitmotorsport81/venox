# VENOX — Website + Content Admin

A self-hosted CMS for the VENOX exhaust site (Duckit Motorsport). It serves the public
marketing site and gives you a **password-protected admin panel** to manage all photos,
videos and text — no code editing required.

You can edit:

- **Hero slides** — the full-screen slideshow at the top of the home page; each slide can be
  a photo and/or a muted looping **background video** (the photo acts as the poster/fallback)
- **Featured carousel** — the rotating "Featured" builds
- **System cards** — the three "Three Systems. One Standard." product lines
- **Models** — every car in the "Find Your Fit" grid and its detail subpage
  (multiple photos, part number, specs, review text, and a review video link)
- **Dealers** — your authorised dealers / stockists (shop name, address, contact), shown
  in the "Where to Buy" block on the home page. Add as many as you like.
- **Search filters** — the Series and Brand lists used by the search bar at the top of
  the Models page (the Model dropdown there is built automatically from your models)

Plus an **Export** button that bundles the whole site into a single `.html` file as a backup.

---

## 1. Run it on your computer

You need [Node.js](https://nodejs.org) (v18 or newer) installed.

```bash
# from this folder:
npm install        # one time only
npm start
```

Then open:

- Public site → **http://localhost:3000**
- Admin panel → **http://localhost:3000/admin**

Default admin password: **`venox-admin`** (change it before going live — see §6).

> If you change content in the admin, it updates the live site immediately.

---

## 2. Using the admin panel

1. Go to `/admin` and sign in.
2. Pick a tab: **Hero slides / Featured carousel / System cards / Models / Site**.
3. **Photos:** click *Upload / Replace*, choose an image. It uploads instantly.
4. **Videos:** in a model, paste a **YouTube link** or a direct **`.mp4` URL** into
   *Review video URL*. (Videos are linked, not uploaded — that keeps the site fast.)
5. **Text:** edit any field; changes are tracked.
6. Reorder slides/cards/models with the **↑ ↓** buttons; add/remove with the buttons on each card.
7. Click **Save changes** to publish. *(Uploaded photos are saved the moment you pick them;
   "Save changes" publishes the text edits and the new arrangement.)*

**Tip:** the first photo on a model is its grid thumbnail; all its photos show in the detail slider.

---

## 3. How content is stored

- All text + which photo goes where → **`data/content.json`**
- Uploaded photos → the **`media/`** folder
- The page layout/design → **`public/index.template.html`** (you normally never touch this)

The server fills the template with your content on every page load.

---

## 4. Export a single-file backup

In the admin, click **Export file**. You get one `index.html` with every image baked in —
handy as a backup or to hand someone a copy that works with no server. Copies are also saved
in the `exports/` folder.

---

## 4b. Publish FREE as a static site (recommended for client work)

You don't need a paid server. Edit content locally with the admin, then build a
static copy and host it free (Netlify / Cloudflare Pages / GitHub Pages) on any domain.

```bash
npm run build      # creates dist/  (index.html + media/)
```

Then publish `dist/`:
- **Netlify (easiest):** go to <https://app.netlify.com/drop> and **drag the `dist` folder** in → instant free URL. Create a free account to keep the site and add your custom domain (Site → Domain management → Add domain → follow the DNS records).
- **Cloudflare Pages:** connect this repo, set **build command** `npm run build`, **output dir** `dist`. Free, fast CDN, free custom domains.

To update later: edit in the local admin → `npm run build` again → re-publish `dist/`
(drag it in again, or push to the connected repo).

The static site keeps everything visitors use (slideshow, background video, Models
search, dealers, WhatsApp quote form). It just doesn't include the live `/admin` —
that's your local design tool. (If a client needs to self-edit online, that one needs
the paid server in §6.)

## 5. Re-running the migration (advanced)

The site was generated once from the original all-in-one `index.html` using:

```bash
npm run migrate
```

You only need this if you want to regenerate `content.json` + `media/` from a fresh original.
**It overwrites current content**, so don't run it on a live site.

---

## 6. Put it online with your own domain

You can't reach `localhost` from the internet — you deploy the app to a host, then point
your domain at it. Recommended host: **Render** (simple, HTTPS included).

### Step A — Put the code on GitHub
1. Create a free account at <https://github.com> and a new **private** repository.
2. Upload this whole folder to it (GitHub Desktop is the easy way, or `git push`).
   *(`node_modules` and `exports` are ignored automatically.)*

### Step B — Deploy on Render
1. Create an account at <https://render.com> and connect your GitHub.
2. **New → Blueprint**, pick this repo. Render reads `render.yaml` and sets everything up,
   including a 1 GB persistent disk so your uploads survive restarts.
   *(Render disks need a paid instance — the Starter plan, ~$7/mo. The free plan works but
   will lose uploaded photos whenever it restarts.)*
3. When prompted, set **`VENOX_ADMIN_PASSWORD`** to a strong password of your choice.
4. Click deploy. In ~2 minutes you'll get a URL like `https://venox.onrender.com`.
   Check it, then check `https://venox.onrender.com/admin`.

### Step C — Connect your domain
1. Buy a domain (Namecheap, Cloudflare, GoDaddy, etc.).
2. In Render: your service → **Settings → Custom Domains → Add**. Enter e.g. `venox.com`
   and `www.venox.com`.
3. Render shows you DNS records (a `CNAME`/`A` record). Add them at your domain registrar.
4. Wait for it to verify (minutes to a couple of hours). HTTPS is automatic.

Done — your site is live at your domain, and you manage it at `https://yourdomain.com/admin`.

### Alternative host — Railway
<https://railway.app> works the same way: deploy from GitHub, add a **Volume** mounted at
`/var/data`, and set `VENOX_DATA_DIR=/var/data`, `VENOX_MEDIA_DIR=/var/data/media`,
plus `VENOX_ADMIN_PASSWORD`. Add your domain under the service's Networking settings.

---

## 7. Important: keep your uploads safe

On cloud hosts the normal disk is **wiped on every deploy/restart**. This app avoids that by
storing photos + content on a **persistent disk** (configured in `render.yaml`, or a Railway
volume). If you ever see uploads disappear after a restart, the persistent disk isn't set up —
check `VENOX_DATA_DIR` / `VENOX_MEDIA_DIR` point at the mounted disk.

Always good practice: click **Export file** now and then to keep an offline backup.

---

## 8. Settings & troubleshooting

| Setting | What it does | Default |
|---|---|---|
| `VENOX_ADMIN_PASSWORD` | Admin login password | `venox-admin` |
| `VENOX_SESSION_SECRET` | Signs login sessions (set a long random string in prod) | dev value |
| `PORT` | Port to listen on | `3000` |
| `VENOX_DATA_DIR` | Where `content.json` lives | `./data` |
| `VENOX_MEDIA_DIR` | Where uploaded photos live | `./media` |

- **Forgot the password?** Change `VENOX_ADMIN_PASSWORD` on the host and restart.
- **Locally**, copy `.env.example` to `.env` and edit it.
- **Photos too large / slow?** Resize big images to ~2000px wide before uploading.

---

## Project structure

```
server.js                 the web server (public site + admin API + export)
data/content.json         all editable content (the "database")
media/                    uploaded/extracted photos
public/index.template.html the page layout the server fills in
public/admin/index.html   the admin panel
scripts/migrate.js        one-time extractor from the original all-in-one file
render.yaml / Procfile    deployment config
index.html                the ORIGINAL all-in-one file (kept as a backup/source)
```
