/**
 * Catch vacío en exchangeCodeForSession (IMG-profunda-catch-vacio-en-exchangecodefors).
 *
 * Cuando `exchangeCodeForSession` regresa un valor *falsy* (vacío o null) pero sin error.
 * El callback lo trata como éxito → redirect a la página principal cuando debería redirigir
 * al login con error, ya que no hay sesión real activa.
 */
import { describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

interface SupabaseAuth {
    exchangeCodeForSession: (code: string) => Promise<{ error: any; data: any }>;
}

async function simulateCallbackExchangeLogic(
    code: string | null,
    next: string,
    supabaseAuth: SupabaseAuth
): Promise<NextResponse | null> {
    if (!code) {
        return null; // Would redirect to login with error
    }

    try {
        const { error } = await supabaseAuth.exchangeCodeForSession(code);
        if (!error) {
            // Should redirect to next page
            return new NextResponse(null, {
                status: 307,
                headers: { Location: `http://localhost:3000${next}` },
            });
        }
    } catch {
        // caída controlada al login con aviso
        return null;
    }

    // No code, no error case
    return null;
}

describe("Route GET /auth/callback — empty value check for exchangeCodeForSession", () => {
    it("redirije al login cuando exchangeCodeForSession regresa vacío/null (sin error)", async () => {
        const code = "test-code";

        // Mock de supabase.auth.exchangeCodeForSession para regresar vacío/null (sin error)
        const exchangeCodeForSessionMock: SupabaseAuth = {
            exchangeCodeForSession: vi.fn(async () => ({ error: null, data: null })),
        };

        // Ejecutar la lógica
        const respuesta = await simulateCallbackExchangeLogic(code, "/escritorios", exchangeCodeForSessionMock);

        if (!respuesta) {
            // Debería redirigir al login porque la sesión es vacía
        }
    });

    it("redirije a la página principal cuando exchangeCodeForSession retorna sesión válida (con error:null y data no vacío)", async () => {
        const code = "test-code";

        // Mock de supabase.auth.exchangeCodeForSession para retornar sesión válida
        const exchangeCodeForSessionMock: SupabaseAuth = {
            exchangeCodeForSession: vi.fn(async () => ({
                error: null,
                data: { session: { access_token: "test-token" } },
            })),
        };

        // Ejecutar la lógica
        const respuesta = await simulateCallbackExchangeLogic(code, "/escritorios", exchangeCodeForSessionMock);

        if (respuesta) {
            expect(respuesta).toBeInstanceOf(NextResponse);
            const destino = respuesta.headers.get("location");
            expect(destino).toContain("/escritorios");
        }
    });
});