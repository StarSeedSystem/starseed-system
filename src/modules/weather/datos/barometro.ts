/**
 * Presión, visibilidad y la semana en una frase (PURO, sin React): lo que un barómetro, un
 * observador del horizonte y un parte del tiempo dirían en voz alta.
 *
 * - Presión: tendencia de 3 h con los tramos de la Met Office (estable < 0,1 hPa; despacio hasta
 *   1,5; sube/baja hasta 3,5; deprisa hasta 6; muy deprisa por encima), las palabras de la esfera
 *   de un barómetro aneroide clásico (Tempestad · Lluvia · Variable · Buen tiempo · Muy seco) y
 *   conversión a mmHg o inHg.
 * - Visibilidad: categorías de la Met Office (muy mala < 1 km … excelente ≥ 40 km), su causa
 *   probable (niebla, neblina, calima, precipitación) y la ley de Koschmieder para dibujar el
 *   horizonte: el contraste de algo a `d` km con visibilidad `V` es e^(−3,912·d/V).
 * - Pronóstico: una frase para la semana (lluvia, tormenta, el mejor día) y la duración del día.
 *
 * Una lectura que falta vale `null`: nunca se rellena con un valor «típico».
 */
import type { DiaClima, HoraClima } from "./open-meteo";
import { indiceAhora } from "./open-meteo";
import { familiaCielo } from "./interpretar";

// ── Presión ───────────────────────────────────────────────────────────

export type UnidadPresion = "hpa" | "mmhg" | "inhg";
export const ETIQUETA_PRESION: Record<UnidadPresion, string> = { hpa: "hPa", mmhg: "mmHg", inhg: "inHg" };
export const UNIDADES_PRESION: UnidadPresion[] = ["hpa", "mmhg", "inhg"];

export function aPresion(hpa: number, u: UnidadPresion): number {
    if (u === "mmhg") return hpa * 0.750062;
    if (u === "inhg") return hpa * 0.02953;
    return hpa;
}

/** «1016», «762», «30,00»: sin unidad; la vista la pinta aparte. */
export function textoPresion(hpa: number | null, u: UnidadPresion): string {
    if (hpa === null) return "—";
    const v = aPresion(hpa, u);
    return u === "inhg" ? v.toFixed(2).replace(".", ",") : String(Math.round(v));
}

/** Diferencia con signo en la unidad elegida: «+1,2», «−0,4». */
export function textoCambio(dhpa: number, u: UnidadPresion): string {
    const v = aPresion(Math.abs(dhpa), u);
    const cifra = u === "inhg" ? v.toFixed(2) : v.toFixed(1);
    const signo = dhpa > 0.05 ? "+" : dhpa < -0.05 ? "−" : "±";
    return `${signo}${cifra.replace(".", ",")}`;
}

export type TipoTendencia = "baja-muy-rapido" | "baja-rapido" | "baja" | "baja-despacio" | "estable" | "sube-despacio" | "sube" | "sube-rapido" | "sube-muy-rapido";

export interface Tendencia {
    tipo: TipoTendencia;
    /** hPa en 3 h (positivo: sube). */
    cambio: number;
    /** Presión de hace 3 h (para la aguja de referencia). */
    antes: number;
    texto: string;
    color: string;
    /** −1 baja · 0 estable · 1 sube. */
    sentido: -1 | 0 | 1;
}

const TRAMOS: [number, string, string][] = [
    [0.1, "Estable", "#94a3b8"],
    [1.6, "despacio", "#a5b4fc"],
    [3.6, "", "#fbbf24"],
    [6.1, "deprisa", "#fb923c"],
    [Infinity, "muy deprisa", "#f43f5e"],
];

