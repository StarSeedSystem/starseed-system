/**
 * Medidor de Oracle Cloud en «Consumo y créditos» — tipos y reglas PURAS (OC1010 · 2026-10-10).
 *
 * Seguro para el cliente: sin `node:`, sin red, sin reloj propio. Lo leen la ruta
 * `/api/mando/oracle/consumo` (servidor) y `medidor-consumo.tsx` (navegador). El documento lo
 * escribe `scripts/puente/medidor_oracle.py` en `~/.starseed/oracle-consumo.json` con la CLI de
 * Oracle; aquí solo se valida con lista blanca (nada de ids) y se convierte en filas de barras.
 * Contrato: `architecture/oracle-consumo.md`.
 */

import type { TonoConsumo } from "@/lib/mando/consumo-tipos";

export interface GastoOracle {
    mes: number | null;
    previsto: number | null;
    presupuesto: number | null;
    presupuestoNombre: string;
    calculado: string | null;
    moneda: string;
    fuente: string;
    obsoleto: boolean;
    /** Gasto por día del mes (API de uso de Oracle), del más viejo al más nuevo. */
    porDia: { dia: string; coste: number }[];
}

export interface PruebaOracle {
    activa: boolean;
    credito: number | null;
    usado: number | null;
    restante: number | null;
    moneda: string;
    fin: string | null;
    diasRestantes: number | null;
}

export interface MaquinaReclamacion {
    nombre: string;
    medida: boolean;
    riesgo: boolean;
    nivel: "no" | "aviso" | "alto" | "sin-medir";
    cpuP95: number | null;
    memP95: number | null;
    redP95Pct: number | null;
    dias: number | null;
    reclamableDesde: string | null;
}

export interface InstanciaConsumo {
    nombre: string;
    forma: string;
    ocpus: number;
    gb: number;
    estado: string;
}

export interface ConsumoOracle {
    leido: string | null;
    ok: boolean;
    region: string;
    consola: string;
    gasto: GastoOracle | null;
    prueba: PruebaOracle | null;
    instancias: InstanciaConsumo[];
    computo: { a1Ocpus: number; a1Gb: number; micro: number; a1Nombre: string; a1Estado: string } | null;
    horasA1: { ocpuH: number; gbH: number } | null;
    salidaGb: number | null;
    disco: { gb: number; arranqueGb: number; bloquesGb: number } | null;
    objetos: { gb: number; cubos: number } | null;
    reclamacion: { riesgo: boolean; maquinas: MaquinaReclamacion[] } | null;
    freno: { activo: boolean; motivo: string };
    margen: { apto: boolean; motivo: string; cpuLibrePct: number | null; memLibreGb: number | null };
    errores: { parte: string; error: string }[];
    obsoletas: string[];
}

/** Límites Always Free (architecture/oracle-nube.md §1). */
export const LIMITES_ORACLE = Object.freeze({
    a1Ocpu: 2,
    a1Gb: 12,
    a1OcpuH: 1500,
    a1GbH: 9000,
    micro: 2,
    discoGb: 200,
    objetosGb: 20,
    salidaGb: 10 * 1024,
});

export const CONSOLA_ORACLE = "https://cloud.oracle.com/?region=mx-queretaro-1";

const OCID = /ocid1\./i;

