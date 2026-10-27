"use client";
/**
 * «Crear en 3D desde una imagen» (G3D1011E). Contrato: architecture/astraura-avatares-3d.md §11.
 *
 * El destino (Protomolécula, avatar, bot o pieza) lo da el contexto: `planOptimizacion` fija resolución,
 * LOD y cierre; `planificar` elige motor por etapa (o dice por qué no hay) y `elegirNeurona` qué neurona
 * podría. Orden: taller local › Space remoto (solo con permiso) › imposible, dicho en palabras. Si el taller
 * se queda sin memoria se reintenta solo con `siguienteIntento`. El resultado va a la Biblioteca con su
 * procedencia y las atribuciones de `usoPermitido`. Todo lo de fuera (taller, Space, Biblioteca) se inyecta.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { Esqueleto, Procedencia } from "../adn/adn";
import { planificar, usoPermitido, type PlanAvatar } from "../adn/canalizacion";
import { MOTORES_3D } from "../adn/motores";
import { capacidadesDe, planOptimizacion, siguienteIntento, type Destino3D, type Hierro, type PlanOptimizacion } from "../adn/optimizacion";
import { motivoDenegacion } from "./espacio-hf";
import { elegirNeurona, type NeuronaTaller } from "./reparto-taller";
import { avisarOrbe } from "@/lib/protomolecula/orbe4d/eventos";

export interface Contexto3D {
  destino: Destino3D;
  /** Hierro de ESTA neurona (null = no medido: no se promete generar). */
  hierro: Hierro | null;
  region: string | null;
  comercial: boolean;
  cuenta: string | null;
  grupos?: readonly string[];
  /** Neuronas del registro de MetaGenesis; null = aquí no se leyó (no se dice que no haya ninguna). */
  neuronas: readonly NeuronaTaller[] | null;
  esqueleto?: Esqueleto;
}
export type ResultadoTaller =
  | { ok: true; glb: Blob; lods: number[]; procedencia: Procedencia[] }
  | { ok: false; fallo: "sin-memoria" | "lento" | "otro"; motivo: string };
export interface OpcionesGenerar3D { titulo: string; permisoRemoto: boolean; esFotoDePersonas: boolean; consentimientoPersonas: boolean; usoHoy?: number }
export interface Dependencias3D {
  /** Taller local (servicios/taller-3d/taller.py, AV1011F); null mientras no exista en esta neurona. */
  taller: ((img: Blob, plan: PlanOptimizacion, progreso: (pct: number, etapa: string) => void) => Promise<ResultadoTaller>) | null;
  /** Space público de Hugging Face llamado DESDE EL NAVEGADOR de la persona (adaptador de Pixal3D y TRELLIS.2, `adaptadores/espacios-3d`; la ruta de servidor /api/avatares/espacio-hf queda solo como respaldo de validación); null = sin respaldo remoto. */
  espacio: ((img: Blob, op: OpcionesGenerar3D) => Promise<ResultadoTaller>) | null;
  /** `aviso`: se guardó, pero con algo pendiente que hay que decir (p. ej. la fila aún sin registrar en la cuenta). */
  guardar: (e: { titulo: string; destino: Destino3D; glb: Blob; lods: number[]; procedencia: Procedencia[]; atribuciones: string[] }) => Promise<{ ok: true; ref: string; aviso?: string } | { ok: false; motivo: string }>;
}
export interface Preparacion3D { optimizacion: PlanOptimizacion; plan: PlanAvatar; via: "local" | "remota" | "ninguna"; motivo: string; neurona: string }
export type Estado3D =
  | { fase: "lista" }
  | { fase: "generando"; intento: number; etapa: string; progreso: number | null; plan: PlanOptimizacion }
  | { fase: "hecha"; ref: string; lods: number[]; atribuciones: string[]; avisos: string[] }
  | { fase: "error"; motivo: string };

export const ESQUELETO_POR_DESTINO: Record<Destino3D, Esqueleto> = { protomolecula: "ninguno", impresion: "ninguno", avatar: "vrm-humanoide", bot: "libre", pieza: "ninguno" };
const motorGenerar = (p: PlanAvatar) => p.pasos.find((x) => x.etapa === "generar")?.motor ?? null;

