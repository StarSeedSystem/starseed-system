// Biblioteca de modelos: ramas por proveedor (MOD1116 · MQC3 · 2026-11-17).
// Una rama por proveedor —Ollama, las variantes sin filtros de su publicador (huihui_ai), las capas propias de
// Astraura y los proveedores de API (abliteration.ai…)— con SUS modelos ordenados de MÁS a MENOS capaz, marcando
// el mejor que cabe y el más ligero que cabe en la neurona. Regla de la página de referencia «Find your best
// model» (comprobada el 2026-11-05 por su autor): una neurona SIN tarjeta gráfica (chip «cpu»: Intel u otra sin
// GPU utilizable) recibe como local el modelo MÁS PEQUEÑO que cabe y, además, una línea «un modelo por API es
// mejor punto de partida: aquí corre en CPU y es lento»; con memoria por debajo del mínimo de todos, solo la rama
// de API. Las ramas de API solo se ofrecen si la cuenta permite lo sin filtros (`sin-filtros-nube.ts` no existe:
// el permiso llega como booleano en `opciones.sinFiltrosPermitido`). Módulo PURO y determinista.
import { listableSinFiltros, puntuacionDeBase, recomendable } from "./catalogo";
import { modeloApiValido, type ModeloApi } from "./modelos-api";
import type { PerfilNeurona } from "./perfil-neurona";
import { encajar } from "./recomendar";
import type { ModeloLocal, Veredicto } from "./tipos";

export const NOTA_CPU = "un modelo por API es mejor punto de partida: aquí corre en CPU y es lento";
/** Un modelo dentro de una rama: `veredicto` y `liberarGb` salen de `encajar` y solo van llenos en ramas locales. */
export interface ElementoRama {
  id: string;
  etiqueta: string;
  veredicto: Veredicto | null;
  liberarGb: number | null;
}

/** Una rama de la Biblioteca: el proveedor, sus modelos de MÁS a MENOS capaz y quién cabe en esta neurona. */
export interface Rama {
  proveedor: string;
  /** local = se ejecuta en esta neurona; api = proveedor externo de pago. */
  via: "local" | "api";
  modelos: ElementoRama[];
  /** El más capaz con veredicto «recomendado» o «justo»; null si ninguno cabe o es una rama de API. */
  mejorQueCabe: string | null;
  /** El más pequeño (por descarga) que cabe; null si ninguno cabe o es una rama de API. */
  masLigero: string | null;
  /** Una línea de aviso (hoy, la regla de CPU) o null. */
  nota: string | null;
}
/** `sinFiltrosPermitido`: ¿la cuenta permite lo sin filtros? `instalados`: ya descargados (salta el disco). */
export interface OpcionesRamas {
  sinFiltrosPermitido?: boolean;
  instalados?: ReadonlySet<string>;
}
const CABE = new Set<Veredicto>(["recomendado", "justo"]);
/** De MÁS a MENOS capaz: con puntuación primero (la de la BASE en las variantes; mayor ECI); sin ella, más grande. */
function comparador(todos: readonly ModeloLocal[]): (a: ModeloLocal, b: ModeloLocal) => number {
  const puntos = (m: ModeloLocal) => (m.clase === "abliterated" ? puntuacionDeBase(m, todos) : m.puntuacion);
  return (a, b) => {
    const pa = puntos(a);
    const pb = puntos(b);
    if ((pa === null) !== (pb === null)) return pa ? -1 : 1;
    if (pa && pb && pa.eci !== pb.eci) return pb.eci - pa.eci;
    return b.descargaGb - a.descargaGb || (b.contextoK ?? -1) - (a.contextoK ?? -1) || a.id.localeCompare(b.id);
  };
}

