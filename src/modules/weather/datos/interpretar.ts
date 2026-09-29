/**
 * Interpretación en lenguaje llano (PURO): códigos WMO, UV, calidad del aire, viento, confort,
 * avisos del tiempo y del clima espacial. Umbrales de OMS/AEMET (UV), Agencia Europea de Medio
 * Ambiente (ICA europeo), EPA (AQI de EE. UU.), escala de Beaufort y escalas NOAA R/S/G.
 */
import type { AireReal, ClimaReal, HoraClima } from "./open-meteo";
import { proximasHoras } from "./open-meteo";

// ── Cielo ─────────────────────────────────────────────────────────────

export type FamiliaCielo = "despejado" | "nubes" | "niebla" | "lluvia" | "nieve" | "tormenta";

const TEXTO_WMO: Record<number, string> = {
    0: "Despejado", 1: "Casi despejado", 2: "Parcialmente nuboso", 3: "Cubierto",
    45: "Niebla", 48: "Niebla con escarcha",
    51: "Llovizna débil", 53: "Llovizna", 55: "Llovizna densa", 56: "Llovizna helada", 57: "Llovizna helada densa",
    61: "Lluvia débil", 63: "Lluvia", 65: "Lluvia fuerte", 66: "Lluvia helada", 67: "Lluvia helada fuerte",
    71: "Nieve débil", 73: "Nieve", 75: "Nieve fuerte", 77: "Granos de nieve",
    80: "Chubascos débiles", 81: "Chubascos", 82: "Chubascos violentos", 85: "Chubascos de nieve", 86: "Chubascos de nieve fuertes",
    95: "Tormenta", 96: "Tormenta con granizo", 99: "Tormenta con granizo fuerte",
};

export function textoCielo(codigo: number | null, esDia = true): string {
    if (codigo === null) return "Sin dato del cielo";
    if (codigo === 0 && !esDia) return "Noche despejada";
    return TEXTO_WMO[codigo] ?? "Cielo variable";
}

export function familiaCielo(codigo: number | null): FamiliaCielo | null {
    if (codigo === null) return null;
    if (codigo <= 1) return "despejado";
    if (codigo <= 3) return "nubes";
    if (codigo === 45 || codigo === 48) return "niebla";
    if (codigo >= 95) return "tormenta";
    if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return "nieve";
    return "lluvia";
}

// ── UV ────────────────────────────────────────────────────────────────

export interface NivelUv { nivel: 0 | 1 | 2 | 3 | 4; texto: string; color: string; consejo: string }

export function nivelUv(indice: number | null): NivelUv | null {
    if (indice === null) return null;
    // La OMS categoriza el índice redondeado: 5,6 se lee «6» y es «Alto».
    const uv = Math.round(indice);
    if (uv < 3) return { nivel: 0, texto: "Bajo", color: "#4ade80", consejo: "No hace falta protección especial." };
    if (uv < 6) return { nivel: 1, texto: "Moderado", color: "#facc15", consejo: "Gafas y crema si estás fuera al mediodía." };
    if (uv < 8) return { nivel: 2, texto: "Alto", color: "#fb923c", consejo: "Crema FPS 30+, gorra y sombra de 12 a 16 h." };
    if (uv < 11) return { nivel: 3, texto: "Muy alto", color: "#ef4444", consejo: "Evita el sol del mediodía; FPS 50+ y ropa que cubra." };
    return { nivel: 4, texto: "Extremo", color: "#a855f7", consejo: "Quédate a la sombra: la piel se quema en minutos." };
}

/** Ventana del día con UV ≥ 3 (cuándo protegerse), sobre las horas de hoy. */
export function ventanaProteccion(horas: HoraClima[], desde: number, hasta: number): { inicio: number; fin: number; pico: number; picoT: number } | null {
    const hoy = horas.filter((h) => h.t >= desde && h.t < hasta && h.uv !== null);
    const altas = hoy.filter((h) => (h.uv as number) >= 3);
    if (!altas.length) return null;
    const pico = hoy.reduce((m, h) => ((h.uv as number) > (m.uv as number) ? h : m), hoy[0]);
    return { inicio: altas[0].t, fin: altas[altas.length - 1].t + 3_600_000, pico: pico.uv as number, picoT: pico.t };
}

// ── Calidad del aire ──────────────────────────────────────────────────