/** Qué se puede hacer aquí y por qué: plan por etapa, vía (local, remota o ninguna) y la neurona que podría. */
export function prepararGeneracion(c: Contexto3D, deps: Pick<Dependencias3D, "taller" | "espacio">): Preparacion3D {
  const optimizacion = planOptimizacion(c.destino, c.hierro?.vramGB ?? null);
  const esqueleto = c.esqueleto ?? ESQUELETO_POR_DESTINO[c.destino];
  const caps = [...(c.hierro ? capacidadesDe({ ...c.hierro, permiteEspacioHf: false, claveExterna: false }) : (["cpu"] as const)), "navegador" as const];
  const base = { partida: "imagen" as const, esqueleto, region: c.region, comercial: c.comercial, permitirDePago: false, prioridad: optimizacion.prioridad, cerrada: optimizacion.cerrada };
  const local = planificar({ ...base, capacidades: caps }), ml = motorGenerar(local);
  // Sin taller no corre un generador local: el plan remoto genera solo con lo remoto (si no, lo local va primero y tapa al Space).
  const remoto = planificar({ ...base, capacidades: [...caps, "espacio-hf"] }, ml && !deps.taller ? MOTORES_3D.filter((m) => m.etapa !== "generar" || m.remoto) : MOTORES_3D), mr = motorGenerar(remoto);
  // A las demás se les pregunta por GENERAR (sin esqueleto): animar ocurre en el navegador de quien mira, y el reparto planifica sin «navegador».
  const neurona = c.neuronas ? `Para generar la malla: ${elegirNeurona({ destino: c.destino, partida: "imagen", esqueleto: "ninguno", region: c.region, comercial: c.comercial, cuenta: c.cuenta, grupos: c.grupos }, c.neuronas).motivo}`
    : "Qué otra neurona podría generarla: aquí no se leyó el registro de neuronas de MetaGenesis, así que no se puede decir.";
  if (ml && deps.taller) return { optimizacion, plan: local, via: "local", motivo: `Se genera en esta neurona con ${ml.nombre}.`, neurona };
  const porQue = ml ? `Esta neurona podría generar con ${ml.nombre}, pero su taller local (servicios/taller-3d) aún no está instalado aquí.` : "Esta neurona no puede generar en local (ver los motivos de la etapa «generar»).";
  const hayMotorLocal = !!ml;
  const permiteRemoto = hayMotorLocal || c.hierro?.permiteEspacioHf === true;
  if (mr?.remoto && deps.espacio && permiteRemoto) return { optimizacion, plan: remoto, via: "remota", motivo: `${porQue} Solo queda ${mr.nombre}: tu imagen saldría de este aparato.`, neurona };
  return { optimizacion, plan: local, via: "ninguna", motivo: `${porQue} ${hayMotorLocal ? "Tampoco hay Space disponible." : "Versiones públicas del Space (Pixal3D, TRELLIS.2) están apagadas para esta cuenta."}`, neurona };
}

