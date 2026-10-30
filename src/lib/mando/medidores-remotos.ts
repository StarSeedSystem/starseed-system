/**
 * Medidores remotos por la puerta de datos del A1 (IND1029F · architecture/metagenesis-autonoma.md):
 * cuando Genesis corre fuera de la máquina con los archivos (publicada, otra neurona), los medidores
 * salen «sin datos»; el líder (IND1029E) copia cada minuto a la puerta una foto RESUMEN de ellos
 * (`metagenesis/estado.medidores`, `espejo_puerta.py · resumen_medidores`) y su arriendo
 * (`director/direccion.lider`, que dice de qué neurona). Aquí el parseo, la decisión y la marca.
 */
export const MAS_VIEJA_MS = 10 * 60_000;
export const VIDA_FOTO_MS = 2 * 3_600_000;
export const CACHE_MS = 60_000;
export const TOPE_PETICION_MS = 4_000;
export interface FotoPuerta {
    generadoEn: string; obsoleto: boolean; enjambreVivo: boolean; enjambrePausado: boolean;
    agentes: number; fila: number; estados: Record<string, number>;
}
/** `desde`: el dueño del arriendo vigente (`mac-…`); `tFoto`: ms de 1970 de la foto (0 si no hay). */
export interface LecturaPuerta {
    foto: FotoPuerta | null; desde: string | null; tFoto: number;
}
export const CLASE_FOTO = "metagenesis";
export const CLASE_ARRIENDO = "director";
const CLAVE_GLOBAL = "__starseedMedidoresRemotos";
/** Una foto del líder, con lista blanca de campos (solo estados de nombre corto). `null` si no vale. */
export function parsearFoto(datos: unknown): FotoPuerta | null {
    if (!datos || typeof datos !== "object") return null;
    const d = datos as Record<string, unknown>;
    const generadoEn = typeof d.generado_en === "string" ? d.generado_en.slice(0, 40) : "";
    if (!generadoEn || !Number.isFinite(Date.parse(generadoEn))) return null;
    const num = (v: unknown) => Math.max(0, Math.trunc(Number(v)) || 0);
    const estados = Object.entries((d.estados ?? {}) as Record<string, unknown>).slice(0, 10);
    return {
        generadoEn, obsoleto: d.obsoleto === true, enjambreVivo: d.enjambre_vivo === true, enjambrePausado: d.enjambre_pausado === true,
        agentes: num(d.agentes), fila: num(d.fila),
        estados: Object.fromEntries(estados.filter(([k]) => /^[a-z_]{1,20}$/.test(k)).map(([k, c]) => [k, num(c)])),
    };
}

/** El dueño del arriendo vigente («desde <neurona>»), o `null` si caducó o no encaja. */
export function parsearArriendo(datos: unknown, ahora: number): string | null {
    const d = datos as { dueno?: unknown; caduca?: unknown } | null;
    const dueno = typeof d?.dueno === "string" ? d.dueno : "";
    const caduca = Number(d?.caduca) * 1000;
    return /^[A-Za-z0-9_.-]{1,60}$/.test(dueno) && Number.isFinite(caduca) && caduca > ahora ? dueno : null;
}

/** ¿Lo local de esta instancia está vacío? (Genesis publicada, otra neurona: no hay archivos). */
export function faltaLocal(d: Partial<{ progreso: unknown; latidos: unknown; fila: unknown; ejecutables: unknown }> | null | undefined): boolean {
    const lleno = (v: unknown) => (Array.isArray(v) && v.length > 0) || (!!v && typeof v === "object" && Object.keys(v).length > 0);
    return !d ? true : !(lleno(d.progreso) || lleno(d.latidos) || lleno(d.fila) || lleno(d.ejecutables));
}
/** La foto manda solo SI está viva y lo local falta, o la reunión local es vieja y la foto más nueva. */
export function elegirFuente(e: { faltaLocal: boolean; localMs: number; fotoMs: number; ahora: number }): "local" | "puerta" {
    if (!e.fotoMs || e.ahora - e.fotoMs > VIDA_FOTO_MS) return "local";
    if (e.faltaLocal) return "puerta";
    return e.ahora - e.localMs > MAS_VIEJA_MS && e.fotoMs > e.localMs ? "puerta" : "local";
}

