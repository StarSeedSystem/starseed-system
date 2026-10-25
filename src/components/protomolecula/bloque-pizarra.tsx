"use client";
/* Protomolécula · BLOQUE DE PIZARRA (motor «starseed», §3.3.4 y §5): cita su molécula
 * (data: solo {moleculaId}, Entidad Única), monta PanelProtomoleculaAutonomo compacto
 * y, debajo, la franja de convergencia (F2A con F2B). Informativa, no bloquea. */
import { cargarMolecula, almacenNavegador } from "@/lib/protomolecula/almacen-moleculas";
import { esMoleculaValidaNucleo } from "@/lib/protomolecula/bloque-protomolecula";
import { rutaDeConversion } from "@/lib/protomolecula/convertidores";
import { analizarConvergencia, type Arista, type Diagnostico, type RutaDe } from "@/lib/protomolecula/grafo-convergencia";
import { obtenerAtomo, type DefinicionAtomo } from "@/lib/protomolecula/registro-atomos";
import { PanelProtomoleculaAutonomo } from "./panel-protomolecula";
import { useMolecula } from "./use-molecula";

export interface LadoArista {
  id: string; otro: string; titulo: string; // id de la arista, id y título del vecino
  moleculaId?: string; // molécula citada si el vecino es otra ventana protomolécula
  formatos?: string[]; // formatos deducibles del vecino (extensión de su archivo)
}
/** Un lado de las aristas del tablero respecto del bloque: quién me atiende y a quién atiendo. */
export function ladosArista(
  edges: { id: string; from: string; to: string }[],
  bloques: { id: string; title?: string; kind?: string; data?: Record<string, unknown> }[],
  bloqueId: string,
): { entrantes: LadoArista[]; salientes: LadoArista[] } {
  const lado = (e: { id: string; from: string; to: string }): LadoArista => {
    const vecino = e.from === bloqueId ? e.to : e.from;
    const vb = bloques.find((b) => b.id === vecino);
    const crudo = vb?.data?.fileName ?? vb?.data?.url; // extensión de fileName/url → formato
    const cola = typeof crudo === "string" ? crudo.split("#")[0].split("?")[0].split("/").pop() ?? "" : "";
    const formato = (cola.lastIndexOf(".") > 0 ? cola.slice(cola.lastIndexOf(".") + 1) : "").trim().toLowerCase();
    return {
      id: e.id, otro: vecino, titulo: vb?.title?.trim() || vecino,
      moleculaId: vb?.kind === "protomolecula" ? String((vb.data as { moleculaId?: unknown } | undefined)?.moleculaId ?? "") || undefined : undefined,
      formatos: formato.length > 0 ? [formato] : undefined,
    };
  };
  const junto = (dir: "from" | "to"): LadoArista[] => edges.filter((e) => e[dir] === bloqueId).map(lado);
  return { entrantes: junto("to"), salientes: junto("from") };
}
interface Firma { entradas: string[]; salidas: string[] }
interface VentanaGrafo { id: string; titulo: string; firma: Firma }
/** Unión de entradas/salidas de las herramientas REGISTRADAS de una lista. */
export function firmaDeHerramientas(herramientas: string[]): Firma {
  const unir = (lado: "entradas" | "salidas"): string[] => [...new Set(herramientas.flatMap((h) => obtenerAtomo(h)?.[lado] ?? []))];
  return { entradas: unir("entradas"), salidas: unir("salidas") };
}
/** Firma de una ventana vecina protomolécula: lee SU molécula del almacén; si es antigua o no existe, firma vacía (no se inventan formatos). */
function firmaVecina(id: string): Firma {
  const almacen = almacenNavegador();
  if (!id || !almacen) return { entradas: [], salidas: [] };
  const m = cargarMolecula(almacen, id);
  return m && esMoleculaValidaNucleo(m)
    ? firmaDeHerramientas(m.atomos.filter((a) => a.estado === "activo").map((a) => a.herramientaId))
    : { entradas: [], salidas: [] };
}
/** El F2A sobre el grafo DE VENTANAS: definición sintética por ventana (unión de los formatos de sus herramientas), sin tocar el registro global. */
export function analizarVentanas(ventanas: VentanaGrafo[], aristas: Arista[]): Diagnostico {
  const definicion = (herramientaId: string): DefinicionAtomo | undefined => {
    const v = ventanas.find((p) => p.id === herramientaId);
    if (!v) return obtenerAtomo(herramientaId);
    return {
      herramientaId: v.id, nombre: v.titulo || "Ventana", categoria: "codigo", integracion: "libreria-js",
      control: "ninguno", parametros: [], entradas: v.firma.entradas, salidas: v.firma.salidas,
    };
  };
  const rutaParaGrafo: RutaDe = (de, a) => {
    const r = rutaDeConversion(de, a);
    return r && r.pasos.length > 0 ? [r.pasos[0].de, ...r.pasos.map((p) => p.a)] : null;
  };
  return analizarConvergencia(ventanas.map((v) => ({ id: v.id, herramientaId: v.id })), aristas, definicion, rutaParaGrafo);
}
/** Nota de UNA arista según el diagnóstico; vacía si encaja directa. */
export function notaLado(l: LadoArista, d: Diagnostico, esEntrante: boolean): string {
  const de = esEntrante ? l.otro : "yo", a = esEntrante ? "yo" : l.otro;
  const ruta = d.conversiones.find((c) => c.arista.de === de && c.arista.a === a)?.ruta;
  if (ruta) return `· necesita conversión: ${ruta.map((f) => (f === "glb" || f === "gltf" ? "glTF" : f.toUpperCase())).join(" → ")}`;
  const inc = d.incompatibles.find((c) => c.arista.de === de && c.arista.a === a);
  if (!inc) return "";
  const [mios, delVecino] = esEntrante ? [inc.entradas, inc.salidas] : [inc.salidas, inc.entradas];
  if (delVecino.length === 0) return `· no sé qué ${esEntrante ? "produce" : "recibe"} (su herramienta no está registrada)`;
  if (mios.length === 0) return `· esta ventana aún no ${esEntrante ? "recibe" : "produce"} archivos: añade una herramienta`;
  return `· sin conversor de ${inc.salidas.join(", ")} a ${inc.entradas.join(", ")}`;
}
/** Diagnóstico de convergencia de esta ventana: su firma + la de sus vecinos (extensión de archivo o molécula guardada), alrededor del F2A. */
export function diagnosticoVentana(herramientas: string[], aristasEntrantes: LadoArista[], aristasSalientes: LadoArista[]): Diagnostico {
  const ventanas = new Map<string, VentanaGrafo>([["yo", { id: "yo", titulo: "Esta ventana", firma: firmaDeHerramientas(herramientas) }]]);
  for (const l of [...aristasEntrantes, ...aristasSalientes]) {
    if (!ventanas.has(l.otro)) ventanas.set(l.otro, { id: l.otro, titulo: l.titulo, firma: l.moleculaId ? firmaVecina(l.moleculaId) : { entradas: [], salidas: [...(l.formatos ?? [])] } });
  }
  return analizarVentanas(
    [...ventanas.values()],
    [...aristasEntrantes.map((l): Arista => ({ de: l.otro, a: "yo" })), ...aristasSalientes.map((l): Arista => ({ de: "yo", a: l.otro }))],
  );
}
export function BloquePizarraProtomolecula({ moleculaId, aristasEntrantes, aristasSalientes }: {
  moleculaId: string; // vacío = la última abierta, la más reciente o una nueva
  aristasEntrantes: LadoArista[];
  aristasSalientes: LadoArista[];
}) {
  const { estado } = useMolecula({ moleculaId: moleculaId || undefined });
  const propias = (estado?.molecula.atomos ?? []).filter((a) => a.estado === "activo").map((a) => a.herramientaId);
  const diagnostico = diagnosticoVentana(propias, aristasEntrantes, aristasSalientes);
  const lados: [string, LadoArista, boolean][] = [
    ...aristasEntrantes.map((l): [string, LadoArista, boolean] => ["Recibe de", l, true]),
    ...aristasSalientes.map((l): [string, LadoArista, boolean] => ["Alimenta a", l, false]),
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="min-h-0 flex-1"><PanelProtomoleculaAutonomo compacto moleculaId={moleculaId || undefined} /></div>
      <aside className="shrink-0 rounded-md border border-white/10 bg-black/40 p-1.5 text-[10px] leading-snug text-white/60">
        <p className="mb-0.5 font-medium text-fuchsia-200/80">Convergencia</p>
        {lados.length === 0 && (
          <p>Sin conexiones: usa «Conectar» para unir esta ventana con otras y hacer converger sus salidas.</p>
        )}
        {lados.map(([texto, l, entrar]) => (
          <p key={`${entrar ? "in" : "out"}-${l.id}`}>{texto} <span className="text-white/85">{l.titulo}</span> {notaLado(l, diagnostico, entrar)}</p>
        ))}
      </aside>
    </div>
  );
}
