/**
 * Medidor «Consumo y créditos» — lector del SERVIDOR (2026-09-29).
 *
 * Lee lo que escribe la vigía de consumo (`scripts/puente/vigia_consumo.py`, cada 15 min,
 * lanzada por el director de orquestación) y lo que Alex declara de su crédito de Claude:
 *   ~/.starseed/consumo.json            · la última vuelta (hoy, freno, bucles, Jev)
 *   ~/.starseed/consumo-historial.json  · 45 días: peticiones y bytes estimados por día
 *   ~/.starseed/presupuestos.json       · los topes (los edita el Mando por POST)
 *   ~/.starseed/credito-claude-nube.json· el crédito de Claude en la nube, declarado
 *
 * Viven fuera del repo: son datos de la máquina y de la cuenta de Alex, no del proyecto.
 * Solo se devuelven NÚMEROS, rutas de API ya saneadas por la vigía y fechas: nunca claves ni
 * rutas del disco. `derivarConsumo` es pura (recibe el reloj) y es la que se prueba.
 *
 * `node:` solo aquí; el cliente importa los tipos de `consumo-tipos.ts`.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ENLACE_USO_CLAUDE, estadoCreditoClaude, type ConfigCreditoClaude } from "@/lib/mando/credito-claude";
import {
    normalizarPresupuestos,
    tonoPorPct,
    type DatosConsumo,
    type DiaHistorial,
    type MedidorClaudeNube,
    type MedidorJev,
    type MedidorSupabase,
    type NivelSupabase,
    type Presupuestos,
    type TonoConsumo,
} from "@/lib/mando/consumo-tipos";

const MB = 1024 * 1024;
/** La vigía corre cada 15 min: más de 45 sin medir es que no está corriendo. */
export const FRESCO_MS = 45 * 60_000;
const DIA_MS = 86_400_000;
export const DIAS_SPARKLINE = 14;
export const COMANDO_CREDITO_CLAUDE = "python3 scripts/puente/credito_claude_nube.py declarar --restante <USD>";

/** Carpeta de datos de la máquina. `STARSEED_DATOS_DIR` solo para pruebas. */
export function directorioDatos(): string {
    const env = process.env.STARSEED_DATOS_DIR;
    return typeof env === "string" && env.length > 0 ? env : path.join(os.homedir(), ".starseed");
}

type Obj = Record<string, unknown>;

function obj(x: unknown): Obj | null {
    return x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : null;
}

function num(x: unknown, porDefecto = 0): number {
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : porDefecto;
}

function numONull(x: unknown): number | null {
    if (x === null || x === undefined || x === "") return null;
    const n = typeof x === "number" ? x : Number(x);
    return Number.isFinite(n) ? n : null;
}

function texto(x: unknown, max = 120): string {
    return typeof x === "string" ? x.slice(0, max) : "";
}