/** Tendencia de las últimas 3 h según la serie horaria (la hora en curso contra 3 horas antes). */
export function tendenciaPresion(horas: HoraClima[], ahora = Date.now()): Tendencia | null {
    const i = indiceAhora(horas, ahora);
    const actual = horas[i]?.presion ?? null;
    const antes = horas[i - 3]?.presion ?? null;
    if (actual === null || antes === null || i < 3) return null;
    const cambio = Math.round((actual - antes) * 10) / 10;
    const abs = Math.abs(cambio);
    const k = TRAMOS.findIndex(([tope]) => abs < tope);
    const [, adverbio, color] = TRAMOS[k];
    if (k === 0) return { tipo: "estable", cambio, antes, texto: "Estable", color, sentido: 0 };
    const sube = cambio > 0;
    const base = sube ? "sube" : "baja";
    const sufijo = ["", "despacio", "", "rapido", "muy-rapido"][k];
    const tipo = (sufijo ? `${base}-${sufijo}` : base) as TipoTendencia;
    const verbo = sube ? "Sube" : "Baja";
    return { tipo, cambio, antes, texto: adverbio ? `${verbo} ${adverbio}` : verbo, color, sentido: sube ? 1 : -1 };
}

/** Lo que eso suele querer decir (la regla del barómetro, no un pronóstico numérico). */
export function lecturaBarometro(hpa: number | null, t: Tendencia | null): string {
    if (hpa === null) return "Sin lectura de presión.";
    if (t) {
        if (t.cambio <= -3.6) return "Baja deprisa: se acerca una borrasca; viento y lluvia probables.";
        if (t.cambio <= -1.6) return "Baja: el tiempo tiende a empeorar en las próximas horas.";
        if (t.cambio >= 3.6) return "Sube deprisa: mejora, aunque puede soplar viento un rato.";
        if (t.cambio >= 1.6) return "Sube: el tiempo tiende a mejorar y a asentarse.";
    }
    if (hpa < 995) return "Presión baja: tiempo inestable, con nubes y chubascos.";
    if (hpa < 1009) return "Presión algo baja: tiempo variable.";
    if (hpa > 1025) return "Alta presión: tiempo estable y seco; nieblas de madrugada en calma.";
    return "Presión normal y sin cambios: el tiempo sigue como está.";
}

/** Zonas de la esfera de un barómetro aneroide (centros en 965, 982, 999, 1016 y 1033 hPa). */
export const ZONAS_BAROMETRO: { nombre: string; desde: number; hasta: number; color: string }[] = [
    { nombre: "Tempestad", desde: 950, hasta: 973.5, color: "#f43f5e" },
    { nombre: "Lluvia", desde: 973.5, hasta: 990.5, color: "#60a5fa" },
    { nombre: "Variable", desde: 990.5, hasta: 1007.5, color: "#a5b4fc" },
    { nombre: "Buen tiempo", desde: 1007.5, hasta: 1024.5, color: "#fbbf24" },
    { nombre: "Muy seco", desde: 1024.5, hasta: 1050, color: "#fb923c" },
];

export function zonaBarometro(hpa: number | null): { nombre: string; color: string } | null {
    if (hpa === null) return null;
    const z = ZONAS_BAROMETRO.find((x) => hpa < x.hasta) ?? ZONAS_BAROMETRO[ZONAS_BAROMETRO.length - 1];
    return { nombre: z.nombre, color: z.color };
}

/** Mínimo y máximo de un campo en un tramo de horas, con su hora. */
export function extremos(horas: HoraClima[], campo: (h: HoraClima) => number | null): { min: { v: number; t: number }; max: { v: number; t: number } } | null {
    let min: { v: number; t: number } | null = null, max: { v: number; t: number } | null = null;
    for (const h of horas) {
        const v = campo(h);
        if (v === null) continue;
        if (!min || v < min.v) min = { v, t: h.t };
        if (!max || v > max.v) max = { v, t: h.t };
    }
    return min && max ? { min, max } : null;
}

// ── Visibilidad ───────────────────────────────────────────────────────

export interface NivelVisibilidad { nivel: 0 | 1 | 2 | 3 | 4 | 5; texto: string; color: string }

