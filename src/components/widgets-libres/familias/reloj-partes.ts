/**
 * Lógica pura del reloj celeste (ola 0929 · F): la agenda del cielo (lo próximo que va a pasar,
 * del orto de mañana al próximo eclipse) y cómo repartir los glifos de los planetas en la rueda
 * sin que se pisen. Sin React: se prueba sola.
 */
import { nombreEclipse, nombreEstacion, type Eclipse, type Tramo, type TipoFase, type Signo } from "@/lib/astro/cielo";

export type ClaseAcontecimiento = "sol" | "dorada" | "luna" | "fase" | "signo" | "eclipse" | "estacion";

export interface Acontecimiento {
    clave: string;
    clase: ClaseAcontecimiento;
    texto: string;
    fecha: Date;
    /** Solo para las fases: cuál (para dibujar su Luna). */
    fase?: TipoFase;
}

export interface EntradaAgenda {
    orto: Date | null;
    ocaso: Date | null;
    doradas: { manana: Tramo | null; tarde: Tramo | null } | null;
    lunaHorizonte: { salida: Date | null; puesta: Date | null } | null;
    fases: { tipo: TipoFase; fecha: Date }[];
    proximoSigno: { fecha: Date; signo: Signo };
    eclipse: Eclipse | null;
    estacion: { fecha: Date; lon: 0 | 90 | 180 | 270; tipo: "equinoccio" | "solsticio" };
    lat: number | null;
}

const NOMBRE_FASE: Record<TipoFase, string> = { nueva: "Luna nueva", creciente: "Cuarto creciente", llena: "Luna llena", menguante: "Cuarto menguante" };

/**
 * Lo que va a pasar en el cielo a partir de `ahora`, en orden. `lejanos: false` deja solo lo de
 * hoy y mañana (orto, ocaso, horas doradas, la Luna en el horizonte).
 */
export function agendaCeleste(c: EntradaAgenda, ahora: Date, opciones: { max?: number; lejanos?: boolean; cercanos?: boolean } = {}): Acontecimiento[] {
    const { max = 6, lejanos = true, cercanos = true } = opciones;
    const t = ahora.getTime();
    const lista: Acontecimiento[] = [];
    const poner = (a: Acontecimiento) => { if (a.fecha.getTime() > t) lista.push(a); };
    if (cercanos) {
        if (c.orto) poner({ clave: "orto", clase: "sol", texto: "Sale el Sol", fecha: c.orto });
        if (c.ocaso) poner({ clave: "ocaso", clase: "sol", texto: "Se pone el Sol", fecha: c.ocaso });
        if (c.doradas?.manana) poner({ clave: "dorada-m", clase: "dorada", texto: "Hora dorada", fecha: c.doradas.manana.inicio });
        if (c.doradas?.tarde) poner({ clave: "dorada-t", clase: "dorada", texto: "Hora dorada", fecha: c.doradas.tarde.inicio });
        if (c.lunaHorizonte?.salida) poner({ clave: "luna-sale", clase: "luna", texto: "Sale la Luna", fecha: c.lunaHorizonte.salida });
        if (c.lunaHorizonte?.puesta) poner({ clave: "luna-pone", clase: "luna", texto: "Se pone la Luna", fecha: c.lunaHorizonte.puesta });
    }
    if (lejanos) {
        for (const f of c.fases) poner({ clave: `fase-${f.tipo}`, clase: "fase", texto: NOMBRE_FASE[f.tipo], fecha: f.fecha, fase: f.tipo });
        poner({ clave: "signo", clase: "signo", texto: `El Sol entra en ${c.proximoSigno.signo.nombre}`, fecha: c.proximoSigno.fecha });
        if (c.eclipse) poner({ clave: "eclipse", clase: "eclipse", texto: nombreEclipse(c.eclipse), fecha: c.eclipse.fecha });
        const est = nombreEstacion(c.estacion.lon, c.lat);
        poner({ clave: "estacion", clase: "estacion", texto: `Empieza el ${est} (${c.estacion.tipo})`, fecha: c.estacion.fecha });
    }
    return lista.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()).slice(0, max);
}

/** La próxima fase principal de la Luna (para la línea corta de s/m). */
export function proximaFaseDe(c: Pick<EntradaAgenda, "fases">, ahora: Date): { tipo: TipoFase; fecha: Date } | null {
    return c.fases.find((f) => f.fecha.getTime() > ahora.getTime()) ?? null;
}

/**
 * Reparte los glifos en la rueda: si dos astros están a menos de `separacion` grados, se
 * separan lo justo (relajación simétrica) manteniendo el orden. Devuelve la longitud de
 * dibujo de cada uno; la real sigue marcada con una muesca en el anillo.
 */
export function colocarGlifos(astros: { clave: string; lon: number }[], separacion: number): Record<string, number> {
    const n = astros.length;
    if (!n) return {};
    const orden = [...astros].sort((a, b) => a.lon - b.lon).map((a) => ({ clave: a.clave, lon: a.lon }));
    for (let vuelta = 0; vuelta < 40; vuelta++) {
        let movido = false;
        for (let i = 0; i < n; i++) {
            const a = orden[i], b = orden[(i + 1) % n];
            let dif = b.lon - a.lon;
            if (i === n - 1) dif += 360;
            if (n > 1 && dif < separacion) {
                const empuje = (separacion - dif) / 2;
                a.lon -= empuje;
                b.lon += empuje;
                movido = true;
            }
        }
        if (!movido) break;
    }
    return Object.fromEntries(orden.map((a) => [a.clave, ((a.lon % 360) + 360) % 360]));
}

/** Fracción del día transcurrida entre orto y ocaso (0-1), o null de noche o sin dato. */
export function fraccionDelDia(ahora: Date, orto: Date | null, ocaso: Date | null): number | null {
    if (!orto || !ocaso) return null;
    const f = (ahora.getTime() - orto.getTime()) / (ocaso.getTime() - orto.getTime());
    return f >= 0 && f <= 1 ? f : null;
}

/** Duración legible: «11 h 42 min». */
export function duracion(ms: number): string {
    const min = Math.max(0, Math.round(ms / 60_000));
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}