/** Ollama = builds normales comprobadas del editor; huihui_ai = variantes sin filtros listables; capas = las propias. */
function gruposLocales(catalogo: readonly ModeloLocal[], sinFiltros: boolean): { proveedor: string; modelos: ModeloLocal[] }[] {
  const ollama: ModeloLocal[] = [];
  const capas: ModeloLocal[] = [];
  const porPublicador = new Map<string, ModeloLocal[]>();
  for (const m of catalogo) {
    if (m.clase === "abliterated") {
      if (!sinFiltros || !listableSinFiltros(m)) continue;
      const k = m.id.includes("/") ? m.id.split("/")[0] : "huihui_ai";
      porPublicador.set(k, [...(porPublicador.get(k) ?? []), m]);
    } else if (m.tipo !== "estandar") {
      if (m.estado === "comprobado") capas.push(m);
    } else if (recomendable(m)) ollama.push(m);
  }
  const grupos: { proveedor: string; modelos: ModeloLocal[] }[] = [{ proveedor: "Ollama", modelos: ollama }];
  for (const k of [...porPublicador.keys()].sort((a, b) => a.localeCompare(b))) grupos.push({ proveedor: k, modelos: porPublicador.get(k) ?? [] });
  if (capas.length > 0) grupos.push({ proveedor: "Capas de Astraura", modelos: capas });
  return grupos.filter((g) => g.modelos.length > 0);
}

export function ramasPorProveedor(
  catalogo: readonly ModeloLocal[],
  apis: readonly ModeloApi[] | null,
  perfil: PerfilNeurona,
  opciones: OpcionesRamas = {},
): Rama[] {
  const { sinFiltrosPermitido = false, instalados } = opciones;
  const tamDe = new Map(catalogo.map((m) => [m.id, m.descargaGb]));
  const masLigeroQue = (a: ElementoRama, b: ElementoRama): boolean => // empate de tamaño: gana el id menor (orden estable)
    (tamDe.get(a.id) ?? 0) !== (tamDe.get(b.id) ?? 0)
      ? (tamDe.get(a.id) ?? 0) < (tamDe.get(b.id) ?? 0)
      : a.id.localeCompare(b.id) < 0;
  const encajeDe = (m: ModeloLocal): ElementoRama => {
    const e = encajar(m, perfil, instalados?.has(m.id) === true);
    return { id: m.id, etiqueta: m.etiqueta, veredicto: e.veredicto, liberarGb: e.liberarGb };
  };
  const cabe = (x: ElementoRama): boolean => x.veredicto !== null && CABE.has(x.veredicto);
  const ramas: Rama[] = [];
  for (const g of gruposLocales(catalogo, sinFiltrosPermitido)) {
    const modelos = g.modelos.slice().sort(comparador(catalogo)).map(encajeDe);
    const caben = modelos.filter(cabe); // con memoria por debajo del mínimo de todos: la rama local no se muestra
    if (caben.length === 0) continue;
    let ligero = caben[0];
    for (const x of caben) if (masLigeroQue(x, ligero)) ligero = x;
    ramas.push({ proveedor: g.proveedor, via: "local", modelos, mejorQueCabe: caben[0].id, masLigero: ligero.id, nota: null });
  }
  // Regla de CPU: sin tarjeta gráfica, SOLO el modelo más pequeño que cabe (de toda la biblioteca local).
  if (perfil.chip === "cpu" && ramas.length > 0) {
    let elegida: { rama: Rama; x: ElementoRama } | null = null;
    for (const r of ramas) for (const x of r.modelos) if (cabe(x) && (!elegida || masLigeroQue(x, elegida.x))) elegida = { rama: r, x };
    ramas.length = 0;
    if (elegida) ramas.push({ proveedor: elegida.rama.proveedor, via: "local", modelos: [elegida.x], mejorQueCabe: elegida.x.id, masLigero: elegida.x.id, nota: NOTA_CPU });
  }
  if (sinFiltrosPermitido && apis && apis.length > 0) {
    const porProveedor = new Map<string, ModeloApi[]>();
    for (const a of apis) if (modeloApiValido(a)) porProveedor.set(a.proveedor, [...(porProveedor.get(a.proveedor) ?? []), a]);
    for (const proveedor of [...porProveedor.keys()].sort((x, y) => x.localeCompare(y))) {
      const modelos = (porProveedor.get(proveedor) ?? [])
        .sort((a, b) => b.contextoK - a.contextoK || a.precioSalidaUsd - b.precioSalidaUsd || a.id.localeCompare(b.id))
        .map((x): ElementoRama => ({ id: x.id, etiqueta: x.id, veredicto: null, liberarGb: null }));
      ramas.push({ proveedor, via: "api", modelos, mejorQueCabe: null, masLigero: null, nota: null });
    }
  }
  return ramas;
}