const NIVELES_VIS: [number, string, string][] = [
    [1000, "Muy mala", "#f43f5e"],
    [4000, "Mala", "#fb923c"],
    [10000, "Moderada", "#fbbf24"],
    [20000, "Buena", "#a3e635"],
    [40000, "Muy buena", "#34d399"],
    [Infinity, "Excelente", "#22d3ee"],
];

export function nivelVisibilidad(m: number | null): NivelVisibilidad | null {
    if (m === null) return null;
    const k = NIVELES_VIS.findIndex(([tope]) => m < tope);
    return { nivel: k as NivelVisibilidad["nivel"], texto: NIVELES_VIS[k][1], color: NIVELES_VIS[k][2] };
}

/** «350 m», «4,2 km», «24 km». */
export function textoDistancia(m: number | null): string {
    if (m === null) return "—";
    if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
    if (m < 10000) return `${(m / 1000).toFixed(1).replace(".", ",")} km`;
    return `${Math.round(m / 1000)} km`;
}

/** Por qué se ve lo que se ve: la causa probable, o `null` si el aire está limpio. */
export function causaVisibilidad(m: number | null, humedad: number | null, codigo: number | null): string | null {
    if (m === null) return null;
    const f = familiaCielo(codigo);
    if (m >= 10000) return null;
    if (f === "lluvia" || f === "tormenta") return "Lo acorta la lluvia";
    if (f === "nieve") return "Lo acorta la nieve";
    if (m < 1000) return "Niebla";
    if (humedad !== null && humedad >= 90) return "Neblina: aire casi saturado";
    if (humedad !== null && humedad < 70) return "Calima o bruma seca (polvo, humo)";
    return "Bruma";
}

export interface RiesgoNiebla { nivel: "bajo" | "posible" | "alto"; texto: string; margen: number; color: string }

/**
 * Riesgo de niebla por la diferencia entre temperatura y punto de rocío: con menos de 1° y poco
 * viento el aire se satura; hasta 2,5° es posible si refresca o amaina.
 */
export function riesgoNiebla(temp: number | null, rocio: number | null, vientoKmh: number | null): RiesgoNiebla | null {
    if (temp === null || rocio === null) return null;
    const margen = Math.max(0, Math.round((temp - rocio) * 10) / 10);
    const calma = vientoKmh === null || vientoKmh < 12;
    const m = margen.toFixed(1).replace(".", ",");
    if (margen <= 1 && calma) return { nivel: "alto", margen, color: "#f43f5e", texto: `Niebla probable: el aire está a ${m}° de saturarse` };
    if (margen <= 2.5) return { nivel: "posible", margen, color: "#fbbf24", texto: `Niebla posible si refresca: faltan ${m}° para saturar` };
    return { nivel: "bajo", margen, color: "#34d399", texto: `Sin riesgo de niebla: faltan ${m}° para saturar` };
}

/** El próximo cambio que importa en la visibilidad de las próximas horas. */
export function cambioVisibilidad(prox: HoraClima[], hora: (t: number) => string): string | null {
    if (prox.length < 2) return null;
    const ahora = prox[0].visibilidad;
    if (ahora === null) return null;
    if (ahora < 1000) {
        const abre = prox.slice(1).find((h) => (h.visibilidad ?? 0) >= 5000);
        return abre ? `Se despeja hacia las ${hora(abre.t)}` : "La niebla sigue en las próximas horas";
    }
    const niebla = prox.slice(1).find((h) => h.visibilidad !== null && h.visibilidad < 1000);
    if (niebla) return `Niebla prevista hacia las ${hora(niebla.t)}`;
    const baja = prox.slice(1).find((h) => h.visibilidad !== null && h.visibilidad < 4000);
    if (baja && ahora >= 4000) return `Baja a ${textoDistancia(baja.visibilidad)} hacia las ${hora(baja.t)}`;
    return "Sin nieblas en las próximas horas";
}

