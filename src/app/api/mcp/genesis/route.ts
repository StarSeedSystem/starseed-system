/**
 * POST /api/mcp/genesis — servidor MCP remoto de Genesis por ámbito (Ola 1019G).
 * La lógica pura vive en src/lib/genesis/mcp/ruta-ambito.ts; aquí conectan Supabase
 * y sesión. Auth: `Authorization: Bearer <token externo>` o `?ambito=` con sesión.
 * Contrato: architecture/genesis-conectores-abiertos.md §7. GET → 405.
 */
import { createClient } from "@/utils/supabase/server";
import { HERRAMIENTAS_MCP } from "@/lib/genesis/mcp/herramientas";
import { atenderPostMcp, type DepsRutaMcp, type RegistroLlamada } from "@/lib/genesis/mcp/ruta-ambito";
import { crearAlmacenMemoria, huellaSha256, type AlmacenTokens, type EntradaToken } from "@/lib/genesis/mcp/tokens-externos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" } as const;
type SupabaseCliente = Awaited<ReturnType<typeof createClient>>;

interface FilaToken {
    huella: string;
    ambito_id: string;
    alcance: string[] | null;
    caduca: string | null;
    usos: number | null;
    revocado_en: string | null;
}

function filaAEntrada(fila: FilaToken): EntradaToken {
    const enMs = (iso: string | null): number | undefined => {
        if (!iso) return undefined;
        const n = Date.parse(iso);
        return Number.isNaN(n) ? undefined : n;
    };
    return {
        huella: fila.huella, ambito: fila.ambito_id, alcance: fila.alcance ?? [], usos: fila.usos ?? 0,
        caduca: enMs(fila.caduca), revocadoEn: enMs(fila.revocado_en),
    };
}

export async function GET(): Promise<Response> {
    return errorRpc("Método no permitido: el MCP remoto responde por POST", -32000, 405, { Allow: "POST" });
}

/** Lee de Supabase la entrada del token por su huella SHA-256. */
async function leerEntradaToken(cliente: SupabaseCliente, valor: string): Promise<EntradaToken | null> {
    const huella = await huellaSha256(valor);
    const { data } = await cliente.from("genesis_tokens_externos").select("*").eq("huella", huella).maybeSingle();
    return data ? filaAEntrada(data as FilaToken) : null;
}

/** Persiste en Supabase los cambios de un token (usos, caducidad o revocación). */
function persistirToken(cliente: SupabaseCliente): (entrada: EntradaToken) => void {
    return (entrada: EntradaToken) => {
        void cliente.from("genesis_tokens_externos").upsert(
            {
                ambito_id: entrada.ambito, huella: entrada.huella, alcance: entrada.alcance, usos: entrada.usos,
                caduca: entrada.caduca === undefined ? null : new Date(entrada.caduca).toISOString(),
                revocado_en: entrada.revocadoEn === undefined ? null : new Date(entrada.revocadoEn).toISOString(),
            },
            { onConflict: "huella" },
        );
    };
}

/** Almacén síncrono sembrado con la entrada leída; cada cambio vuelve a Supabase. */
function crearAlmacenSembrado(entrada: EntradaToken | null, persistir: (entrada: EntradaToken) => void): AlmacenTokens {
    const memoria = crearAlmacenMemoria();
    if (entrada) memoria.guardar(entrada);
    return {
        guardar(cambio) { memoria.guardar(cambio); persistir(cambio); },
        leerPorHuella(huella) { return memoria.leerPorHuella(huella); },
        listarPorAmbito(ambito) { return memoria.listarPorAmbito(ambito); },
    };
}

/** Registro de cada llamada, sin datos sensibles; a lo mejor, nunca interrumpe. */
async function anotarLlamada(cliente: SupabaseCliente, registro: RegistroLlamada): Promise<void> {
    try {
        await cliente.from("genesis_llamadas").insert({
            ambito_id: registro.ambito, tipo: registro.tipo.slice(0, 50), metodo: registro.metodo.slice(0, 20),
            endpoint: registro.endpoint.slice(0, 500), status_code: registro.statusCode,
        });
    } catch {
        /* el registro falla en silencio: la llamada no se interrumpe */
    }
}

export async function POST(request: Request): Promise<Response> {
    let cuerpo: unknown;
    try {
        cuerpo = await request.json();
    } catch {
        return errorRpc("Cuerpo JSON inválido", -32700, 400);
    }
    const cabeceraAuth = request.headers.get("authorization");
    const supabase = await createClient();
    const esBearer = cabeceraAuth !== null && cabeceraAuth.startsWith("Bearer ");
    let ambitoSesion: string | null = null;
    let entrada: EntradaToken | null = null;
    if (!esBearer) {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return errorRpc("Se necesita un token Bearer de ámbito o una sesión.", -32001, 401);
        ambitoSesion = new URL(request.url).searchParams.get("ambito");
        if (!ambitoSesion) return errorRpc("Con sesión, indica el ámbito con ?ambito=.", -32001, 400);
    } else {
        entrada = await leerEntradaToken(supabase, cabeceraAuth.slice(7).trim());
    }
    const deps: DepsRutaMcp = {
        herramientas: HERRAMIENTAS_MCP,
        almacen: crearAlmacenSembrado(entrada, persistirToken(supabase)),
        ahora: () => Date.now(),
        registrarLlamada: (registro: RegistroLlamada) => anotarLlamada(supabase, registro),
    };
    const respuesta = await atenderPostMcp(cuerpo, cabeceraAuth, ambitoSesion, deps);
    const codigo = "error" in respuesta ? respuesta.error.code : null;
    const status = codigo === -32001 ? 401 : codigo === -32002 ? 429 : 200;
    return Response.json(respuesta, { status, headers: SIN_CACHE });
}

function errorRpc(mensaje: string, codigo: number, status: number, cabeceras: Record<string, string> = SIN_CACHE): Response {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: codigo, message: mensaje } }, { status, headers: cabeceras });
}