function isoDia(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

function diaMs(iso: string): number {
    return Date.parse(`${iso}T00:00:00Z`);
}

function sumarMeses(iso: string, meses: number): string {
    const [a, m, d] = iso.split("-").map(Number);
    const total = m - 1 + meses;
    const anio = a + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    return new Date(Date.UTC(anio, mes, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

/**
 * El ciclo vigente (mismo cálculo que `ciclo_actual` de la vigía): mensual desde
 * `ciclo_inicio`; sin él, se supone que empezó el primer día del historial y no se sabe
 * cuánto le queda.
 */
export function cicloActual(
    cicloInicio: string | null,
    hoy: string,
    primerDia: string | null,
): { inicio: string; diasRestantes: number | null; supuesto: boolean } {
    if (cicloInicio) {
        if (cicloInicio > hoy) {
            return { inicio: cicloInicio, diasRestantes: Math.round((diaMs(cicloInicio) - diaMs(hoy)) / DIA_MS), supuesto: false };
        }
        let k = 0;
        while (sumarMeses(cicloInicio, k + 1) <= hoy) k += 1;
        const inicio = sumarMeses(cicloInicio, k);
        const siguiente = sumarMeses(cicloInicio, k + 1);
        return { inicio, diasRestantes: Math.round((diaMs(siguiente) - diaMs(hoy)) / DIA_MS), supuesto: false };
    }
    return { inicio: primerDia ?? hoy, diasRestantes: null, supuesto: true };
}

function nivelPorPct(p: number): NivelSupabase {
    if (p >= 1) return "freno";
    if (p >= 0.7) return "aviso";
    return "ok";
}

const REMOTOS = new Set(["ok", "no_disponible", "error", "sin_credenciales"]);

function medidorSupabase(c: Obj, h: Obj, p: Presupuestos, ahora: number): MedidorSupabase {
    const dias = obj(h.dias) ?? {};
    const hoy = isoDia(ahora);
    const medidoEn = typeof c.t_utc === "string" && Number.isFinite(Date.parse(c.t_utc)) ? c.t_utc : null;
    const fresco = medidoEn !== null && ahora - Date.parse(medidoEn) <= FRESCO_MS;
    const cHoy = obj(c.hoy);
    const fuente = cHoy && cHoy.dia === hoy ? cHoy : obj(dias[hoy]);

    const peticiones = num(fuente?.peticiones);
    const mb = num(fuente?.bytes_est) / MB;
    const pctPeticiones = peticiones / p.supabase_peticiones_dia;
    const pctMb = mb / p.supabase_mb_dia;

    const claves = Object.keys(dias).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const ciclo = cicloActual(p.ciclo_inicio, hoy, claves[0] ?? null);
    let bytesCiclo = 0;
    for (const d of claves) {
        if (d >= ciclo.inicio && d <= hoy) bytesCiclo += num(obj(dias[d])?.bytes_est);
    }
    // Hoy puede ir por delante del historial si la vigía escribió consumo.json y no el otro.
    if (fuente === cHoy && cHoy && !dias[hoy]) bytesCiclo += num(cHoy.bytes_est);
    const mbCiclo = bytesCiclo / MB;
    const pctCiclo = mbCiclo / p.supabase_mb_ciclo;

    const f = obj(c.freno) ?? {};
    const hasta = typeof f.hasta === "string" ? f.hasta : null;
    const frenoActivo = f.activo === true && (hasta === null || Date.parse(hasta) > ahora);
    const remoto = typeof f.remoto === "string" && REMOTOS.has(f.remoto) ? (f.remoto as MedidorSupabase["freno"]["remoto"]) : null;

    let nivel: NivelSupabase;
    if (c.restringido === true) nivel = "restringido";
    else if (!fuente) nivel = "sin-medir";
    else if (frenoActivo) nivel = "freno";
    else nivel = nivelPorPct(Math.max(pctPeticiones, pctMb, pctCiclo));

    const rt = obj(fuente?.realtime);
    const topCrudo: unknown = fuente?.top;
    const historial: DiaHistorial[] = [];
    for (let i = DIAS_SPARKLINE - 1; i >= 0; i -= 1) {
        const dia = isoDia(ahora - i * DIA_MS);
        const d = dia === hoy && fuente ? fuente : obj(dias[dia]);
        historial.push({ dia, peticiones: d ? num(d.peticiones) : null });
    }
    const bucle = obj(c.ultimo_bucle);

    return {
        nivel,
        medidoEn,
        fresco,
        dia: hoy,
        peticiones,
        mb,
        fraccionMedida: numONull(fuente?.fraccion_medida),
        pctPeticiones,
        pctMb,
        c402: num(fuente?.c402),
        top: (Array.isArray(topCrudo) ? (topCrudo as unknown[]) : [])
            .map(obj)
            .filter((t): t is Obj => t !== null)
            .slice(0, 3)
            .map((t) => ({ ruta: texto(t.ruta, 90) || "?", n: num(t.n), mb: num(t.bytes_est) / MB })),
        realtime: rt
            ? { mb: num(rt.bytes_est) / MB, escrituras: num(rt.escrituras), registros: num(rt.registros), estimado: true }
            : null,
        ciclo: {
            mb: mbCiclo,
            presupuestoMb: p.supabase_mb_ciclo,
            pct: pctCiclo,
            inicio: ciclo.inicio,
            diasRestantes: ciclo.diasRestantes,
            supuesto: ciclo.supuesto,
        },
        freno: {
            activo: frenoActivo,
            motivo: frenoActivo ? texto(f.motivo, 240) || null : null,
            hasta: frenoActivo ? hasta : null,
            remoto,
        },
        historial,
        ultimoBucle: bucle
            ? { t: texto(bucle.t, 40), ruta: texto(bucle.ruta, 90), ua: texto(bucle.ua, 60), n: num(bucle.n) }
            : null,
    };
}

function medidorJev(c: Obj, p: Presupuestos): MedidorJev {
    const j = obj(c.jev) ?? {};
    const usdHoy = numONull(j.coste_hoy);
    const saldo = numONull(j.saldo);
    const pct = usdHoy !== null && p.jev_usd_dia > 0 ? usdHoy / p.jev_usd_dia : null;
    let tono: TonoConsumo = tonoPorPct(pct);
    if (saldo !== null && saldo < p.openrouter_usd_min_saldo) tono = "peligro";
    return { usdHoy, techo: p.jev_usd_dia, pct, saldo, saldoMin: p.openrouter_usd_min_saldo, tono };
}

const TONO_CREDITO: Record<string, TonoConsumo> = { ok: "ok", normal: "neutro", aviso: "aviso", peligro: "peligro" };

function medidorClaude(credito: unknown, ahora: number): MedidorClaudeNube {
    const base = { comando: COMANDO_CREDITO_CLAUDE, enlace: ENLACE_USO_CLAUDE };
    const cfg = obj(credito);
    if (!cfg || !("restante_usd" in cfg)) {
        return {
            ...base,
            restante: null,
            total: null,
            fraccion: null,
            declaradoEn: null,
            vence: null,
            dias: null,
            tono: "neutro",
            aviso: "Sin declarar: dilo con el comando de abajo.",
        };
    }
    const e = estadoCreditoClaude(cfg as unknown as ConfigCreditoClaude, ahora);
    return {
        ...base,
        restante: e.restante,
        total: e.total,
        fraccion: e.fraccion,
        declaradoEn: typeof cfg.declarado_en === "string" && cfg.declarado_en ? cfg.declarado_en : null,
        vence: typeof cfg.vence === "string" && cfg.vence ? cfg.vence : null,
        dias: e.dias,
        tono: TONO_CREDITO[e.tono] ?? "neutro",
        aviso: e.avisos[0] ?? null,
    };
}

/** PURA: los cuatro archivos (ya parseados, o null) → lo que ve el medidor. */
export function derivarConsumo(
    entrada: { consumo: unknown; historial: unknown; presupuestos: unknown; credito: unknown },
    ahora: number,
): DatosConsumo {
    const presupuestos = normalizarPresupuestos(entrada.presupuestos);
    const c = obj(entrada.consumo) ?? {};
    const h = obj(entrada.historial) ?? {};
    return {
        supabase: medidorSupabase(c, h, presupuestos, ahora),
        jev: medidorJev(c, presupuestos),
        claude: medidorClaude(entrada.credito, ahora),
        presupuestos,
        generadoEn: new Date(ahora).toISOString(),
    };
}

async function leerJson(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf8")) as unknown;
    } catch {
        return null;
    }
}

export async function leerDatosConsumo(ahora = Date.now(), dir = directorioDatos()): Promise<DatosConsumo> {
    const [consumo, historial, presupuestos, credito] = await Promise.all([
        leerJson(path.join(dir, "consumo.json")),
        leerJson(path.join(dir, "consumo-historial.json")),
        leerJson(path.join(dir, "presupuestos.json")),
        leerJson(path.join(dir, "credito-claude-nube.json")),
    ]);
    return derivarConsumo({ consumo, historial, presupuestos, credito }, ahora);
}

/** Escribe a un temporal y renombra: la vigía puede estar leyéndolo a la vez. */
export async function guardarPresupuestos(p: Presupuestos, dir = directorioDatos()): Promise<void> {
    await mkdir(dir, { recursive: true });
    const destino = path.join(dir, "presupuestos.json");
    const temporal = `${destino}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, JSON.stringify(p, null, 1), "utf8");
    await rename(temporal, destino);
}
