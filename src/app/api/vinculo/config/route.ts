/**
 * GET /api/vinculo/config — configuración PÚBLICA para vincular apps con StarSeed OS (2026-10-10).
 *
 * Las apps del ecosistema (Omnifrecuencias, Audiomorphic, las que se integren después) inician
 * sesión con la cuenta StarSeed OS. Si fijan el proyecto de Supabase en su código, se quedan
 * colgadas cuando el OS cambia de base de datos (pasó el 2026-10-10: Omnifrecuencias seguía en el
 * proyecto restringido y su login daba «exceed_egress_quota»). Aquí el OS dice cuál es su base de
 * datos ACTIVA y sus servicios de vinculación; las apps lo leen al arrancar.
 * Solo datos públicos por diseño (URL y clave anon, que ya van en el navegador del OS). Nunca una
 * clave de servicio. CORS abierto: cualquier app puede leerlo.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-max-age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const ok = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url) && anonKey.startsWith("eyJ");
  return NextResponse.json(
    {
      v: 1,
      os: "https://starseed-os.vercel.app",
      supabase: ok ? { url, anonKey } : null,
      servicios: {
        login: "https://starseed-os.vercel.app/login",
        estaciones: "https://starseed-os.vercel.app/estaciones",
      },
    },
    { headers: { ...CORS, "cache-control": "public, max-age=300, s-maxage=300" } },
  );
}
