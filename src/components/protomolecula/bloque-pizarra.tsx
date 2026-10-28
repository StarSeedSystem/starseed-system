"use client";

/**
 * Protomolécula · BLOQUE DE PIZARRA (architecture/protomolecula.md §3.3).
 * La Protomolécula como ventana: panel compacto de la molécula citada y una
 * franja de información (no bloquea) con la convergencia (F2A) y las
 * conversiones (F2B) sobre las aristas de la pizarra.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cargarMolecula, almacenNavegador, type MoleculaGuardada } from "@/lib/protomolecula/almacen-moleculas";
import { rutaDeConversion } from "@/lib/protomolecula/convertidores";
import { analizarConvergencia, type Arista, type AtomoGrafo, type Diagnostico, type RutaDe } from "@/lib/protomolecula/grafo-convergencia";
import { obtenerAtomo } from "@/lib/protomolecula/registro-atomos";
import { PanelProtomoleculaAutonomo } from "./panel-protomolecula";
import { useMolecula } from "./use-molecula";
import type { AristaPizarra, VecinoDePizarra } from "@/lib/canvas/canvas";

/** Id local de ESTA ventana en el grafo; `EstadoArista`, cómo encaja una arista. */
export const ID_PROPIA = "esta";
export interface EstadoArista { nivel: "compatible" | "conversion" | "incompatible" | "pendiente"; texto: string }

/** Herramienta (la primera) citada por una molécula del almacén. */
export function herramientaDeMolecula(moleculaId: string): string | null {
  const almacén = almacenNavegador();
  if (!almacén || !moleculaId) return null;
  const m = cargarMolecula(almacén, moleculaId);
  const idDe = (a: MoleculaGuardada["atomos"][number]): string | null => {
    const id = (a as { herramientaId?: unknown }).herramientaId;
    return typeof id === "string" && id !== "" ? id : null;
  };
  for (const a of m?.atomos ?? []) {
    const id = idDe(a);
    if (id) return id;
  }
  return null;
}

/** Cómo encaja una arista concreta según el diagnóstico de convergencia (F2A). */
export function nivelArista(d: Diagnostico, arista: Arista): EstadoArista {
  const conv = d.conversiones.find((c) => c.arista.de === arista.de && c.arista.a === arista.a);
  if (conv) return { nivel: "conversion", texto: `Conversión: ${conv.ruta.join(" → ")}` };
  const mal = d.incompatibles.find((i) => i.arista.de === arista.de && i.arista.a === arista.a);
  const lista = (fs: string[]): string => (fs.length > 0 ? fs.join(", ") : "sin declarar");
  return mal ? { nivel: "incompatible", texto: `Sin encaje: salidas ${lista(mal.salidas)} / entradas ${lista(mal.entradas)}` } : { nivel: "compatible", texto: "" };
}

export function nivelPara(miHerramienta: string | null, vecino: VecinoDePizarra, d: Diagnostico | null, arista: Arista): EstadoArista {
  if (miHerramienta === null) return { nivel: "pendiente", texto: "esta molécula no tiene herramientas todavía" };
  if (vecino.herramienta === null) return { nivel: "pendiente", texto: "sin formatos declarados todavía" };
  return d ? nivelArista(d, arista) : { nivel: "compatible", texto: "" };
}

/** Bloque de pizarra: panel compacto + franja de dependencias. */
export function BloquePizarraProtomolecula({ moleculaId, aristasEntrantes = [], aristasSalientes = [] }: {
  moleculaId?: string;
  aristasEntrantes?: AristaPizarra[];
  aristasSalientes?: AristaPizarra[];
}) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []); // la franja, solo en cliente (sesión y almacén del navegador)

  // Sesión compartida por recuento de referencias (el panel de abajo abre la misma).
  const { estado } = useMolecula({ moleculaId });
  const miHerramienta = estado?.molecula.atomos.find((a) => typeof a.herramientaId === "string" && a.herramientaId !== "")?.herramientaId ?? null;

  // Convergencia: esta ventana y sus vecinos con herramienta (F2A).
  const diagnostico = useMemo(() => {
    if (miHerramienta === null) return null;
    const atomos: AtomoGrafo[] = [{ id: ID_PROPIA, herramientaId: miHerramienta }];
    for (const a of [...aristasEntrantes, ...aristasSalientes]) {
      if (a.vecino.herramienta && !atomos.some((x) => x.id === a.vecino.id)) atomos.push({ id: a.vecino.id, herramientaId: a.vecino.herramienta });
    }
    const enlaces: Arista[] = [
      ...aristasEntrantes.filter((e) => e.vecino.herramienta).map((e) => ({ de: e.vecino.id, a: ID_PROPIA })),
      ...aristasSalientes.filter((e) => e.vecino.herramienta).map((e) => ({ de: ID_PROPIA, a: e.vecino.id })),
    ];
    if (enlaces.length === 0) return null;
    // La cadena de formatos (F2B) alimenta al grafo: «obj → gltf → glb».
    // La cadena de formatos (F2B) alimenta al grafo: «obj → gltf → glb».
    const rutaDe: RutaDe = (de, a) => {
      const ruta = rutaDeConversion(de, a);
      return ruta ? [de, ...ruta.pasos.map((p) => p.a)] : null;
    };
    return analizarConvergencia(atomos, enlaces, (hid) => obtenerAtomo(hid), rutaDe);
  }, [miHerramienta, aristasEntrantes, aristasSalientes]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanelProtomoleculaAutonomo compacto moleculaId={moleculaId} />
      </div>
      {montado && <FranjaDependencias entrada={aristasEntrantes} salida={aristasSalientes} miHerramienta={miHerramienta} diagnostico={diagnostico} />}
    </div>
  );
}

const CLASE_NIVEL: Record<EstadoArista["nivel"], string> = {
  compatible: "",
  conversion: "rounded border border-amber-400/40 bg-amber-400/10 px-1 text-amber-200",
  incompatible: "rounded border border-red-400/40 bg-red-400/10 px-1 text-red-300",
  pendiente: "text-white/35",
};

/** Franja de información de dependencias (NO bloquea: solo dice cómo encaja). */
function FranjaDependencias({ entrada, salida, miHerramienta, diagnostico }: {
  entrada: AristaPizarra[];
  salida: AristaPizarra[];
  miHerramienta: string | null;
  diagnostico: Diagnostico | null;
}): ReactNode {
  if (entrada.length === 0 && salida.length === 0) return null;
  const filas = [
    ...entrada.map((a) => ({ clave: `r-${a.id}`, etiqueta: "Recibe de", vecino: a.vecino, estado: nivelPara(miHerramienta, a.vecino, diagnostico, { de: a.vecino.id, a: ID_PROPIA }) })),
    ...salida.map((a) => ({ clave: `a-${a.id}`, etiqueta: "Alimenta a", vecino: a.vecino, estado: nivelPara(miHerramienta, a.vecino, diagnostico, { de: ID_PROPIA, a: a.vecino.id }) })),
  ];
  return (
    <ul aria-label="Dependencias de la pizarra" className="space-y-1 rounded-md border border-white/10 bg-white/5 p-1.5 text-[10px]">
      {diagnostico && diagnostico.ciclos.length > 0 && <li className="text-amber-200/80">Hay un ciclo entre las ventanas conectadas: la convergencia espera orden.</li>}
      {filas.map((f) => (
        <li key={f.clave} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-white/55">{f.etiqueta} {f.vecino.titulo}</span>
          {f.estado.texto && <span className={CLASE_NIVEL[f.estado.nivel]}>{f.estado.texto}</span>}
        </li>
      ))}
    </ul>
  );
}
