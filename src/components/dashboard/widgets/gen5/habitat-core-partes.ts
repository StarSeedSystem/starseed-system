/**
 * Núcleo del Hábitat · piezas PURAS (Ola 0929-C).
 *
 * - Luz circadiana: de la altura REAL del Sol en tu lugar (`@/lib/astro/cielo`), sin red.
 * - Ventilar: del tiempo REAL de fuera (`_catalogo/meteo.ts`).
 * - Tu casa: SOLO si conectaste tu Home Assistant en el Centro de Control (Hogar), con la misma
 *   configuración local (`starseed.iot.homeassistant.v1`) y en solo lectura (`GET /api/states`).
 */
import { alturaSol } from "@/lib/astro/cielo";

export const CLAVE_HA = "starseed.iot.homeassistant.v1";

export interface ConfigHa { enabled: boolean; url?: string; token?: string }

export function leerHa(): ConfigHa {
    try {
        const j = JSON.parse(localStorage.getItem(CLAVE_HA) || "null") as Partial<ConfigHa> | null;
        return { enabled: j?.enabled === true, url: typeof j?.url === "string" && j.url ? j.url : undefined, token: typeof j?.token === "string" && j.token ? j.token : undefined };
    } catch { return { enabled: false }; }
}

export function haListo(c: ConfigHa): boolean {
    return c.enabled && !!c.url && !!c.token && /^https?:\/\//i.test(c.url);
}

export interface Lectura { id: string; nombre: string; valor: number; unidad: string }
export interface Interruptor { id: string; nombre: string; encendido: boolean }
export interface Hogar { temperaturas: Lectura[]; humedades: Lectura[]; luces: Interruptor[]; enchufes: Interruptor[]; entidades: number }

/** `GET /api/states` de Home Assistant → lo que el widget enseña. */
export function analizarHa(j: unknown): Hogar {
    if (!Array.isArray(j)) throw new Error("Home Assistant no devolvió estados");
    const h: Hogar = { temperaturas: [], humedades: [], luces: [], enchufes: [], entidades: j.length };
    for (const e of j as Array<Record<string, any>>) {
        const id = String(e?.entity_id ?? "");
        const a = (e?.attributes ?? {}) as Record<string, any>;
        const nombre = String(a.friendly_name || id.split(".")[1] || id).slice(0, 60);
        const estado = String(e?.state ?? "");
        if (id.startsWith("sensor.")) {
            const v = Number(estado);
            if (!Number.isFinite(v)) continue;
            if (a.device_class === "temperature") h.temperaturas.push({ id, nombre, valor: v, unidad: String(a.unit_of_measurement || "°C") });
            else if (a.device_class === "humidity") h.humedades.push({ id, nombre, valor: v, unidad: "%" });
        } else if (id.startsWith("light.") && (estado === "on" || estado === "off")) {
            h.luces.push({ id, nombre, encendido: estado === "on" });
        } else if (id.startsWith("switch.") && (estado === "on" || estado === "off")) {
            h.enchufes.push({ id, nombre, encendido: estado === "on" });
        }
    }
    return h;
}

export interface LuzCircadiana { fase: "dia" | "tarde" | "dorada" | "crepusculo" | "noche"; nombre: string; kelvin: number; color: string; consejo: string }

const FASES: LuzCircadiana[] = [
    { fase: "dia", nombre: "Pleno día", kelvin: 5000, color: "#fff4e0", consejo: "Luz neutra y abundante: aprovecha la natural." },
    { fase: "tarde", nombre: "Tarde", kelvin: 4000, color: "#ffe3b8", consejo: "Luz neutra-cálida para seguir con energía." },
    { fase: "dorada", nombre: "Hora dorada", kelvin: 3000, color: "#ffc98a", consejo: "Luz cálida y más baja: el cuerpo empieza a bajar el ritmo." },
    { fase: "crepusculo", nombre: "Crepúsculo", kelvin: 2700, color: "#ffb36b", consejo: "Luz cálida y tenue; evita pantallas muy blancas." },
    { fase: "noche", nombre: "Noche", kelvin: 2200, color: "#ff9a4d", consejo: "Luz muy cálida y tenue: prepara el descanso." },
];

/** Qué luz pide el cuerpo según la altura del Sol (grados). */
export function luzPara(altura: number): LuzCircadiana {
    if (altura > 20) return FASES[0];
    if (altura > 6) return FASES[1];
    if (altura > -4) return FASES[2];
    if (altura > -12) return FASES[3];
    return FASES[4];
}

/** La luz de ahora y cuándo cambia (búsqueda cada 10 min en las próximas 24 h). */
export function luzAhora(fecha: Date, lat: number, lon: number): { luz: LuzCircadiana; altura: number; cambio: { en: Date; luz: LuzCircadiana } | null } {
    const altura = alturaSol(fecha, lat, lon);
    const luz = luzPara(altura);
    for (let m = 10; m <= 24 * 60; m += 10) {
        const f = new Date(fecha.getTime() + m * 60_000);
        const otra = luzPara(alturaSol(f, lat, lon));
        if (otra.fase !== luz.fase) return { luz, altura, cambio: { en: f, luz: otra } };
    }
    return { luz, altura, cambio: null };
}

export interface Ventilar { abrir: boolean; titulo: string; corto: string; razon: string }

/** ¿Abrir las ventanas ahora? Con el tiempo real de fuera y la lluvia de las próximas horas. */
export function consejoVentilar(fuera: { temp: number; humedad: number; viento: number; lluvia: number }, probLluvia: number): Ventilar {
    const t = Math.round(fuera.temp);
    if (fuera.lluvia > 0 || probLluvia >= 60) return { abrir: false, titulo: "Mejor cerrado", corto: "Mejor cerrado", razon: fuera.lluvia > 0 ? "Está lloviendo fuera" : `${Math.round(probLluvia)} % de lluvia en las próximas horas` };
    if (fuera.viento >= 40) return { abrir: false, titulo: "Mejor cerrado", corto: "Mejor cerrado", razon: `Viento fuerte: ${Math.round(fuera.viento)} km/h` };
    if (t >= 29) return { abrir: false, titulo: "Mejor cerrado", corto: "Mejor cerrado", razon: `Fuera hace ${t} °C: ventila cuando refresque` };
    if (t < 10) return { abrir: true, titulo: "Ventila 5 minutos y cierra", corto: "Ventila 5 min", razon: `Fuera hace ${t} °C: renueva el aire sin enfriar la casa` };
    if (fuera.humedad >= 88) return { abrir: false, titulo: "Mejor cerrado", corto: "Mejor cerrado", razon: `Aire muy húmedo fuera (${Math.round(fuera.humedad)} %)` };
    return { abrir: true, titulo: "Buen momento para ventilar", corto: "Ventila ahora", razon: `Fuera ${t} °C y ${Math.round(fuera.humedad)} % de humedad` };
}
