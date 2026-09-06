/**
 * GET/PUT /api/mando/ajustes (Ola 233 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────
 * Lee y guarda la configuración del enjambre (`~/.starseed/enjambre.json`)
 * que el orquestador consulta al iniciar cada ola.
 *
 * ⚠️ Seguridad: puerta única `guardianMando` — 404 fuera de local/STARSEED_MANDO;
 * sesión solo en producción no local; localhost sin sesión (Ola 254 · 2026-09-06).
 * NUNCA devuelve la ruta absoluta del archivo (solo su etiqueta
 * `~/.starseed/enjambre.json`) ni claves, tokens o comandos.
 * El PUT valida TODO el cuerpo: rangos numéricos (1-6 / 1-6 / 1-120) y
 * lista blanca de proveedores/modelos. Un valor inválido se descarta y
 * se cae al valor por defecto documentado de ese campo.
 */

import { guardianMando } from "@/lib/mando/guardian";
import {
    ETIQUETA_ARCHIVO,
    escribirConfigEnjambre,
    leerConfigEnjambre,
    modelosSugeridos,
} from "@/lib/mando/ajustes-local";
import {
    AJUSTES_POR_DEFECTO,
    LIMITES,
    PROVEEDORES_PERMITIDOS,
    validarConfig,
} from "@/lib/mando/ajustes-tipos";
import type { ConfigEnjambre, ProveedorPermitido } from "@/lib/mando/ajustes-tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Respuesta del GET: configuración actual + metadatos para el panel. */
interface RespuestaAjustes {
    archivo: string;
    limites: typeof LIMITES;
    proveedores: readonly ProveedorPermitido[];
    modelosSugeridos: Record<ProveedorPermitido, readonly string[]>;
    porDefecto: ConfigEnjambre;
    config: ConfigEnjambre;
    actualizadoEn: string;
}

/** GET: devuelve la configuración actual (o los valores por defecto). */
export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const config = await leerConfigEnjambre();
    const cuerpo: RespuestaAjustes = {
        archivo: ETIQUETA_ARCHIVO,
        limites: LIMITES,
        proveedores: PROVEEDORES_PERMITIDOS,
        modelosSugeridos: modelosSugeridos(),
        porDefecto: AJUSTES_POR_DEFECTO,
        config,
        actualizadoEn: new Date().toISOString(),
    };

    return Response.json(cuerpo, {
        headers: { "Cache-Control": "no-store" },
    });
}

/** PUT: guarda la configuración saneada. */
export async function PUT(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await req.json();
    } catch {
        return Response.json(
            { error: "Cuerpo JSON inválido." },
            { status: 400 },
        );
    }

    const saneada = validarConfig(cuerpo);
    try {
        await escribirConfigEnjambre(saneada);
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido.";
        return Response.json(
            { error: `No se pudo guardar la configuración: ${mensaje}` },
            { status: 500 },
        );
    }

    return Response.json(
        {
            ok: true,
            config: saneada,
            actualizadoEn: new Date().toISOString(),
            mensaje:
                "Cambios guardados. Se aplicarán a la SIGUIENTE ola, no a la que está corriendo.",
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