function obj(v: unknown): Record<string, unknown> | null {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function num(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function txt(v: unknown, max = 200): string {
    return typeof v === "string" && !OCID.test(v) ? v.slice(0, max) : "";
}
function fecha(v: unknown): string | null {
    const t = txt(v, 40);
    return t && Number.isFinite(Date.parse(t)) ? t : null;
}

/** Valida el documento del medidor con lista blanca; `null` si no es un documento. */
export function leerConsumoOracle(json: unknown): ConsumoOracle | null {
    let d: Record<string, unknown> | null;
    if (typeof json === "string") {
        try {
            d = obj(JSON.parse(json));
        } catch {
            return null;
        }
    } else d = obj(json);
    if (!d || typeof d.leido !== "string") return null;

    const g = obj(d.gasto);
    const p = obj(d.prueba);
    const c = obj(d.computo);
    const u = obj(d.uso);
    const di = obj(d.disco);
    const o = obj(d.objetos);
    const r = obj(d.reclamacion);
    const f = obj(d.freno);
    const m = obj(d.margen);
    const consola = txt(d.consola);

    return {
        leido: fecha(d.leido),
        ok: d.ok === true,
        region: txt(d.region, 40),
        consola: consola.startsWith("https://cloud.oracle.com/") ? consola : CONSOLA_ORACLE,
        gasto: g
            ? {
                  mes: num(g.mes),
                  previsto: num(g.previsto),
                  presupuesto: num(g.presupuesto),
                  presupuestoNombre: txt(g.presupuesto_nombre, 80),
                  calculado: fecha(g.calculado),
                  moneda: txt(g.moneda, 8),
                  fuente: txt(g.fuente, 60),
                  obsoleto: g.obsoleto === true,
                  porDia: (Array.isArray(g.por_dia) ? g.por_dia : [])
                      .map(obj)
                      .filter((x): x is Record<string, unknown> => x !== null)
                      .map((x) => ({ dia: txt(x.dia, 10), coste: num(x.coste) ?? 0 }))
                      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia))
                      .slice(-31),
              }
            : null,
        prueba: p
            ? {
                  activa: p.activa === true,
                  credito: num(p.credito),
                  usado: num(p.usado),
                  restante: num(p.restante),
                  moneda: txt(p.moneda, 8),
                  fin: fecha(p.fin),
                  diasRestantes: num(p.dias_restantes),
              }
            : null,
        instancias: (Array.isArray(d.instancias) ? d.instancias : [])
            .map(obj)
            .filter((i): i is Record<string, unknown> => i !== null)
            .map((i) => ({
                nombre: txt(i.nombre, 80),
                forma: txt(i.forma, 60),
                ocpus: num(i.ocpus) ?? 0,
                gb: num(i.gb) ?? 0,
                estado: txt(i.estado, 30),
            })),
        computo: c
            ? {
                  a1Ocpus: num(c.a1_ocpus) ?? 0,
                  a1Gb: num(c.a1_gb) ?? 0,
                  micro: num(c.micro) ?? 0,
                  a1Nombre: txt(c.a1_nombre, 80),
                  a1Estado: txt(c.a1_estado, 30),
              }
            : null,
        horasA1: u && num(u.a1_ocpu_h) !== null ? { ocpuH: num(u.a1_ocpu_h) ?? 0, gbH: num(u.a1_gb_h) ?? 0 } : null,
        salidaGb: u ? num(u.salida_gb) : null,
        disco: di && num(di.gb) !== null ? { gb: num(di.gb) ?? 0, arranqueGb: num(di.arranque_gb) ?? 0, bloquesGb: num(di.bloques_gb) ?? 0 } : null,
        objetos: o && num(o.gb) !== null ? { gb: num(o.gb) ?? 0, cubos: num(o.cubos) ?? 0 } : null,
        reclamacion: r
            ? {
                  riesgo: r.riesgo === true,
                  maquinas: (Array.isArray(r.maquinas) ? r.maquinas : [])
                      .map(obj)
                      .filter((x): x is Record<string, unknown> => x !== null)
                      .map((x) => {
                          const nivel = txt(x.nivel, 10);
                          return {
                              nombre: txt(x.nombre, 80),
                              medida: x.medida === true,
                              riesgo: x.riesgo === true,
                              nivel: nivel === "no" || nivel === "aviso" || nivel === "alto" ? nivel : "sin-medir",
                              cpuP95: num(x.cpu_p95),
                              memP95: num(x.mem_p95),
                              redP95Pct: num(x.red_p95_pct),
                              dias: num(x.dias),
                              reclamableDesde: fecha(x.reclamable_desde),
                          } satisfies MaquinaReclamacion;
                      }),
              }
            : null,
        freno: { activo: f?.activo === true, motivo: txt(f?.motivo, 300) },
        margen: {
            apto: m?.apto === true,
            motivo: txt(m?.motivo, 200),
            cpuLibrePct: num(m?.cpu_libre_pct),
            memLibreGb: num(m?.mem_libre_gb),
        },
        errores: (Array.isArray(d.errores) ? d.errores : [])
            .map(obj)
            .filter((e): e is Record<string, unknown> => e !== null)
            .map((e) => ({ parte: txt(e.parte, 30), error: txt(e.error, 240) }))
            .filter((e) => e.error),
        obsoletas: (Array.isArray(d.obsoletas) ? d.obsoletas : []).map((x) => txt(x, 30)).filter(Boolean),
    };
}