/** Ejecuta la generación por la vía preparada, con reintentos más ligeros si falta memoria, y la guarda. */
export async function generar3d(img: Blob, op: OpcionesGenerar3D, prep: Preparacion3D, c: Contexto3D, deps: Dependencias3D, alEstado: (e: Estado3D) => void): Promise<Estado3D> {
  if (prep.via === "ninguna") return { fase: "error", motivo: prep.motivo };
  const { espacio, taller } = deps, desconectado: Estado3D = { fase: "error", motivo: "La vía preparada ya no está conectada: vuelve a abrir el diálogo." };
  let plan = prep.optimizacion, intento = 1, r: ResultadoTaller;
  if (prep.via === "remota") {
    if (!espacio) return desconectado;
    const no = motivoDenegacion({ permiso: op.permisoRemoto, esFotoDePersonas: op.esFotoDePersonas, consentimientoPersonas: op.consentimientoPersonas,
      imagenBytes: img.size, mime: img.type, usoHoy: op.usoHoy ?? 0 });
    if (no) return { fase: "error", motivo: no };
    alEstado({ fase: "generando", intento, etapa: "Enviando la imagen al Space de Hugging Face (no informa de su avance)…", progreso: null, plan });
    r = await espacio(img, op);
  } else {
    if (!taller) return desconectado;
    for (;;) {
      const p = plan, n = intento;
      alEstado({ fase: "generando", intento: n, etapa: "Preparando el taller…", progreso: 0, plan: p });
      r = await taller(img, p, (pct, etapa) => alEstado({ fase: "generando", intento: n, etapa, progreso: Math.max(0, Math.min(100, pct)), plan: p }));
      if (r.ok || r.fallo === "otro") break;
      const sig = siguienteIntento(p, r.fallo);
      if (!sig) { r = { ok: false, fallo: "otro", motivo: `${r.fallo === "lento" ? "Tarda demasiado en esta neurona incluso" : "No cabe en esta neurona ni"} con el intento más ligero (${p.generador.resolucion}${p.generador.pocaMemoria ? ", poca memoria" : ""}): ${r.motivo}` }; break; }
      plan = sig; intento++;
    }
  }
  if (!r.ok) return { fase: "error", motivo: r.motivo };
  const uso = usoPermitido({ procedencia: r.procedencia }, { region: c.region, comercial: c.comercial });
  const g = await deps.guardar({ titulo: op.titulo, destino: c.destino, glb: r.glb, lods: r.lods, procedencia: r.procedencia, atribuciones: uso.atribuciones });
  if (!g.ok) return { fase: "error", motivo: `Se generó, pero no se pudo guardar en la Biblioteca: ${g.motivo}` };
  // La orbe 4D de la Protomolécula se transforma en el diseño recién generado (si está encendida).
  avisarOrbe({ estado: "transformar", modelo: r.glb, titulo: op.titulo });
  const faltan = prep.plan.pasos.filter((s) => !s.saltada && !s.motor && s.etapa !== "detallar").map((s) => s.etapa);
  const avisos = [...uso.motivos, ...(g.aviso ? [g.aviso] : []), ...(r.lods.length ? [] : ["Sin niveles de detalle: el optimizador del taller (A1) aún no los hizo; se guarda el GLB tal cual."]),
    ...(faltan.length ? [`Queda pendiente: ${faltan.join(", ")} (no hay motor para eso en esta neurona).`] : [])];
  return { fase: "hecha", ref: g.ref, lods: r.lods, atribuciones: uso.atribuciones, avisos };
}

/** Hook del diálogo: la preparación (memorizada) y una sola generación a la vez. */
export function useGenerar3d(c: Contexto3D, deps: Dependencias3D) {
  const preparado = useMemo(() => prepararGeneracion(c, deps), [c, deps]);
  const [estado, setEstado] = useState<Estado3D>({ fase: "lista" });
  const ocupado = useRef(false);
  const generar = useCallback(async (img: Blob, op: OpcionesGenerar3D) => {
    if (ocupado.current) return;
    ocupado.current = true;
    // Mientras genera, la orbe de la Protomolécula enseña la carga (cubo de Metatrón que se dibuja).
    const conOrbe = (e: Estado3D) => {
      setEstado(e);
      if (e.fase === "generando") avisarOrbe({ estado: "cargando", progreso: e.progreso === null ? undefined : e.progreso / 100, etiqueta: e.etapa });
      if (e.fase === "error") avisarOrbe({ estado: "listo" });
    };
    try { conOrbe(await generar3d(img, op, preparado, c, deps, conOrbe)); }
    catch (e) { conOrbe({ fase: "error", motivo: `Falló la generación: ${e instanceof Error ? e.message : "error desconocido"}.` }); }
    finally { ocupado.current = false; }
  }, [preparado, c, deps]);
  const reiniciar = useCallback(() => setEstado({ fase: "lista" }), []);
  return { preparado, estado, generar, reiniciar };
}
