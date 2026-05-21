<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# RouteOptimizer

A multi-stop route optimizer with AI-assisted address search, drag-to-reorder stops, saved addresses, and one-click export to Google Maps for turn-by-turn nav.

## Run locally

**Prerequisites:** Node.js 20+

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_MAPBOX_TOKEN` — for accurate address search (see "Geocoder" below)
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — for auth + saved addresses
   - `GEMINI_API_KEY` — optional, for the AI address-assist fallback
3. `npm run dev`

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Run the migration.** In the dashboard, open SQL Editor and paste the contents of `supabase/migrations/0001_saved_addresses.sql`, then Run. This creates the `saved_addresses` table, RLS policies, and enables realtime.
3. **Enable the Google provider.** Authentication → Providers → Google. You'll need a Google OAuth client ID + secret from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Add `https://YOUR-PROJECT.supabase.co/auth/v1/callback` as an authorized redirect URI on the Google OAuth client.
4. **Add your site URL** under Authentication → URL Configuration so OAuth redirects land back on your deployed app (and `http://localhost:3000` for dev).
5. Copy the project URL and `anon` public key from Project Settings → API into `.env.local`.

## Deploy to Netlify

1. Push this repo to GitHub.
2. In Netlify, **Add new site → Import an existing project** → pick the repo. The included `netlify.toml` sets the build command, publish directory, SPA fallback, and asset caching.
3. Under **Site settings → Environment variables**, add:
   - `GEMINI_API_KEY`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - (optional) `VITE_GEOCODER_BASE_URL`, `VITE_GEOCODER_API_KEY`, `VITE_GEMINI_MODEL`
4. Trigger a deploy. Once live, add the Netlify URL to Supabase's allowed redirect URLs (Authentication → URL Configuration).

## Geocoder

Address search uses **Mapbox** when `VITE_MAPBOX_TOKEN` is set — it has real US address coverage with house-number interpolation and autocomplete-grade ranking. This is strongly recommended; without it, search quality on residential addresses is poor.

1. Create a free account at [mapbox.com](https://account.mapbox.com/auth/signup/).
2. Copy your **default public token** (starts with `pk.`) from [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/).
3. Set it as `VITE_MAPBOX_TOKEN` locally (`.env.local`) and in Netlify's environment variables.

The free tier covers 100k geocoding requests/month, no billing required to start.

**Fallback:** if `VITE_MAPBOX_TOKEN` is unset, the app uses the keyless public Nominatim (OpenStreetMap) instance. It works without signup but has weak US residential coverage and is rate-limited to ~1 req/sec/IP. You can point the fallback at a Nominatim-compatible mirror (LocationIQ, Geoapify) via `VITE_GEOCODER_BASE_URL` / `VITE_GEOCODER_API_KEY`.
