/**
 * Flujo de Tránsito · piezas PURAS (Ola 0929-C).
 *
 * - La parada más cercana de cada modo sale del entorno REAL de OpenStreetMap
 *   (`_catalogo/entorno.ts`).
 * - El consejo de cómo moverte sale del tiempo REAL de las próximas horas (`_catalogo/meteo.ts`).
 * Nada de horarios en vivo: eso necesitaría el GTFS-RT de cada ciudad, y no se finge.
 */
import type { HoraMeteo } from "./_catalogo/meteo";
import { MOVILIDAD, type SitioCerca, type TipoSitio } from "./_catalogo/entorno";

export interface Consejo { tipo: "activo" | "paraguas" | "publico"; titulo: string; corto: string; razon: string }

/** Cómo conviene moverse en las próximas 3 horas. */
export function consejoMovilidad(horas: HoraMeteo[]): Consejo | null {
    const h = horas.slice(0, 3);
    if (!h.length) return null;
    const lluvia = Math.max(...h.map((x) => x.probLluvia));
    const mm = h.reduce((s, x) => s + Math.max(0, x.lluvia), 0);
    const viento = Math.max(...h.map((x) => x.viento));
    const temp = Math.round(h[0].temp);
    if (lluvia >= 60 || mm >= 1) return { tipo: "publico", titulo: "Mejor en transporte público", corto: "Transporte público", razon: `${Math.round(lluvia)} % de lluvia en las próximas 3 h` };
    if (viento >= 40) return { tipo: "publico", titulo: "Mejor en transporte público", corto: "Transporte público", razon: `Viento fuerte: ${Math.round(viento)} km/h` };
    if (temp <= 2) return { tipo: "publico", titulo: "Mejor en transporte público", corto: "Transporte público", razon: `Hace frío: ${temp} °C` };
    if (temp >= 35) return { tipo: "publico", titulo: "Mejor en transporte público", corto: "Transporte público", razon: `Mucho calor: ${temp} °C` };
    if (lluvia >= 30) return { tipo: "paraguas", titulo: "A pie o en bici, con paraguas", corto: "Con paraguas", razon: `${Math.round(lluvia)} % de lluvia en las próximas 3 h` };
    return { tipo: "activo", titulo: "Buen momento para ir a pie o en bici", corto: "A pie o en bici", razon: `Sin lluvia a la vista y ${temp} °C` };
}

/** La más cercana de cada modo (metro, tren, tranvía, bus, bici, coche), de la más cercana a la más lejana. */
export function masCercanaPorModo(sitios: SitioCerca[]): SitioCerca[] {
    const out: SitioCerca[] = [];
    for (const t of MOVILIDAD) {
        const s = sitios.find((x) => x.tipo === t);
        if (s) out.push(s);
    }
    return out.sort((a, b) => a.dist - b.dist);
}

/** Ruta a pie hasta la parada, en el planificador de OpenStreetMap. */
export function urlRutaAPie(desde: { lat: number; lon: number }, hasta: { lat: number; lon: number }): string {
    const p = (x: { lat: number; lon: number }) => `${x.lat.toFixed(5)}%2C${x.lon.toFixed(5)}`;
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${p(desde)}%3B${p(hasta)}`;
}

export const NOMBRE_MODO: Partial<Record<TipoSitio, string>> = {
    metro: "Metro", tren: "Tren", tranvia: "Tranvía", bus: "Autobús", bici: "Bici compartida", coche: "Coche compartido",
};