/** Lo que el navegador recibe de la ruta ya validado: comprueba la forma antes de pintarlo. */
export function esConsumoOracle(x: unknown): x is ConsumoOracle {
    const o = obj(x);
    return (
        !!o &&
        (typeof o.leido === "string" || o.leido === null) &&
        Array.isArray(o.instancias) &&
        Array.isArray(o.errores) &&
        !!obj(o.freno) &&
        !!obj(o.margen)
    );
}

// ─── vista: de medidas a filas de barras ───

export interface FilaOracle {
    id: string;
    etiqueta: string;
    valor: string;
    fraccion: number | null;
    tono: TonoConsumo;
    detalle: string;
}

export interface VistaOracle {
    estado: { texto: string; tono: TonoConsumo };
    filas: FilaOracle[];
    reclamacion: { tono: TonoConsumo; texto: string } | null;
    haceMin: number | null;
    viejo: boolean;
}

function n(v: number, dec = 2): string {
    return v.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function nCorto(v: number): string {
    return v.toLocaleString("es-ES", { maximumFractionDigits: v < 10 ? 2 : v < 100 ? 1 : 0 });
}
function diaCorto(iso: string | null): string {
    if (!iso) return "?";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "?" : d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}
function tonoUso(f: number | null): TonoConsumo {
    if (f === null || !Number.isFinite(f)) return "neutro";
    if (f >= 1) return "peligro";
    if (f >= 0.8) return "aviso";
    return "ok";
}

/** Minutos desde la lectura (o null). Más de 45 min = viejo (el recolector mide cada 30). */
export function haceMinutos(iso: string | null, ahora: number): number | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? Math.max(0, Math.floor((ahora - t) / 60_000)) : null;
}

