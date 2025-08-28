# Flex Reviews Dashboard — Practical Interview Submission

This repository contains a Next.js application that implements a **reviews dashboard** and **public property review pages** for The Flex. It ships with mock data, an internal API that normalizes/filters reviews, and an optional **Google Reviews** integration (mockable).

> **Live demo (Vercel):** the-flex-practical-interview.vercel.app  
> **GitHub repo:** github.com/danwib/the_flex_practical_interview/
> **Dashboard:** `/dashboard`  
> **Example property:** `/properties/2B%20N1%20A%20-%2029%20Shoreditch%20Heights`

---

## Contents
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
- [Data Sources](#data-sources)
- [API Routes](#api-routes)
- [Frontend Pages & UX](#frontend-pages--ux)
- [Design & Theming](#design--theming)
- [Key Decisions](#key-decisions)
- [Google Reviews – Findings & Approach](#google-reviews--findings--approach)
- [Deployment (Vercel)](#deployment-vercel)
- [Test with cURL](#test-with-curl)
- [Packaging for Submission](#packaging-for-submission)
- [Future Enhancements](#future-enhancements)

---

## Tech Stack

- **Next.js 15** (App Router) + **TypeScript**
- **Tailwind CSS v4** (token-based theming via CSS variables)
- Hosted on **Vercel**
- **Mock dataset** (Hostaway-like JSON) + optional **Google Reviews mock**

---

## Project Structure

Monorepo root: `the_flex_practical_interview/`  
The actual app lives in **`flex-reviews/`**.

```
flex-reviews/
├─ data/
│  ├─ mock-reviews.json                 # Hostaway-like mock dataset
│  ├─ google-places.json                # (optional real) listing -> Google Place ID
│  └─ google-mock-reviews.json          # mock Google reviews (for demo)
├─ scripts/
│  └─ generate-mock.js                  # deterministic mock data generator
├─ src/app/
│  ├─ api/reviews/hostaway/route.ts     # main reviews API (filters/sort/search)
│  ├─ api/reviews/google/route.ts       # Google Reviews (real or mock mode)
│  ├─ dashboard/page.tsx                # manager dashboard
│  ├─ properties/[slug]/page.tsx        # property details page
│  ├─ properties/[slug]/PublicReviewsClient.tsx
│  └─ properties/[slug]/reviews/page.tsx# public all-reviews page
├─ src/app/page.tsx                      # homepage → shows dashboard
├─ src/app/globals.css                   # design tokens & Tailwind base
├─ next.config.mjs                       # typedRoutes: true
├─ vercel.json                           # project dir and build settings
└─ package.json
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- npm

### Install & Run
```bash
cd the_flex_practical_interview/flex-reviews
cp .env.example .env.local   # optional; fill keys if you have them
npm install
npm run dev
# open http://localhost:3000
```

### Environment variables (`.env.local`)
```ini
# Hostaway (optional for demo; mock is bundled)
HOSTAWAY_ACCOUNT_ID=61148
HOSTAWAY_API_KEY=

# Google Places (optional; use ?mock=1 for demo)
GOOGLE_MAPS_API_KEY=
```

> The app **fails soft**: if keys are missing, APIs return empty results and the UI still renders.

### Build
```bash
npm run build
npm start
```

---

## Data Sources

### 1) Hostaway-like mock reviews
- File: `data/mock-reviews.json`
- Shape matches the assignment’s example.
- Regenerate deterministically:
  ```bash
  node scripts/generate-mock.js
  ```
  The generator produces ~60 reviews across these properties:
  - 2B N1 A - 29 Shoreditch Heights
  - 1BR Deluxe - Waterloo Arch 191
  - Studio - Canary Wharf Dockside
  - 2BR - King’s Cross St Pancras
  - Penthouse - Southbank Riverside

### 2) Google Reviews (optional, mockable)
- **Real mode**: add per-listing Google Place IDs to `data/google-places.json` and a `GOOGLE_MAPS_API_KEY` to `.env.local`.
- **Mock mode**: `data/google-mock-reviews.json` — one array of normalized reviews per listing name. Enable via query param `?mock=1` (see API below).

---

## API Routes

All routes return a consistent envelope:
```json
{ "status": "success", "result": [ /* reviews */ ] }
```

### `GET /api/reviews/hostaway`
Reads `data/mock-reviews.json` and supports filtering/sorting.

**Query params**
- `listing=<string>` — exact match by listing name
- `q=<string>` — full-text across listing/guest/review text
- `category=<string>` and `min=<0..10>` — filter by category rating threshold
- `from=<YYYY-MM-DD>` & `to=<YYYY-MM-DD>` — submitted date range
- `channel=<csv>` — case-insensitive (e.g. `hostaway,google`); Hostaway rows are defaulted to `channel: "Hostaway"`
- `type=<string>` — optional
- `sort=<date|rating>` and `order=<asc|desc>`
- `approvedOnly=true` — returns only server-approved rows if that flag exists in data

**Normalization**
- Guarantees:
  - `channel: "Hostaway"` (if absent)
  - `type: "guest-to-host"` (if absent)
  - `rating: number | null`
  - `submittedAtIso` (derived from `"YYYY-MM-DD HH:mm:ss"` when missing)

---

### `GET /api/reviews/google`
Fetches Google Place Details (reviews) **or** returns mock data when `mock=1` is set.

**Query params**
- `listing=<string>` — listing name; used to resolve Place ID from `data/google-places.json` (real) or key in `google-mock-reviews.json` (mock).
- `placeId=<string>` — (optional) bypass mapping and query a specific Place ID (real mode).
- `mock=1` — enable mock mode (read from `data/google-mock-reviews.json`).
- `limit=<n|all>` — mock mode only; number of mock reviews to return (default 5).

**Normalization**
- Ratings converted to **/10** (Google’s /5 ×2).
- Fields: `id` (stable numeric), `publicReview`, `guestName`, `listingName`, `submittedAt` (ISO), `channel: "Google"`, `sourceUrl` (if available).

**Notes**
- In **real mode**, the route requests a minimal field mask and returns **up to 5** reviews (as allowed by Places Details).  
- The route is explicitly `export const runtime = 'nodejs'` because it uses `fs` to read mapping files.

---

## Frontend Pages & UX

### `/dashboard` (Manager Reviews Dashboard)
- Filters: **search**, **listing**, **category + min**, **channel**, **type**, **sort** (date/rating) & **order**.
- **Approvals**: checkbox per row. For the demo, approval flags persist in **`localStorage`** keyed by `id`.
- **Channel-aware merge**:
  - If a **listing** is selected and channel allows Google → fetch Google for that listing and merge.
  - If **no listing** is selected and channel allows Google → fetch Google for **every listing** discovered from Hostaway and merge.
  - If channel is **Hostaway** → show Hostaway only.
- Quick nav dropdown to open the **Property** page or the **All Reviews** page in a new tab.

### `/properties/[slug]` (Property Details)
- Flex-inspired layout with **About**, **Amenities**, **Calendar placeholder**, and a **Reviews** section.
- Shows **approved-only** reviews (server-approved or local demo approvals).
- Merges Google (mock) + Hostaway for that property; tiny “Review from Google” attribution where applicable.

### `/properties/[slug]/reviews` (Public — All Approved Reviews)
- Lists all **approved** reviews for the property.

---

## Design & Theming
- **Light theme only**. Dark mode is explicitly removed to match the brief.
- Tokens in `globals.css`:
  - `--brand`, `--ink`, `--subtle`, `--surface`, `--line`
- Tailwind utilities use these tokens (e.g., `text-ink`, `bg-surface`, `border-line`).

---

## Key Decisions

- **Typed routes on**: `typedRoutes: true` in `next.config.mjs`  
  → Dynamic pages accept `params: Promise<{ slug: string }>` (builds cleanly with generated types).
- **Fail-soft APIs**: If an upstream provider (Google) is unavailable or keys are missing, the route returns success with an empty array so the UI remains functional.
- **Normalization at the edge**: API guarantees consistent shape (channel/type/rating/date ISO) for simpler clients.
- **Client-side merge for Google**: Keeps the server simple for the brief; minimizes storage; easy to toggle mock mode. (Production could move merging server-side with cache + concurrency caps.)
- **Approvals model**: Union of `server-approved || local approved`. In production this would be persisted in a DB (e.g., Vercel KV/Postgres) and exposed via `approvedOnly=true` queries.
- **Accessibility touches**: Focusable controls, readable contrast, sticky header/toolbars.

---

## Google Reviews — Findings & Approach
- **Place ID required per listing**: we use `data/google-places.json` to map listing name → Place ID (for real calls).
- **Quota/cost**: Place Details with `reviews` is billable; keep field mask tight and avoid fan-out calls in production.
- **Content policy**: Google content shouldn’t be stored long-term. We **fetch on demand**; mock mode is used for demo.
- **Limit**: Place Details typically returns **up to ~5** reviews. We mirror that in real mode; mock mode can exceed via `limit=all`.
- **Attribution**: Tiny “Review from Google” label is shown when channel is Google. Include `sourceUrl` if present.

---

## Deployment (Vercel)
- **Project root**: `flex-reviews/`
- **Build command**: `npm run vercel-build` (alias to `next build`)
- **Environment variables** (Project → Settings → Environment Variables):
  - `HOSTAWAY_ACCOUNT_ID`, `HOSTAWAY_API_KEY` (optional for demo)
  - `GOOGLE_MAPS_API_KEY` (optional; demo uses mock mode)
- **Route runtimes**: `/api/reviews/google` sets `runtime='nodejs'`.
- **Caching**: Hostaway route returns `Cache-Control: s-maxage=120, stale-while-revalidate=60`.

---

## Test with cURL

```bash
# Hostaway-like data — latest for a listing
curl "http://localhost:3000/api/reviews/hostaway?listing=Studio%20-%20Canary%20Wharf%20Dockside&sort=date&order=desc"

# Filter by category "cleanliness" >= 8
curl "http://localhost:3000/api/reviews/hostaway?category=cleanliness&min=8"

# Google mock for a listing (all mock items)
curl "http://localhost:3000/api/reviews/google?listing=Penthouse%20-%20Southbank%20Riverside&mock=1&limit=all"
```

---

## Packaging for Submission

### Zip the repo
From the **monorepo root**:
```bash
git clean -xfd         # optional: remove untracked/build artifacts
git archive --format=zip --output the_flex_practical_interview.zip HEAD
```
This produces a single zip containing `flex-reviews/` as the app.

### Include links
- Vercel live URL: the-flex-practical-interview.vercel.app
- GitHub repo: github.com/danwib/the_flex_practical_interview/


### Reviewer quick start
```bash
cd the_flex_practical_interview/flex-reviews
npm install
npm run dev
# (optional) node scripts/generate-mock.js
```

---

## Future Enhancements
- Server-side **combined** endpoint (`/api/reviews/combined`) that merges Hostaway + Google with short caching and concurrency limits.
- Replace localStorage approvals with a DB (Vercel KV/Postgres) + authorized API mutations.
- Real Hostaway integration (replace mock file) + resilient pagination.
- Property metadata (beds, baths, guests) from CMS/API to fully mirror The Flex layout.
- Integrate real calendar availability & booking CTA on the property page.
