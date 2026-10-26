// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Conversor por la malla (2026-10-23): pedir a la neurona con Filee
// ----------------------------------------------------------------------------
// El servicio de una neurona (`servicios/conversor`, puerto 4481 y token de
// malla) convierte lo que esta neurona no puede. Nada sale al mundo: solo a
// otra neurona de la cuenta. La consulta se inyecta para las pruebas.
// Contrato: `architecture/conversion-archivos.md` §6.
// ════════════════════════════════════════════════════════════════════════════

import { formatoDe, type DestinosFormato } from "./formatos";

export interface OpcionesMalla {
    url?: string;
    token?: string;
    fetchImpl?: typeof fetch;
}

function configMalla(opciones?: OpcionesMalla): { url: string; token: string; fetchImpl: typeof fetch } {
    return {
        url: (opciones?.url || process.env.STARSEED_CONVERSOR_URL || "http://127.0.0.1:4481").replace(/\/+$/, ""),
        token: opciones?.token ?? process.env.STARSEED_CONVERSOR_TOKEN ?? "",
        fetchImpl: opciones?.fetchImpl ?? fetch,
    };
}

function encabezados(token: string): HeadersInit {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface EstadoMalla {
    disponible: boolean;
    version: string | null;
}

/** ¿Responde el conversor de otra neurona? (una sola llamada, sin caché: se consulta poco). */
export async function estadoConversorMalla(opciones?: OpcionesMalla): Promise<EstadoMalla> {
    const { url, token, fetchImpl } = configMalla(opciones);
    try {
        const r = await fetchImpl(`${url}/salud`, { cache: "no-store", headers: encabezados(token) });
        if (!r.ok) return { disponible: false, version: null };
        const j = (await r.json()) as { version?: string; filee?: { instalado?: boolean; version?: string | null } };
        return { disponible: Boolean(j?.filee?.instalado), version: j?.filee?.version ?? null };
    } catch {
        return { disponible: false, version: null };
    }
}

/** Destinos que la otra neurona da al formato. Null si no la hay o no sabe. */
export async function destinosConversorMalla(
    formatoOArchivo: string,
    opciones?: OpcionesMalla,
): Promise<{ de: string; destinos: DestinosFormato; version: string | null } | null> {
    const de = formatoDe(formatoOArchivo);
    if (!de) return null;
    const { url, token, fetchImpl } = configMalla(opciones);
    try {
        const r = await fetchImpl(`${url}/formatos?de=${encodeURIComponent(de)}`, { cache: "no-store", headers: encabezados(token) });
        if (!r.ok) return null;
        // El servicio trae los destinos repartidos arriba: { filee: {…}, de, nombre, ids, destinos, conMotor }.
        const j = (await r.json()) as { filee?: { instalado?: boolean; version?: string | null }; destinos?: DestinosFormato | string[] | null; nombre?: string; ids?: string[]; conMotor?: string[] };
        if (!j?.filee?.instalado) return null;
        const destinos = (typeof j.destinos === "string" || Array.isArray(j.destinos))
            ? { nombre: j.nombre ?? de, ids: j.ids ?? [de], destinos: j.destinos as string[], conMotor: j.conMotor ?? [] }
            : j.destinos;
        if (!destinos) return null;
        return { de, destinos, version: j.filee.version ?? null };
    } catch {
        return null;
    }
}

/** Convierte en la otra neurona. Nunca lanza: resultado honesto igual que Filee local. */
export async function convertirConMalla(
    entrada: { bytes: Uint8Array; nombre: string; a: string; calidad?: number | null },
    opciones?: OpcionesMalla,
): Promise<{ ok: boolean; nombre?: string; bytes?: Uint8Array; tipo?: string; salidas?: number; motivo?: string; status?: number; ms?: number }> {
    const { url, token, fetchImpl } = configMalla(opciones);
    const form = new FormData();
    form.set("archivo", new Blob([entrada.bytes as Uint8Array<ArrayBuffer>]), entrada.nombre || "archivo");
    form.set("a", formatoDe(entrada.a) || entrada.a);
    if (entrada.calidad && Number.isInteger(Number(entrada.calidad))) form.set("calidad", String(entrada.calidad));
    try {
        const r = await fetchImpl(`${url}/convertir`, { method: "POST", body: form, headers: encabezados(token) });
        if (!r.ok) {
            let motivo = "El conversor de la otra neurona no pudo atender la petición.";
            if (r.status === 429) motivo = "Hay otras conversiones en curso; prueba en unos segundos.";
            if (r.status >= 500) motivo = "El conversor de la otra neurona no responde.";
            return { ok: false, status: r.status, motivo };
        }
        const bytes = new Uint8Array(await r.arrayBuffer());
        const tipo = r.headers.get("Content-Type") ?? "application/octet-stream";
        const nombre = decodeURIComponent(r.headers.get("Content-Disposition")?.match(/UTF-8''([^;]+)/)?.[1] ?? entrada.nombre);
        return { ok: true, nombre, bytes, tipo, salidas: Number(r.headers.get("X-Conversor-Salidas") ?? 1) || 1 };
    } catch {
        return { ok: false, status: 502, motivo: "Sin conexión con la neurona que convierte." };
    }
}
