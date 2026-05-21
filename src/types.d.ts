declare module '*.png' {
  const value: string;
  export default value;
}

interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  readonly VITE_MAPBOX_MONTHLY_BUDGET?: string;
  readonly VITE_GEOCODER_BASE_URL?: string;
  readonly VITE_GEOCODER_API_KEY?: string;
  readonly VITE_GEMINI_MODEL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
