/**
 * El diario del publicador, visto desde cualquier sitio.
 *
 * Aquí NO se importa nada de `node:`: este archivo lo carga también el
 * navegador y las pruebas en jsdom. Lo que toca procesos y disco vive en
 * `publicador.ts`, que es solo de servidor. Tenerlo junto hacía que una prueba
 * de un componente intentara cargar `child_process` y ni siquiera arrancara.
 */

export type EstadoPaso = "pendiente" | "corriendo" | "ok" | "falla" | "omitido";

export interface PasoPublicacion {
    clave: string;
    titulo: string;
    estado: EstadoPaso;
    detalle: string;
    segundos: number;
}

export interface ArchivoVerificado {
    ruta: string;
    ok: boolean;
    porque: string;
}

export interface CambioVerificado {
    sha: string;
    titulo: string;
    integrado: boolean;
    aplicado: boolean;
    servido: boolean | null;
    porque: string;
    motivoServido?: string;
    archivos: ArchivoVerificado[];
}

export interface DiarioPublicacion {
    id: string;
    estado: "corriendo" | "hecho" | "con_avisos" | "fallo";
    nota: string;
    empezado: string;
    terminado: string | null;
    pasos: PasoPublicacion[];
    verificacion: CambioVerificado[];
    resumen: string;
    informe?: string;
}

/** Normaliza el JSON que escribe Python (snake_case) a lo que usa la interfaz. */
export function normalizarDiario(bruto: unknown): DiarioPublicacion | null {
    if (!bruto || typeof bruto !== "object") return null;
    const d = bruto as Record<string, unknown>;
    const pasos = Array.isArray(d.pasos) ? (d.pasos as Record<string, unknown>[]) : [];
    const verif = Array.isArray(d.verificacion) ? (d.verificacion as Record<string, unknown>[]) : [];
    return {
        id: String(d.id ?? ""),
        estado: (d.estado as DiarioPublicacion["estado"]) ?? "corriendo",
        nota: String(d.nota ?? ""),
        empezado: String(d.empezado ?? ""),
        terminado: d.terminado ? String(d.terminado) : null,
        resumen: String(d.resumen ?? ""),
        informe: d.informe ? String(d.informe) : undefined,
        pasos: pasos.map((p) => ({
            clave: String(p.clave ?? ""),
            titulo: String(p.titulo ?? ""),
            estado: (p.estado as EstadoPaso) ?? "pendiente",
            detalle: String(p.detalle ?? ""),
            segundos: Number(p.segundos ?? 0),
        })),
        verificacion: verif.map((v) => ({
            sha: String(v.sha ?? ""),
            titulo: String(v.titulo ?? ""),
            integrado: Boolean(v.integrado),
            aplicado: Boolean(v.aplicado),
            servido: v.servido === null || v.servido === undefined ? null : Boolean(v.servido),
            porque: String(v.porque ?? ""),
            motivoServido: v.motivo_servido ? String(v.motivo_servido) : undefined,
            archivos: Array.isArray(v.archivos)
                ? (v.archivos as Record<string, unknown>[]).map((a) => ({
                      ruta: String(a.ruta ?? ""),
                      ok: Boolean(a.ok),
                      porque: String(a.porque ?? ""),
                  }))
                : [],
        })),
    };
}

/** Lo que el panel enseña arriba: una frase que se entiende sin leer los pasos. */
export function tituloDeEstado(d: DiarioPublicacion | null): string {
    if (!d) return "Nadie ha publicado todavía desde aquí";
    const corriendo = d.pasos.find((p) => p.estado === "corriendo");
    if (d.estado === "corriendo") {
        return corriendo ? `Publicando · ${corriendo.titulo}` : "Publicando…";
    }
    if (d.estado === "fallo") {
        const roto = d.pasos.find((p) => p.estado === "falla");
        return roto ? `No se publicó · ${roto.titulo}` : "No se publicó";
    }
    if (d.estado === "con_avisos") return "Publicado, con avisos de la verificación";
    return "Publicado y verificado";
}
