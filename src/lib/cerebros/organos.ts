/**
 * organos — Modelo puro y persistencia de ÓRGANOS del Cerebro (2026-11-27).
 * ═══════════════════════════════════════════════════════════════════════════
 * Permite categorizar y agrupar neuronas, aparatos, nodos privados/públicos y
 * agentes/bots como «órganos» funcionales con cualidades configurables y
 * representación en formatos 2D, 3D y 4D vivo.
 *
 * Puro en sus transformaciones (sin red ni `node:*`), con helpers SSR-safe de
 * almacenamiento local (`starseed.cerebros.organos.v1`). Nunca lanza.
 */

import { aparatosDe, colorAparatoDe, idUnicoPorDefecto } from "@/lib/neurons/aparatos-de-neurona";
import type { Neuron } from "@/lib/neurons/neurons";
import type { Brain } from "@/lib/brains/brains";

export type CategoriaOrgano =
  | "computo"
  | "memoria"
  | "sensorial"
  | "comunicacion"
  | "agentes"
  | "publico"
  | "personalizado";

export type VisibilidadOrgano = "privado" | "comunidad" | "publico";

export type FormatoVisualOrgano = "2d" | "3d" | "4d";

export type ValorCualidadOrgano = boolean | string | number;

export interface OrganoCerebro {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: CategoriaOrgano;
  color: string;
  visibilidad: VisibilidadOrgano;
  formatoVista: FormatoVisualOrgano;
  neuronasIds: string[];
  nodosIds: string[];
  agentesIds: string[];
  capasActivas: string[];
  cualidades: Record<string, ValorCualidadOrgano>;
  creadoEn: number;
  actualizadoEn: number;
}

export const CLAVE_ORGANOS_CEREBRO = "starseed.cerebros.organos.v1";
export const EVENTO_ORGANOS_CEREBRO = "starseed:cerebros-organos";

export const CATEGORIAS_ORGANO: ReadonlyArray<{
  id: CategoriaOrgano;
  etiqueta: string;
  descripcion: string;
  colorPorDefecto: string;
}> = [
  { id: "computo", etiqueta: "Cómputo e IA", descripcion: "Ejecución de modelos locales, inferencia y procesamiento distribuido.", colorPorDefecto: "#38bdf8" },
  { id: "memoria", etiqueta: "Memoria y archivo", descripcion: "Almacenamiento persistente, cápsulas Memvid, CasaOS y réplicas.", colorPorDefecto: "#a855f7" },
  { id: "sensorial", etiqueta: "Sensorial y señales", descripcion: "Antenas LoRa, Wi-Fi, BLE, cámaras, micrófonos y radar.", colorPorDefecto: "#34d399" },
  { id: "comunicacion", etiqueta: "Comunicación y malla", descripcion: "Puentes P2P, relés, canales y control remoto multi-aparato.", colorPorDefecto: "#fbbf24" },
  { id: "agentes", etiqueta: "Agentes y bots", descripcion: "Trabajadores autónomos, Astraura, Hermes y procesos activos.", colorPorDefecto: "#f472b6" },
  { id: "publico", etiqueta: "Público / comunitario", descripcion: "Nodos y cerebros públicos administrados o compartidos en comunidad.", colorPorDefecto: "#22c55e" },
  { id: "personalizado", etiqueta: "Personalizado", descripcion: "Órgano libre con cualidades y reglas a medida.", colorPorDefecto: "#f97316" },
];

export const CAPAS_ORGANO_DISPONIBLES: ReadonlyArray<{ id: string; etiqueta: string }> = [
  { id: "organos", etiqueta: "Órganos" },
  { id: "neuronas", etiqueta: "Neuronas y aparatos" },
  { id: "nodos", etiqueta: "Nodos privados y públicos" },
  { id: "agentes", etiqueta: "Agentes y bots" },
  { id: "procesos", etiqueta: "Procesos activos" },
  { id: "senales", etiqueta: "Señales y antenas" },
];

export interface EntradaCrearOrgano {
  nombre: string;
  descripcion?: string;
  categoria?: CategoriaOrgano;
  color?: string;
  visibilidad?: VisibilidadOrgano;
  formatoVista?: FormatoVisualOrgano;
  neuronasIds?: string[];
  nodosIds?: string[];
  agentesIds?: string[];
  capasActivas?: string[];
  cualidades?: Record<string, ValorCualidadOrgano>;
}

