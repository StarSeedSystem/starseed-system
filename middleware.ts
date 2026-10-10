import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { aplicarCorsMando, preflightCorsMando } from '@/lib/metagenesis/cors-mando'

export async function middleware(request: NextRequest) {
    // (2026-10-10) MetaGenesis desde otras neuronas: CORS de /api/mando/* solo para los
    // orígenes del OS, sin cookies entre orígenes. Para la propia Mac no cambia nada.
    const preflight = preflightCorsMando(request)
    if (preflight) return preflight
    return aplicarCorsMando(request, await updateSession(request))
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
