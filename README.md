<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# RouteOptimizer

A multi-stop route optimizer with AI-assisted address search, drag-to-reorder stops, saved addresses, and one-click export to Google Maps for turn-by-turn nav.

## Run locally

**Prerequisites:** Node.js 20+

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `GEMINI_API_KEY` — for the AI address-assist fallback
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — for auth + saved addresses
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

## Optional: paid geocoder

The default geocoder is the public Nominatim instance, which is rate-limited to ~1 req/sec/IP and not meant for production traffic. Set `VITE_GEOCODER_BASE_URL` (and optionally `VITE_GEOCODER_API_KEY`) to swap to a Nominatim-compatible provider like LocationIQ or Geoapify.
