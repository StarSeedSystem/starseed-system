/**
 * /api/flujos/gancho/[ruta] — entrada firmada de los Flujos de Genesis.
 *
 * POST con cabecera `X-StarSeed-Firma: sha256=<hmac>` y `X-StarSeed-Timestamp: <epoch ms>` del cuerpo crudo.
 * Utiliza verificación por ámbito con secreto del bóveda, ventana anti-repetición de 5 minutos y marca de tiempo.
 * Firma mala → 401 sin detalles.
 * Timestamp fuera de ventana o repetido → 400 con error específico.
 * Firma buena → el evento se deja en `starseed_memory_root/flujos/entrada/` y se responde 202.
 * Nunca se ejecuta Python desde aquí: el motor lo consume.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    construirEvento,
    nombreArchivoEntrada,
    sanitizarRuta,
} from "@/lib/mando/gancho";
import {
    verificarEntradaGancho,
    CABECERA_FIRMA,
    CABECERA_TIMESTAMP,
    PREFIJO_FIRMA,
    VALIDAD_ANTI_REPETICION_MS,
    ErrorEntrada,
} from "@/lib/genesis/conectores/ganchos-ambito";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Contexto {
    params: Promise<{ ruta: string }>;
}

// Almacén en memoria para anti-repetición por ámbito (timestamp usado)
// En producción debería ser persistente (ej. base de datos), pero para conexión
// usamos esta solución simple. Se reinicia en cada instancia del servidor.
const almacenAntiRepeticion: Map<string, Set<number>> = new Map();

export async function POST(req: Request, contexto: Contexto) {
    const { ruta: rutaCruda } = await contexto.params;
    const ruta = sanitizarRuta(rutaCruda ?? "");
    if (!ruta) return new NextResponse("Not Found", { status: 404 });

    // Cabeceras requeridas
    const cuerpo = await req.text();
    const cabeceraTimestamp = req.headers.get(CABECERA_TIMESTAMP);
    const cabeceraFirma = req.headers.get(CABECERA_FIRMA);

    // Para el ámbito de Flujos de Genesis usamos un identificador fijo
    // puesto que los flujos no están asociados a un ámbito específico.
    // En un futuro podría derivarse del contexto del flujo o del usuario.
    const ambitoId = "flujos-genesis";

    // Función para obtener el secreto del ámbito (usamos el secreto global
    // de los webhooks de producción, ya que no hay bóveda aplicada aún).
    const obtenerSecreto = async (_ambitoId: string): Promise<string | null> => {
        const secreto = process.env.PRODUCCION_WEBHOOK_SECRETO;
        return secreto ?? null;
    };

    // Función para obtener el timestamp actual.
    const obtenerAhora = () => Date.now();

    // Verificar la entrada usando el gancho de ámbito.
    const resultado = await verificarEntradaGancho(
        ambitoId,
        cuerpo,
        cabeceraTimestamp,
        cabeceraFirma,
        obtenerSecreto,
        obtenerAhora,
        {
            marcarUsado: (id: string, ts: number): void => {
                let set = almacenAntiRepeticion.get(id);
                if (!set) {
                    set = new Set();
                    almacenAntiRepeticion.set(id, set);
                }
                set.add(ts);
            },
            yaUsado: (id: string, ts: number): boolean => {
                return almacenAntiRepeticion.get(id)?.has(ts) ?? false;
            }
        }
    );

    if (!resultado.ok) {
        // Mapear errores a códigos HTTP
        let status = 400;
        switch (resultado.error) {
            case ErrorEntrada.FALTA_TIMESTAMP:
            case ErrorEntrada.TIMESTAMP_INVALIDO:
                status = 400;
                break;
            case ErrorEntrada.TIMESTAMP_FUERA_VENTANA:
            case ErrorEntrada.TIMESTAMP_REPETIDO:
                status = 400;
                break;
            case ErrorEntrada.FALTA_FIRMA:
            case ErrorEntrada.FIRMA_INVALIDA:
            case ErrorEntrada.SECRETO_NO_CONFIGURADO:
                status = 401;
                break;
            default:
                status = 400;
        }
        return new NextResponse(
            JSON.stringify({ error: resultado.error }),
            { status, headers: { "Content-Type": "application/json" } }
        );
    }

    // Entrada válida: proceder como antes
    let datos: unknown = cuerpo;
    try {
        datos = cuerpo ? JSON.parse(cuerpo) : null;
    } catch {
        // cuerpo no JSON: se guarda tal cual, el motor decide
    }
    const ahora = new Date();
    const carpeta = path.join(
        raizDelProyecto(), "starseed_memory_root", "flujos", "entrada");
    await mkdir(carpeta, { recursive: true });
    await writeFile(
        path.join(carpeta, nombreArchivoEntrada(ruta, ahora.getTime())),
        JSON.stringify(construirEvento(ruta, datos, ahora), null, 2) + "\n",
        "utf8",
    );
    return NextResponse.json({ ok: true }, { status: 202 });
}