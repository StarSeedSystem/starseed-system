import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
    createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key",
    );