export interface NivelAire { indice: number; escala: "europeo" | "eeuu"; texto: string; color: string; consejo: string; fraccion: number }

const EUROPEO: [number, string, string, string][] = [
    [20, "Buena", "#50f0e6", "Aire limpio: buen momento para salir."],
    [40, "Razonable", "#50ccaa", "Sin precauciones para casi nadie."],
    [60, "Regular", "#f0e641", "Si eres sensible, modera el ejercicio intenso fuera."],
    [80, "Mala", "#ff5050", "Reduce el esfuerzo al aire libre, sobre todo si eres sensible."],
    [100, "Muy mala", "#c23461", "Evita el ejercicio fuera; ventila en otro momento."],
    [Infinity, "Pésima", "#7d2181", "Quédate dentro si puedes."],
];
const EEUU: [number, string, string, string][] = [
    [50, "Buena", "#4ade80", "Aire limpio: buen momento para salir."],
    [100, "Moderada", "#facc15", "Si eres muy sensible, modera el esfuerzo."],
    [150, "Dañina para sensibles", "#fb923c", "Personas sensibles: menos esfuerzo al aire libre."],
    [200, "Dañina", "#ef4444", "Todos: reduce el esfuerzo fuera."],
    [300, "Muy dañina", "#a855f7", "Evita el ejercicio al aire libre."],
    [Infinity, "Peligrosa", "#7f1d1d", "Quédate dentro."],
];

export function nivelAire(aire: Pick<AireReal, "europeo" | "eeuu"> | null): NivelAire | null {
    if (!aire) return null;
    const usar = aire.europeo !== null ? "europeo" : aire.eeuu !== null ? "eeuu" : null;
    if (!usar) return null;
    const v = (usar === "europeo" ? aire.europeo : aire.eeuu) as number;
    const tabla = usar === "europeo" ? EUROPEO : EEUU;
    const fila = tabla.find(([tope]) => v <= tope) ?? tabla[tabla.length - 1];
    const techo = usar === "europeo" ? 100 : 300;
    return { indice: Math.round(v), escala: usar, texto: fila[1], color: fila[2], consejo: fila[3], fraccion: Math.max(0, Math.min(1, v / techo)) };
}

/** Guías de la OMS 2021 (µg/m³) para comparar cada contaminante. */
export const GUIA_OMS = { pm25: 15, pm10: 45, no2: 25, o3: 100, so2: 40 } as const;

// ── Viento ────────────────────────────────────────────────────────────

const RUMBOS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
const NOMBRES_RUMBO: Record<string, string> = { N: "norte", NE: "nordeste", E: "este", SE: "sudeste", S: "sur", SO: "sudoeste", O: "oeste", NO: "noroeste" };

export function rumbo(grados: number | null): string {
    if (grados === null) return "—";
    return RUMBOS[Math.round((((grados % 360) + 360) % 360) / 22.5) % 16];
}

/** «del nordeste»: de dónde VIENE el viento (convención meteorológica). */
export function procedencia(grados: number | null): string {
    if (grados === null) return "sin dirección";
    const ocho = RUMBOS[Math.round((((grados % 360) + 360) % 360) / 45) * 2 % 16];
    return `del ${NOMBRES_RUMBO[ocho] ?? ocho}`;
}

const BEAUFORT: [number, string][] = [
    [1, "Calma"], [6, "Ventolina"], [12, "Flojito"], [20, "Flojo"], [29, "Bonancible"], [39, "Fresquito"],
    [50, "Fresco"], [62, "Frescachón"], [75, "Temporal"], [89, "Temporal fuerte"], [103, "Temporal duro"], [118, "Temporal muy duro"],
];

export function beaufort(kmh: number | null): { fuerza: number; nombre: string } | null {
    if (kmh === null) return null;
    const i = BEAUFORT.findIndex(([tope]) => kmh < tope);
    return i === -1 ? { fuerza: 12, nombre: "Huracanado" } : { fuerza: i, nombre: BEAUFORT[i][1] };
}

// ── Humedad y confort ─────────────────────────────────────────────────

