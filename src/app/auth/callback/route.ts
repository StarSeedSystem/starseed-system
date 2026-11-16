import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { manejarCallback } from "@/lib/auth/manejar-callback";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const resultado = await manejarCallback({
    code,
    next,
    origin,
    exchangeFn: async (c: string) => {
      const supabase = await createClient();
      return supabase.auth.exchangeCodeForSession(c);
    },
  });

  return NextResponse.redirect(resultado.redirectTo);
}