function nuevoIdOrgano(ahora: number): string {
  try {
    return `org-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `org-${ahora.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

export function categoriaMeta(categoria: CategoriaOrgano) {
  return CATEGORIAS_ORGANO.find((c) => c.id === categoria) ?? CATEGORIAS_ORGANO[0];
}

export function crearOrgano(entrada: EntradaCrearOrgano, ahora: number = Date.now()): OrganoCerebro {
  const categoria = entrada.categoria ?? "computo";
  const meta = categoriaMeta(categoria);
  const nombre = entrada.nombre.replace(/\s+/g, " ").trim().slice(0, 60) || "Órgano sin nombre";
  return {
    id: nuevoIdOrgano(ahora),
    nombre,
    descripcion: (entrada.descripcion ?? "").trim().slice(0, 200) || meta.descripcion,
    categoria,
    color: /^#[0-9a-f]{6}$/i.test(entrada.color ?? "") ? (entrada.color as string).toLowerCase() : meta.colorPorDefecto,
    visibilidad: entrada.visibilidad ?? (categoria === "publico" ? "publico" : "privado"),
    formatoVista: entrada.formatoVista ?? "3d",
    neuronasIds: Array.from(new Set(entrada.neuronasIds ?? [])),
    nodosIds: Array.from(new Set(entrada.nodosIds ?? [])),
    agentesIds: Array.from(new Set(entrada.agentesIds ?? [])),
    capasActivas: entrada.capasActivas?.length ? Array.from(new Set(entrada.capasActivas)) : CAPAS_ORGANO_DISPONIBLES.map((c) => c.id),
    cualidades: {
      prioridad: "equilibrada",
      autoEnrutar: true,
      sincroniaP2P: true,
      ...(entrada.cualidades ?? {}),
    },
    creadoEn: ahora,
    actualizadoEn: ahora,
  };
}

export function actualizarOrgano(
  lista: readonly OrganoCerebro[],
  id: string,
  parche: Partial<Omit<OrganoCerebro, "id" | "creadoEn">>,
  ahora: number = Date.now(),
): OrganoCerebro[] {
  return lista.map((o) => {
    if (o.id !== id) return o;
    return {
      ...o,
      ...parche,
      nombre: typeof parche.nombre === "string" ? (parche.nombre.trim().slice(0, 60) || o.nombre) : o.nombre,
      neuronasIds: parche.neuronasIds ? Array.from(new Set(parche.neuronasIds)) : o.neuronasIds,
      nodosIds: parche.nodosIds ? Array.from(new Set(parche.nodosIds)) : o.nodosIds,
      agentesIds: parche.agentesIds ? Array.from(new Set(parche.agentesIds)) : o.agentesIds,
      capasActivas: parche.capasActivas ? Array.from(new Set(parche.capasActivas)) : o.capasActivas,
      cualidades: parche.cualidades ? { ...o.cualidades, ...parche.cualidades } : o.cualidades,
      actualizadoEn: ahora,
    };
  });
}

export function eliminarOrgano(lista: readonly OrganoCerebro[], id: string): OrganoCerebro[] {
  return lista.filter((o) => o.id !== id);
}

export function alternarNeuronaEnOrgano(
  lista: readonly OrganoCerebro[],
  organoId: string,
  neuronaId: string,
  ahora: number = Date.now(),
): OrganoCerebro[] {
  return lista.map((o) => {
    if (o.id !== organoId) return o;
    const existe = o.neuronasIds.includes(neuronaId);
    const neuronasIds = existe ? o.neuronasIds.filter((id) => id !== neuronaId) : [...o.neuronasIds, neuronaId];
    return { ...o, neuronasIds, actualizadoEn: ahora };
  });
}

export function leerOrganosGuardados(): OrganoCerebro[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CLAVE_ORGANOS_CEREBRO);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is OrganoCerebro => Boolean(x && typeof (x as OrganoCerebro).id === "string" && typeof (x as OrganoCerebro).nombre === "string"));
  } catch {
    return [];
  }
}