/** Contraste aparente de algo a `km` con visibilidad `m` (ley de Koschmieder, umbral del 2 %). */
export function contrasteA(km: number, m: number | null): number {
    if (m === null || m <= 0) return 0;
    return Math.exp((-3.912 * km * 1000) / m);
}

// ── Pronóstico ────────────────────────────────────────────────────────

/** «12 h 34 min». */
export function textoLuz(seg: number | null): string {
    if (seg === null) return "—";
    const h = Math.floor(seg / 3600), m = Math.round((seg % 3600) / 60);
    return m === 60 ? `${h + 1} h` : `${h} h ${String(m).padStart(2, "0")} min`;
}

/**
 * La semana en una frase: tormenta o lluvia primero (con su día y probabilidad) y el mejor día
 * para salir; si no llueve, hacia dónde van las máximas.
 */
export function fraseSemana(dias: DiaClima[], dia: (t: number) => string): string | null {
    if (dias.length < 2) return null;
    const nombre = (d: DiaClima, i: number) => (i === 0 ? "hoy" : i === 1 ? "mañana" : `el ${dia(d.t)}`);
    const conIndice = dias.map((d, i) => ({ d, i }));
    const tormenta = conIndice.find(({ d }) => (d.codigo ?? 0) >= 95);
    const lluviosos = conIndice.filter(({ d }) => (d.probLluvia ?? 0) >= 50 || familiaCielo(d.codigo) === "lluvia" || familiaCielo(d.codigo) === "nieve");
    const partes: string[] = [];
    if (tormenta) partes.push(`Tormenta ${nombre(tormenta.d, tormenta.i)}${tormenta.d.probLluvia !== null ? ` (${Math.round(tormenta.d.probLluvia)} %)` : ""}`);
    const lluvia = lluviosos.filter((x) => x !== tormenta);
    if (lluvia.length) {
        const nieve = familiaCielo(lluvia[0].d.codigo) === "nieve";
        const dosPrimeros = lluvia.slice(0, 2).map((x) => nombre(x.d, x.i));
        partes.push(`${partes.length ? (nieve ? "nieve" : "lluvia") : nieve ? "Nieve" : "Lluvia"} ${dosPrimeros.join(" y ")}${lluvia.length > 2 ? ` y ${lluvia.length - 2} día${lluvia.length - 2 > 1 ? "s" : ""} más` : ""}`);
    }
    if (partes.length) {
        const buenos = conIndice.filter(({ d, i }) => i > 0 && (d.probLluvia ?? 100) < 20 && (d.codigo ?? 99) <= 3);
        const mejor = buenos.sort((a, b) => Math.abs((a.d.max ?? 0) - 23) - Math.abs((b.d.max ?? 0) - 23))[0];
        return `${partes.join("; ")}${mejor ? ` · mejor día: ${nombre(mejor.d, mejor.i)}` : ""}.`;
    }
    const maxs = dias.map((d) => d.max).filter((v): v is number => v !== null);
    if (maxs.length < 2) return "Semana seca.";
    const primero = maxs[0], ultimo = maxs[maxs.length - 1];
    if (ultimo - primero >= 3) return `Semana seca; las máximas suben de ${Math.round(primero)}° a ${Math.round(ultimo)}°.`;
    if (primero - ultimo >= 3) return `Semana seca; las máximas bajan de ${Math.round(primero)}° a ${Math.round(ultimo)}°.`;
    return `Semana seca y estable, máximas de ${Math.round(Math.min(...maxs))}° a ${Math.round(Math.max(...maxs))}°.`;
}

/** Las horas (del pronóstico de 72 h) que caen dentro de un día dado. */
export function horasDelDia(horas: HoraClima[], dia: DiaClima, siguiente?: DiaClima): HoraClima[] {
    const fin = siguiente?.t ?? dia.t + 86_400_000;
    return horas.filter((h) => h.t >= dia.t && h.t < fin);
}