export function confortRocio(rocio: number | null): { texto: string; color: string } | null {
    if (rocio === null) return null;
    if (rocio < 10) return { texto: "Aire seco", color: "#fcd34d" };
    if (rocio < 13) return { texto: "Agradable", color: "#4ade80" };
    if (rocio < 16) return { texto: "Cómodo", color: "#22d3ee" };
    if (rocio < 18) return { texto: "Algo húmedo", color: "#60a5fa" };
    if (rocio < 21) return { texto: "Bochornoso", color: "#818cf8" };
    if (rocio < 24) return { texto: "Muy bochornoso", color: "#c084fc" };
    return { texto: "Opresivo", color: "#f472b6" };
}

// ── Temperatura ───────────────────────────────────────────────────────

/** Color de una temperatura (°C): azul hielo → verde → ámbar → carmesí. */
export function colorTemperatura(c: number | null): string {
    if (c === null) return "#94a3b8";
    const paradas: [number, string][] = [[-10, "#a5b4fc"], [0, "#7dd3fc"], [10, "#5eead4"], [18, "#86efac"], [24, "#fde047"], [30, "#fb923c"], [36, "#ef4444"], [42, "#be123c"]];
    if (c <= paradas[0][0]) return paradas[0][1];
    for (let i = 1; i < paradas.length; i++) {
        if (c <= paradas[i][0]) {
            const [c0, a] = paradas[i - 1], [c1, b] = paradas[i];
            return mezclaHex(a, b, (c - c0) / (c1 - c0));
        }
    }
    return paradas[paradas.length - 1][1];
}

