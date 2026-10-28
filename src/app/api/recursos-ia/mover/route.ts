/**
 * POST /api/recursos-ia/mover — mover pesos entre almacenes con verificación SHA-256.
 * ─────────────────────────────────────────────────────────────────────────────
 * Copia un archivo o carpeta de modelo de un almacén local a otro (disco interno ↔ externo)
 * en flujo, calcula el SHA-256 al copiar, lo compara con el origen y SOLO entonces deja el nuevo.
 * El original no se borra (eso lo decide la persona). Comprueba espacio libre antes (margen 10 %).
 * Puerta: el guardián de Genesis (sin sesión solo la propia máquina; 404 en producción salvo
 * despliegue local). Rechaza rutas fuera de los volúmenes detectados.
 * SOP: architecture/recursos-ia-neurona.md §3, §7.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { detectarMaquina } from "@/lib/recursos-ia/deteccion-servidor";
import { moverPesos, type MoverEntrada, type MoverResultado } from "@/lib/recursos-ia/mover-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    let entrada: MoverEntrada;
    try {
        entrada = await request.json();
    } catch {
        return Response.json(
            { ok: false, error: "Cuerpo JSON inválido" },
            { status: 400 },
        );
    }

    // Validación básica de campos requeridos
    if (!entrada.origen || !entrada.destino) {
        return Response.json(
            { ok: false, error: "Faltan campos requeridos: origen y destino" },
            { status: 400 },
        );
    }

    // Obtener volúmenes detectados (con caché 60 s)
    const maquina = await detectarMaquina({});
    const volumenes = maquina.volumenes;

    // Ejecutar el movimiento
    const resultado: MoverResultado = await moverPesos(entrada, volumenes);

    const status = resultado.ok ? 200 : 400;
    return Response.json(resultado, { status, headers: { "Cache-Control": "no-store" } });
}