/** PURA: las filas de la tarjeta, cada una con su límite gratis. Lo que no se midió se dice. */
export function vistaOracle(c: ConsumoOracle, ahora: number): VistaOracle {
    const filas: FilaOracle[] = [];
    const g = c.gasto;
    const moneda = g?.moneda || c.prueba?.moneda || "";

    if (g && g.mes !== null) {
        const tope = g.presupuesto && g.presupuesto > 0 ? g.presupuesto : null;
        const prev = g.previsto !== null ? `previsto ${n(g.previsto)} ${moneda}` : "previsión sin dato";
        filas.push({
            id: "gasto",
            etiqueta: "Gasto del mes",
            valor: tope ? `${n(g.mes)} / ${n(tope)} ${moneda}` : `${n(g.mes)} ${moneda}`,
            fraccion: tope ? g.mes / tope : null,
            tono: g.mes > 0 || (g.previsto ?? 0) > 0 ? "peligro" : "ok",
            detalle: `${prev} · ${g.fuente || "Oracle"}${g.presupuestoNombre ? ` «${g.presupuestoNombre}»` : ""}${g.obsoleto ? " · lectura anterior" : ""}`,
        });
    } else {
        filas.push({ id: "gasto", etiqueta: "Gasto del mes", valor: "sin medir", fraccion: null, tono: "neutro", detalle: "Oracle no devolvió el presupuesto ni la API de uso." });
    }

    const p = c.prueba;
    if (p?.activa && p.credito !== null) {
        const usado = p.usado ?? null;
        filas.push({
            id: "prueba",
            etiqueta: "Crédito de la prueba",
            valor: p.restante !== null ? `quedan ${n(p.restante, 0)} de ${n(p.credito, 0)} ${p.moneda}` : `${n(p.credito, 0)} ${p.moneda}`,
            fraccion: usado !== null && p.credito > 0 ? usado / p.credito : null,
            tono: usado !== null && usado > 0 ? "aviso" : "ok",
            detalle: `vence el ${diaCorto(p.fin)}${p.diasRestantes !== null ? ` (quedan ${p.diasRestantes} días)` : ""} · restante = crédito − gasto medido; después solo sigue lo Always Free`,
        });
    } else if (p && !p.activa) {
        filas.push({ id: "prueba", etiqueta: "Crédito de la prueba", valor: "sin prueba activa", fraccion: null, tono: "neutro", detalle: "La cuenta ya solo tiene lo Always Free." });
    }

    const comp = c.computo;
    if (comp) {
        const a1 = c.reclamacion?.maquinas.find((m) => m.nombre === comp.a1Nombre) ?? null;
        const uso =
            a1 && a1.medida
                ? `uso real 7 días: CPU p95 ${nCorto(a1.cpuP95 ?? 0)} % · memoria ${nCorto(a1.memP95 ?? 0)} %`
                : "uso real sin métricas";
        filas.push({
            id: "a1",
            etiqueta: `A1 ${comp.a1Nombre || ""}`.trim(),
            valor: `${nCorto(comp.a1Ocpus)}/${LIMITES_ORACLE.a1Ocpu} OCPU · ${nCorto(comp.a1Gb)}/${LIMITES_ORACLE.a1Gb} GB`,
            fraccion: Math.max(comp.a1Ocpus / LIMITES_ORACLE.a1Ocpu, comp.a1Gb / LIMITES_ORACLE.a1Gb),
            tono: comp.a1Ocpus > LIMITES_ORACLE.a1Ocpu || comp.a1Gb > LIMITES_ORACLE.a1Gb ? "peligro" : "ok",
            detalle: `${comp.a1Estado || "sin máquina"} · ${uso} · ${comp.micro}/${LIMITES_ORACLE.micro} micro`,
        });
    }
    if (c.horasA1) {
        filas.push({
            id: "horas",
            etiqueta: "Horas A1 del mes",
            valor: `${nCorto(c.horasA1.ocpuH)} / ${n(LIMITES_ORACLE.a1OcpuH, 0)} OCPU·h`,
            fraccion: c.horasA1.ocpuH / LIMITES_ORACLE.a1OcpuH,
            tono: tonoUso(c.horasA1.ocpuH / LIMITES_ORACLE.a1OcpuH),
            detalle: `${nCorto(c.horasA1.gbH)} / ${n(LIMITES_ORACLE.a1GbH, 0)} GB·h de memoria`,
        });
    }
    filas.push(
        c.disco
            ? {
                  id: "disco",
                  etiqueta: "Disco (arranque + bloques)",
                  valor: `${nCorto(c.disco.gb)} / ${LIMITES_ORACLE.discoGb} GB`,
                  fraccion: c.disco.gb / LIMITES_ORACLE.discoGb,
                  tono: tonoUso(c.disco.gb / LIMITES_ORACLE.discoGb),
                  detalle: `arranque ${nCorto(c.disco.arranqueGb)} GB · bloques ${nCorto(c.disco.bloquesGb)} GB`,
              }
            : { id: "disco", etiqueta: "Disco (arranque + bloques)", valor: "sin medir", fraccion: null, tono: "neutro", detalle: "" },
    );
    filas.push(
        c.objetos
            ? {
                  id: "objetos",
                  etiqueta: "Object Storage",
                  valor: `${nCorto(c.objetos.gb)} / ${LIMITES_ORACLE.objetosGb} GB`,
                  fraccion: c.objetos.gb / LIMITES_ORACLE.objetosGb,
                  tono: tonoUso(c.objetos.gb / LIMITES_ORACLE.objetosGb),
                  detalle: c.objetos.cubos === 1 ? "1 cubo" : `${c.objetos.cubos} cubos`,
              }
            : { id: "objetos", etiqueta: "Object Storage", valor: "sin medir", fraccion: null, tono: "neutro", detalle: "" },
    );
    filas.push(
        c.salidaGb !== null
            ? {
                  id: "salida",
                  etiqueta: "Salida de datos del mes",
                  valor: `${nCorto(c.salidaGb)} GB / 10 TB`,
                  fraccion: c.salidaGb / LIMITES_ORACLE.salidaGb,
                  tono: tonoUso(c.salidaGb / LIMITES_ORACLE.salidaGb),
                  detalle: "SKU «Outbound Data Transfer» de la API de uso",
              }
            : { id: "salida", etiqueta: "Salida de datos del mes", valor: "sin medir", fraccion: null, tono: "neutro", detalle: "" },
    );

    // Reclamación por inactividad: 7 días con CPU p95, red y (en A1) memoria bajo el 20 %.
    let reclamacion: VistaOracle["reclamacion"] = null;
    const maquinas = c.reclamacion?.maquinas ?? [];
    const enRiesgo = maquinas.find((m) => m.riesgo);
    if (enRiesgo) {
        const red = enRiesgo.redP95Pct !== null ? `, red ${nCorto(enRiesgo.redP95Pct)} %` : "";
        reclamacion = {
            tono: enRiesgo.nivel === "alto" ? "peligro" : "aviso",
            texto:
                `${enRiesgo.nombre} lleva ${nCorto(enRiesgo.dias ?? 0)} días ocioso (CPU p95 ${nCorto(enRiesgo.cpuP95 ?? 0)} %, memoria ${nCorto(enRiesgo.memP95 ?? 0)} %${red}; umbral 20 %). ` +
                (enRiesgo.nivel === "alto"
                    ? "Oracle ya puede reclamarlo. Darle trabajo lo evita."
                    : `Si sigue así, Oracle puede reclamarlo desde el ${diaCorto(enRiesgo.reclamableDesde)}. Darle trabajo (servicios o un agente del enjambre) lo evita.`),
        };
    } else if (maquinas.some((m) => m.medida)) {
        const m = maquinas.find((x) => x.medida)!;
        reclamacion = { tono: "ok", texto: `Sin riesgo de reclamación: ${m.nombre} con CPU p95 ${nCorto(m.cpuP95 ?? 0)} % y memoria ${nCorto(m.memP95 ?? 0)} %.` };
    } else if (maquinas.length) {
        reclamacion = { tono: "neutro", texto: "Sin métricas de uso: no se puede decir si hay riesgo de reclamación." };
    }

    const haceMin = haceMinutos(c.leido, ahora);
    const viejo = haceMin === null || haceMin > 45;
    let estado: VistaOracle["estado"];
    if (c.freno.activo) estado = { texto: "Gasto > 0 · freno", tono: "peligro" };
    else if (!g || g.mes === null) estado = { texto: "Sin medir", tono: "neutro" };
    else if (enRiesgo) estado = { texto: "Riesgo de reclamación", tono: "aviso" };
    else if (c.errores.length || viejo) estado = { texto: viejo ? "Lectura vieja" : "Lectura parcial", tono: "aviso" };
    else estado = { texto: `Gratis · ${n(g.mes)} ${moneda}`, tono: "ok" };

    return { estado, filas, reclamacion, haceMin, viejo };
}