export function guardarOrganos(organos: readonly OrganoCerebro[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CLAVE_ORGANOS_CEREBRO, JSON.stringify(organos));
    window.dispatchEvent(new CustomEvent(EVENTO_ORGANOS_CEREBRO));
  } catch {
    /* almacenamiento bloqueado */
  }
}

/* ────────────────── Modelo visual 2D / 3D / 4D vivo ────────────────── */

export type TipoNodoCerebroVisual = "organo" | "neurona" | "aparato" | "cerebro" | "agente" | "proceso" | "senal";

export interface NodoCerebroVisual {
  id: string;
  tipo: TipoNodoCerebroVisual;
  titulo: string;
  subtitulo?: string;
  color: string;
  visibilidad: VisibilidadOrgano;
  activo: boolean;
  /** Coordenadas base normalizadas [-1..1] para 2D/3D/4D. */
  x: number;
  y: number;
  z: number;
  pulso: number;
  organoId?: string;
}

export interface AristaCerebroVisual {
  de: string;
  a: string;
  capa: string;
  intensidad: number;
  color: string;
}

export interface GrafoCerebroOrganos {
  nodos: NodoCerebroVisual[];
  aristas: AristaCerebroVisual[];
}

export interface EntradaGrafoOrganos {
  organos: readonly OrganoCerebro[];
  neuronas: readonly Neuron[];
  cerebros: readonly Brain[];
  capasVisibles?: readonly string[];
  soloPublicos?: boolean;
  agentesNombres?: readonly string[];
  procesosNombres?: readonly string[];
}