export function mezclaHex(a: string, b: string, t: number): string {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const k = Math.max(0, Math.min(1, t));
    const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
    return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

// ── Avisos del tiempo ─────────────────────────────────────────────────

export interface Aviso { id: string; texto: string; severidad: "info" | "atencion" | "peligro" }

/** Lo que merece un aviso en las próximas horas, en frases cortas. `hora` formatea una marca. */
export function avisosClima(c: ClimaReal, aire: AireReal | null, hora: (t: number) => string, ahora = Date.now()): Aviso[] {
    const av: Aviso[] = [];
    const prox = proximasHoras(c.horas, 12, ahora);
    const tormenta = prox.find((h) => (h.codigo ?? 0) >= 95);
    if (tormenta) av.push({ id: "tormenta", texto: `Tormenta prevista hacia las ${hora(tormenta.t)}`, severidad: "peligro" });
    const rachas = prox.reduce((m, h) => Math.max(m, h.rachas ?? 0), 0);
    if (rachas >= 70) av.push({ id: "rachas", texto: `Rachas de hasta ${Math.round(rachas)} km/h`, severidad: rachas >= 90 ? "peligro" : "atencion" });
    const uvMax = prox.reduce((m, h) => Math.max(m, h.uv ?? 0), c.actual.uv ?? 0);
    if (uvMax >= 8) av.push({ id: "uv", texto: `UV ${Math.round(uvMax)}: protégete del sol`, severidad: uvMax >= 11 ? "peligro" : "atencion" });
    const calor = prox.reduce((m, h) => Math.max(m, h.temp ?? -99), c.actual.temp ?? -99);
    if (calor >= 35) av.push({ id: "calor", texto: `Calor intenso: hasta ${Math.round(calor)}°`, severidad: calor >= 40 ? "peligro" : "atencion" });
    const frio = prox.reduce((m, h) => Math.min(m, h.temp ?? 99), c.actual.temp ?? 99);
    if (frio <= 0) av.push({ id: "helada", texto: `Helada: bajará a ${Math.round(frio)}°`, severidad: frio <= -5 ? "peligro" : "atencion" });
    if (!tormenta && (c.actual.lluvia ?? 0) === 0) {
        const lluvia = prox.slice(1, 7).find((h) => (h.probLluvia ?? 0) >= 60);
        if (lluvia) av.push({ id: "lluvia", texto: `Lluvia probable a las ${hora(lluvia.t)} (${Math.round(lluvia.probLluvia as number)} %)`, severidad: "info" });
    }
    const na = nivelAire(aire);
    if (na && ((na.escala === "europeo" && na.indice > 60) || (na.escala === "eeuu" && na.indice > 100))) {
        av.push({ id: "aire", texto: `Aire ${na.texto.toLowerCase()} (${na.indice})`, severidad: na.indice > 80 && na.escala === "europeo" ? "peligro" : "atencion" });
    }
    return av;
}

/** Una frase para lo que viene: «Lluvia hacia las 18:00», «Sube a 28° a las 16:00»… */
export function fraseProximas(horas: HoraClima[], hora: (t: number) => string, ahora = Date.now()): string | null {
    const prox = proximasHoras(horas, 12, ahora);
    if (prox.length < 2) return null;
    const ahoraH = prox[0];
    const lluviaAhora = (ahoraH.lluvia ?? 0) > 0.1 || (familiaCielo(ahoraH.codigo) === "lluvia" && (ahoraH.probLluvia ?? 0) >= 50);
    if (lluviaAhora) {
        const escampa = prox.slice(1).find((h) => (h.probLluvia ?? 0) < 30 && (h.lluvia ?? 0) < 0.1);
        return escampa ? `Escampa hacia las ${hora(escampa.t)}` : "Lluvia durante las próximas horas";
    }
    const lluvia = prox.slice(1).find((h) => (h.probLluvia ?? 0) >= 50);
    if (lluvia) return `Lluvia probable hacia las ${hora(lluvia.t)}`;
    const temps = prox.filter((h) => h.temp !== null);
    if (temps.length < 2 || ahoraH.temp === null) return "Sin lluvia en 12 h";
    const max = temps.reduce((m, h) => ((h.temp as number) > (m.temp as number) ? h : m));
    const min = temps.reduce((m, h) => ((h.temp as number) < (m.temp as number) ? h : m));
    if ((max.temp as number) - ahoraH.temp >= 2) return `Sin lluvia · sube a ${Math.round(max.temp as number)}° a las ${hora(max.t)}`;
    if (ahoraH.temp - (min.temp as number) >= 3) return `Sin lluvia · baja a ${Math.round(min.temp as number)}° a las ${hora(min.t)}`;
    return "Sin lluvia en 12 h";
}

// ── Clima espacial ────────────────────────────────────────────────────

export type Severidad = "calma" | "menor" | "moderada" | "fuerte" | "extrema";
export const COLOR_SEVERIDAD: Record<Severidad, string> = {
    calma: "#34d399", menor: "#facc15", moderada: "#fb923c", fuerte: "#f43f5e", extrema: "#d946ef",
};

/** Escala G de NOAA (0-5) a partir de Kp. */
export function escalaG(kp: number | null): number {
    if (kp === null) return 0;
    if (kp >= 9) return 5;
    if (kp >= 8) return 4;
    if (kp >= 7) return 3;
    if (kp >= 6) return 2;
    if (kp >= 5) return 1;
    return 0;
}

export function severidadKp(kp: number | null): Severidad {
    const g = escalaG(kp);
    return g >= 4 ? "extrema" : g === 3 ? "fuerte" : g === 2 ? "moderada" : g === 1 || (kp ?? 0) >= 4 ? "menor" : "calma";
}

const NOMBRE_G = ["Sin tormenta", "G1 · Menor", "G2 · Moderada", "G3 · Fuerte", "G4 · Severa", "G5 · Extrema"];
export function nombreG(g: number): string {
    return NOMBRE_G[Math.max(0, Math.min(5, Math.round(g)))];
}

/** El campo magnético de la Tierra, dicho en claro. */
export function explicarKp(kp: number | null): string {
    if (kp === null) return "Sin lectura del índice Kp ahora mismo.";
    const g = escalaG(kp);
    if (g === 0 && kp < 3) return "Campo magnético en calma: no hay tormenta y las auroras quedan cerca de los polos.";
    if (g === 0 && kp < 4) return "Algo inquieto: auroras posibles en Laponia, Islandia o Alaska.";
    if (g === 0) return "Activo, aún sin tormenta: auroras en el norte de Escandinavia y Canadá.";
    if (g === 1) return "Tormenta menor (G1): auroras más al sur de lo normal y pequeñas fluctuaciones en redes eléctricas.";
    if (g === 2) return "Tormenta moderada (G2): auroras visibles hacia 55° de latitud; el GPS puede perder precisión.";
    if (g === 3) return "Tormenta fuerte (G3): auroras hasta 50° de latitud; posibles correcciones en satélites y redes.";
    if (g === 4) return "Tormenta severa (G4): auroras en latitudes medias; problemas en GPS, radio HF y redes eléctricas.";
    return "Tormenta extrema (G5): auroras muy al sur; alertas en redes eléctricas y satélites.";
}

/** Latitud geomagnética del sitio (dipolo centrado; polo norte geomagnético IGRF-14 ≈ 80,8° N, 72,6° O). */
export function latitudGeomagnetica(lat: number, lon: number): number {
    const r = Math.PI / 180, pl = 80.8 * r, pn = -72.6 * r;
    const s = Math.sin(lat * r) * Math.sin(pl) + Math.cos(lat * r) * Math.cos(pl) * Math.cos(lon * r - pn);
    return Math.asin(Math.max(-1, Math.min(1, s))) / r;
}

/** Latitud geomagnética hasta la que la aurora asoma en el horizonte según Kp (tabla de NOAA). */
export function lineaAuroraKp(kp: number): number {
    return 66.5 - 2.05 * Math.max(0, Math.min(9, kp));
}

export function explicarViento(velocidad: number | null, bz: number | null): string {
    if (velocidad === null && bz === null) return "Sin lectura del viento solar.";
    const partes: string[] = [];
    if (velocidad !== null) {
        if (velocidad < 400) partes.push("Viento solar tranquilo");
        else if (velocidad < 500) partes.push("Viento solar moderado");
        else if (velocidad < 700) partes.push("Viento solar rápido, típico de un agujero coronal");
        else partes.push("Viento solar muy rápido: posible llegada de una eyección de masa coronal");
    }
    if (bz !== null) {
        if (bz <= -10) partes.push("Bz muy al sur: la puerta magnética está abierta de par en par");
        else if (bz <= -5) partes.push("Bz hacia el sur: la energía entra en la magnetosfera y favorece auroras");
        else if (bz < 0) partes.push("Bz ligeramente al sur");
        else partes.push("Bz hacia el norte: la magnetosfera se protege");
    }
    return `${partes.join(". ")}.`;
}

export function severidadViento(v: number | null): Severidad {
    if (v === null || v < 500) return "calma";
    if (v < 650) return "menor";
    if (v < 800) return "moderada";
    return "fuerte";
}

/** Flujo de rayos X (W/m²) → clase de llamarada. */
export function claseRayos(flujo: number | null): { letra: "A" | "B" | "C" | "M" | "X"; etiqueta: string; severidad: Severidad } | null {
    if (flujo === null || !(flujo > 0)) return null;
    const tabla: ["A" | "B" | "C" | "M" | "X", number, Severidad][] = [["X", 1e-4, "extrema"], ["M", 1e-5, "fuerte"], ["C", 1e-6, "menor"], ["B", 1e-7, "calma"], ["A", 1e-8, "calma"]];
    for (const [letra, base, severidad] of tabla) {
        if (flujo >= base || letra === "A") return { letra, etiqueta: `${letra}${(flujo / base).toFixed(1)}`, severidad };
    }
    return null;
}

/** Escala R de apagones de radio (NOAA) por flujo de rayos X. */
export function escalaR(flujo: number | null): number {
    if (flujo === null) return 0;
    if (flujo >= 2e-3) return 5;
    if (flujo >= 1e-3) return 4;
    if (flujo >= 1e-4) return 3;
    if (flujo >= 5e-5) return 2;
    if (flujo >= 1e-5) return 1;
    return 0;
}

export function explicarLlamarada(letra: string | null): string {
    switch (letra) {
        case "X": return "Llamarada X: la más intensa. Apagones de radio HF en el lado diurno y posible eyección hacia la Tierra.";
        case "M": return "Llamarada M: apagones breves de radio HF en las regiones polares y el lado diurno.";
        case "C": return "Actividad C: llamaradas pequeñas, sin efectos notables en la Tierra.";
        case "B": case "A": return "Sol tranquilo: el fondo de rayos X está bajo.";
        default: return "Sin lectura de rayos X ahora mismo.";
    }
}

/** Probabilidad combinada (%) de que ocurra al menos una, a partir de probabilidades por región. */
export function probabilidadCombinada(ps: (number | null)[]): number | null {
    const v = ps.filter((p): p is number => p !== null);
    if (!v.length) return null;
    return Math.round((1 - v.reduce((acc, p) => acc * (1 - Math.max(0, Math.min(100, p)) / 100), 1)) * 100);
}

/** Resonancias de Schumann: valores de referencia medidos por la ciencia (Hz). */
export const MODOS_SCHUMANN = [7.83, 14.3, 20.8, 27.3, 33.8] as const;