/** La marca que viaja al navegador: nada de rutas ni fichas; sin foto se dice (`hayFoto: false`). */
export function resumenDePuerta(l: LecturaPuerta | null, usada: boolean, ahora: number) {
    const f = l?.foto;
    if (!f) return { hayFoto: false, usada: false, desde: null, haceMin: null, generadoEn: null, foto: null };
    return {
        hayFoto: true, usada, desde: l.desde, haceMin: l.tFoto > 0 ? Math.max(0, Math.round((ahora - l.tFoto) / 60_000)) : null,
        generadoEn: f.generadoEn.slice(0, 40),
        foto: { obsoleto: f.obsoleto, enjambreVivo: f.enjambreVivo, enjambrePausado: f.enjambrePausado, agentes: f.agentes, fila: f.fila, estados: f.estados },
    };
}
/** Base y ficha por NOMBRE de variable (`.env.local` o el A1); solo `https://`. Sin ellas, local. */
export function destinoPuerta(): { base: string; ficha: string } | null {
    const base = String(process.env.PUERTA_DATOS_URL ?? "").trim().replace(/\/+$/, "");
    const ficha = String(process.env.PUERTA_DATOS_FICHA_ENJAMBRE ?? process.env.PUERTA_DATOS_FICHA ?? "").trim();
    return /^https:\/\/[A-Za-z0-9._-]+(:\d{2,5})?$/.test(base) && ficha && ficha.length <= 200 ? { base, ficha } : null;
}

/** Para las pruebas: olvida la última lectura (la caché vive en el proceso). */
export function reiniciarPuerta(): void {
    (globalThis as unknown as Record<string, unknown>)[CLAVE_GLOBAL] = undefined;
}
async function pedirJson(base: string, ficha: string, clase: string, pedirA: typeof fetch): Promise<unknown> {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), TOPE_PETICION_MS);
    try {
        const r = await pedirA(`${base}/v1/latidos?clase=${encodeURIComponent(clase)}&vivos_s=7200`, {
            headers: { Authorization: `Bearer ${ficha}`, Accept: "application/json" }, signal: ctrl.signal, cache: "no-store",
        });
        return (r.ok ? await r.json().catch(() => null) : null) as unknown;
    } catch { return null; } finally { clearTimeout(reloj); }
}
/** Junta las dos listas de latidos de la puerta (`direccion.lider` + `estado.medidores`). */
export function leerRespuestas(director: unknown, metagenesis: unknown, ahora = Date.now()): LecturaPuerta {
    const latido = (cuerpo: unknown, id: string) => {
        const lista = Array.isArray((cuerpo as { latidos?: unknown } | null)?.latidos) ? (cuerpo as { latidos: unknown[] }).latidos : [];
        return (lista.find((x) => x && typeof x === "object" && (x as { id?: unknown }).id === id) ?? {}) as { t?: unknown; datos?: unknown };
    };
    const f = latido(metagenesis, "estado.medidores");
    const foto = parsearFoto(f.datos);
    const tISO = Date.parse(String(f.t ?? ""));
    return {
        foto,
        desde: parsearArriendo(latido(director, "direccion.lider").datos, ahora),
        tFoto: Number.isFinite(tISO) ? tISO : foto ? Date.parse(foto.generadoEn) : 0,
    };
}

/** La última foto del líder (caché 60 s); `null` sin puerta, sin respuesta o sin foto viva. */
export async function leerPuerta(pedirA: typeof fetch = fetch, ahora = Date.now()): Promise<LecturaPuerta | null> {
    const g = globalThis as unknown as Record<string, { valor: LecturaPuerta | null; en: number } | undefined>;
    const m = g[CLAVE_GLOBAL] ?? { valor: null, en: 0 };
    if (m.en && ahora - m.en < CACHE_MS) return m.valor;
    const destino = destinoPuerta();
    if (!destino) return null;
    const [director, metagenesis] = await Promise.all([
        pedirJson(destino.base, destino.ficha, CLASE_ARRIENDO, pedirA),
        pedirJson(destino.base, destino.ficha, CLASE_FOTO, pedirA),
    ]);
    const lectura = leerRespuestas(director, metagenesis, ahora);
    m.valor = lectura.foto ? lectura : null;
    g[CLAVE_GLOBAL] = Object.assign(m, { en: ahora });
    return m.valor;
}