/** Construye un grafo unificado 2D/3D/4D de órganos, neuronas, aparatos, cerebros, agentes y señales. Pura. */
export function construirGrafoOrganos(e: EntradaGrafoOrganos): GrafoCerebroOrganos {
  const capas = new Set(e.capasVisibles?.length ? e.capasVisibles : CAPAS_ORGANO_DISPONIBLES.map((c) => c.id));
  const nodos: NodoCerebroVisual[] = [];
  const aristas: AristaCerebroVisual[] = [];
  const ids = new Set<string>();

  const pushNodo = (n: NodoCerebroVisual) => {
    if (ids.has(n.id)) return;
    if (e.soloPublicos && n.visibilidad === "privado") return;
    ids.add(n.id);
    nodos.push(n);
  };

  const organosFiltrados = e.soloPublicos ? e.organos.filter((o) => o.visibilidad !== "privado") : e.organos;

  if (capas.has("organos")) {
    const totalOrg = Math.max(1, organosFiltrados.length);
    organosFiltrados.forEach((o, i) => {
      const ang = (i / totalOrg) * Math.PI * 2;
      pushNodo({
        id: `org:${o.id}`,
        tipo: "organo",
        titulo: o.nombre,
        subtitulo: `${o.categoria} · ${o.visibilidad}`,
        color: o.color,
        visibilidad: o.visibilidad,
        activo: true,
        x: Math.cos(ang) * 0.48,
        y: Math.sin(ang) * 0.42,
        z: ((i % 3) - 1) * 0.35,
        pulso: 1,
        organoId: o.id,
      });
    });
  }

  if (capas.has("nodos")) {
    const totalC = Math.max(1, e.cerebros.length);
    e.cerebros.forEach((b, i) => {
      const vis: VisibilidadOrgano = b.scope === "account" ? "privado" : b.scope === "group" ? "comunidad" : "publico";
      const ang = (i / totalC) * Math.PI * 2 + 0.3;
      pushNodo({
        id: `cer:${b.id}`,
        tipo: "cerebro",
        titulo: b.name,
        subtitulo: vis === "privado" ? "Cerebro privado" : "Cerebro público / compartido",
        color: vis === "privado" ? "#22d3ee" : "#34d399",
        visibilidad: vis,
        activo: true,
        x: Math.cos(ang) * 0.25,
        y: Math.sin(ang) * 0.25,
        z: 0.45,
        pulso: 0.85,
      });
    });
  }

  if (capas.has("neuronas")) {
    const totalN = Math.max(1, e.neuronas.length);
    e.neuronas.forEach((n, i) => {
      const org = e.organos.find((o) => o.neuronasIds.includes(n.id));
      const aps = aparatosDe(n.capabilities);
      const col = aps[0] ? colorAparatoDe(aps[0]) : "#38bdf8";
      const ang = (i / totalN) * Math.PI * 2 + 0.7;
      const r = org ? 0.72 : 0.82;
      const vis: VisibilidadOrgano = n.settings?.offerPublicInternet || org?.visibilidad === "publico" ? "publico" : "privado";
      const nNodeId = `neu:${n.id}`;
      pushNodo({
        id: nNodeId,
        tipo: "neurona",
        titulo: n.name,
        subtitulo: aps[0] ? `${aps[0].nombre} (@${aps[0].idUnico || idUnicoPorDefecto(aps[0])})` : n.kind,
        color: col,
        visibilidad: vis,
        activo: !!n.online,
        x: Math.cos(ang) * r,
        y: Math.sin(ang) * r,
        z: n.isThisDevice ? 0.25 : ((i % 5) - 2) * 0.22,
        pulso: n.online ? 1 : 0.35,
        organoId: org?.id,
      });
      if (org && ids.has(`org:${org.id}`)) {
        aristas.push({ de: `org:${org.id}`, a: nNodeId, capa: "organo", intensidad: n.online ? 0.95 : 0.45, color: org.color });
      }
      if (capas.has("nodos") && e.cerebros[0] && ids.has(`cer:${e.cerebros[0].id}`)) {
        aristas.push({ de: `cer:${e.cerebros[0].id}`, a: nNodeId, capa: "cerebro", intensidad: 0.65, color: "#38bdf8" });
      }
      if (capas.has("senales")) {
        aps.forEach((ap, ai) => {
          const apNodeId = `ap:${n.id}:${ap.id}`;
          const aAng = ang + (ai + 1) * 0.24;
          pushNodo({
            id: apNodeId,
            tipo: "aparato",
            titulo: `@${ap.idUnico || idUnicoPorDefecto(ap)}`,
            subtitulo: `${ap.nombre} · ${ap.medio || "medio"}`,
            color: colorAparatoDe(ap),
            visibilidad: vis,
            activo: !!n.online,
            x: Math.cos(aAng) * Math.min(0.96, r + 0.14),
            y: Math.sin(aAng) * Math.min(0.96, r + 0.14),
            z: -0.25 + ai * 0.15,
            pulso: 0.9,
          });
          aristas.push({ de: nNodeId, a: apNodeId, capa: "senales", intensidad: 0.8, color: colorAparatoDe(ap) });
        });
      }
    });
  }

  if (capas.has("agentes")) {
    const agentes = e.agentesNombres?.length ? e.agentesNombres : ["Astraura", "Hermes", "Exocórtex"];
    agentes.forEach((ag, i) => {
      const ang = (i / Math.max(1, agentes.length)) * Math.PI * 2 + 1.2;
      const agId = `ag:${ag}`;
      pushNodo({
        id: agId,
        tipo: "agente",
        titulo: ag,
        subtitulo: "Agente / bot conectado",
        color: "#f472b6",
        visibilidad: "privado",
        activo: true,
        x: Math.cos(ang) * 0.34,
        y: Math.sin(ang) * 0.34,
        z: 0.65,
        pulso: 0.95,
      });
      if (e.neuronas[0] && ids.has(`neu:${e.neuronas[0].id}`)) {
        aristas.push({ de: agId, a: `neu:${e.neuronas[0].id}`, capa: "agentes", intensidad: 0.75, color: "#f472b6" });
      }
    });
  }

  if (capas.has("procesos") && e.procesosNombres?.length) {
    e.procesosNombres.slice(0, 6).forEach((pr, i) => {
      const ang = (i / Math.max(1, e.procesosNombres!.length)) * Math.PI * 2 + 2.1;
      const prId = `proc:${i}:${pr}`;
      pushNodo({
        id: prId,
        tipo: "proceso",
        titulo: pr,
        subtitulo: "Proceso vivo",
        color: "#fbbf24",
        visibilidad: "privado",
        activo: true,
        x: Math.cos(ang) * 0.6,
        y: Math.sin(ang) * 0.6,
        z: -0.5,
        pulso: 0.9,
      });
      if (e.neuronas[0] && ids.has(`neu:${e.neuronas[0].id}`)) {
        aristas.push({ de: `neu:${e.neuronas[0].id}`, a: prId, capa: "procesos", intensidad: 0.6, color: "#fbbf24" });
      }
    });
  }

  return { nodos, aristas };
}
