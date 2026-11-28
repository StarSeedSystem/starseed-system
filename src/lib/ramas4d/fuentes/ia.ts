import type { Observador } from "../alcance";
import type { Arista, Nodo } from "../modelo";
import type { Fuente } from "./tipos";

export interface BotEntrada {
  id: string;
  nombre: string;
  dueno: { tipo: string; id: string; cuentaId: string };
  origen: string;
  gobierno: string;
  personalidad: { calidez: number; energia: number; formalidad: number; curiosidad: number; humor: number; concision: number };
  cuerpo: { forma: string; tono: number; escala: number };
  sentidosHabilitados: string[];
  activo: boolean;
}

export interface RecursoEntrada {
  id: string;
  tipo: string;
  origen: string;
  nombre: string;
  descripcion: string;
  etiquetas: string[];
  requiere: string[];
  ruta?: string;
}

export interface DatosIa {
  bots?: BotEntrada[];
  recursos?: RecursoEntrada[];
}

function alcanceBot(bot: BotEntrada): Nodo["alcance"] {
  if (bot.dueno.tipo === "perfil") return "privado";
  if (bot.dueno.tipo === "grupo") return "grupo";
  if (bot.dueno.tipo === "comunidad") return "comunidad";
  return "publico";
}

export function botANodo(bot: BotEntrada): Nodo {
  const t = Date.now();
  return {
    id: `bot:${bot.id}`,
    tipo: bot.origen === "astraura" ? "agente" : "bot",
    titulo: bot.nombre,
    formato: "app",
    ref: `/agentes/bots/${encodeURIComponent(bot.id)}`,
    alcance: alcanceBot(bot),
    dueno: bot.dueno.cuentaId || bot.dueno.id,
    capas: ["ia", "astraura", bot.origen],
    t_creado: t,
    t_actividad: t,
    peso: bot.activo ? 1 : 0.4,
    tema: "inteligencia artificial",
    categoria: bot.origen,
    etiquetas: [bot.origen, bot.gobierno, bot.activo ? "activo" : "pausado"],
  };
}

export function recursoANodo(recurso: RecursoEntrada): Nodo {
  const t = Date.now();
  const tipoNodo = recurso.tipo === "conexion" || recurso.tipo === "mcp" ? "conector" : "habilidad";
  return {
    id: `recurso:${recurso.id}`,
    tipo: tipoNodo,
    titulo: recurso.nombre,
    formato: "enlace",
    ref: recurso.ruta ? `/taller/${encodeURIComponent(recurso.id)}` : `/agentes/recursos/${encodeURIComponent(recurso.id)}`,
    alcance: "publico",
    dueno: "sistema",
    capas: ["ia", "taller", recurso.tipo],
    t_creado: t,
    t_actividad: t,
    peso: 0.7,
    tema: "taller de agentes",
    categoria: recurso.tipo,
    etiquetas: [...recurso.etiquetas.slice(0, 5), recurso.origen],
  };
}

function construirDatosSimulados(): DatosIa {
  return {
    bots: [
      {
        id: "astraura:demo",
        nombre: "Astraura",
        dueno: { tipo: "perfil", id: "demo", cuentaId: "demo" },
        origen: "astraura",
        gobierno: "jerarquico",
        personalidad: { calidez: 0.7, energia: 0.55, formalidad: 0.4, curiosidad: 0.7, humor: 0.4, concision: 0.5 },
        cuerpo: { forma: "orbe", tono: 200, escala: 1 },
        sentidosHabilitados: ["pantalla", "red"],
        activo: true,
      },
    ],
    recursos: [
      { id: "os:claude-en-chrome", tipo: "herramienta", origen: "os", nombre: "Claude en Chrome", descripcion: "Extensión", etiquetas: ["navegador"], requiere: [] },
      { id: "os:genesis-mcp-progresivo", tipo: "mcp", origen: "os", nombre: "MCP Genesis", descripcion: "Descubrimiento progresivo", etiquetas: ["mcp"], requiere: [] },
    ],
  };
}

export function crearFuenteIa(datos?: DatosIa): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();
  const emitir = (tipo: string, datos: unknown): void => {
    for (const cb of suscriptores) { try { cb({ tipo, datos }); } catch { /* silencioso */ } }
  };
  return {
    id: "ia",
    capa: "ia",
    leer: async (_observador: Observador) => {
      const fuente = datos ?? construirDatosSimulados();
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];
      const ahora = Date.now();
      for (const bot of fuente.bots ?? []) nodos.set(`bot:${bot.id}`, botANodo(bot));
      for (const recurso of fuente.recursos ?? []) nodos.set(`recurso:${recurso.id}`, recursoANodo(recurso));
      for (const bot of fuente.bots ?? []) {
        for (const recurso of fuente.recursos ?? []) {
          if (bot.activo && nodos.has(`recurso:${recurso.id}`)) {
            aristas.push({ de: `bot:${bot.id}`, a: `recurso:${recurso.id}`, tipo: "usa", t: ahora, intensidad: 0.5 });
          }
        }
      }
      emitir("fuente_leida", { fuenteId: "ia", nodos: nodos.size, aristas: aristas.length });
      return { nodos, aristas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => { suscriptores.delete(callback); };
    },
  };
}

export const fuenteIa = crearFuenteIa();
