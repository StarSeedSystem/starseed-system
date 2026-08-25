/**
 * genesis-types.ts — CONTRATO ÚNICO de Génesis de Seres.
 *
 * Este fichero es la frontera entre el OS y el backend de Astraura. Si algo no
 * está aquí, no existe para ninguno de los dos lados. Cualquier cambio se hace
 * AQUÍ primero y después en las dos implementaciones — nunca al revés.
 *
 * Un "ser" extiende el agente que la bóveda (`agent_vault_engine`) ya guarda:
 * no sustituye nada. Los campos nuevos son opcionales precisamente para que un
 * backend viejo siga funcionando y la interfaz se degrade sin huecos.
 *
 * ENDPOINTS (los implementa el backend; ninguno más, ninguno menos):
 *   GET    /api/genesis/seres                     → SerListado[]
 *   GET    /api/genesis/seres/{id}                → Ser
 *   POST   /api/genesis/seres                     → { ok, ser }        (crear)
 *   PATCH  /api/genesis/seres/{id}                → { ok, ser }        (configurar)
 *   DELETE /api/genesis/seres/{id}                → { ok }
 *   POST   /api/genesis/seres/{id}/engendrar      → { ok, ser }        (un ser crea otro)
 *   POST   /api/genesis/seres/{id}/adn/recalcular → { ok, adn }
 *   GET    /api/genesis/linaje                    → NodoLinaje[]
 *   GET    /api/genesis/vinculos                  → Vinculo[]
 *   POST   /api/genesis/vinculos                  → { ok, vinculo }
 *   DELETE /api/genesis/vinculos/{id}             → { ok }
 *   GET    /api/genesis/comunidades               → Comunidad[]
 *   POST   /api/genesis/comunidades               → { ok, comunidad }
 *   GET    /api/genesis/espacios                  → Espacio[]
 *   POST   /api/genesis/espacios                  → { ok, espacio }
 *   GET    /api/genesis/modelos                   → ModeloDisponible[]  (escalera económica)
 *   POST   /api/genesis/modelos/verificar         → VerificacionModelo  (¿responde de verdad?)
 *   GET    /api/genesis/propuestas                → Propuesta[]
 *   POST   /api/genesis/propuestas/{id}/aceptar   → { ok }
 *   POST   /api/genesis/propuestas/{id}/descartar → { ok }
 */

import type { RasgosAdn } from "./genesis-dna";

// ─────────────────────────────────────────────────────────── Soberanía

/**
 * Lo que un ser puede hacer sin pedir permiso, y dónde.
 *
 * Alex lo pidió así: "libertad total en carpetas, medios y cerebros asignados y
 * libertad de explorar total con sugerencias en ramas de variantes". De ahí las
 * tres zonas: DOMINIO (escribe libre), EXPLORACIÓN (lee todo lo permitido) y
 * todo lo demás (solo puede proponer, y su propuesta nace como rama variante).
 */
export interface Soberania {
  /** Rutas donde el ser es soberano: crea, edita y borra sin preguntar. */
  dominio: string[];
  /** Rutas que puede leer y estudiar, pero no modificar. */
  exploracion: string[];
  /** Medios (almacenamientos, buckets, discos) bajo su dominio. */
  medios: string[];
  /** Cerebros cuyas memorias puede leer Y escribir. */
  cerebros: string[];
  /** Si false, sus cambios fuera del dominio nacen como propuesta, no como hecho. */
  puedeProponerFuera: boolean;
  /** Prefijo de las ramas variantes que abre para proponer. */
  prefijoRamaVariante: string;
  /** Límites duros que ninguna libertad supera. Vacío = sin límites extra. */
  limitesDuros: string[];
}

// ─────────────────────────────────────────────────────────── Modelos

/** Un modelo que el ser puede usar para pensar. */
export interface ModeloDisponible {
  id: string;
  etiqueta: string;
  /** "openrouter-gratis" | "bitnet-158" | "ollama" | "personalizado" */
  proveedor: string;
  /** Coste por millón de tokens. 0 = gratuito de verdad. */
  costePorMillon: number;
  /** Verificado funcionalmente, no solo listado. */
  verificado: boolean;
  /** Última verificación real (epoch en segundos). */
  verificadoEn?: number | null;
  contexto?: number | null;
  nota?: string | null;
}

/** Resultado de comprobar que un modelo RESPONDE, no solo que existe. */
export interface VerificacionModelo {
  modeloId: string;
  responde: boolean;
  latenciaMs: number | null;
  muestra: string | null;
  error: string | null;
}

/**
 * Escalera de modelos por tarea. Se prueba de arriba abajo hasta que uno
 * responde de verdad. Sin esto, "modelo económico" degenera en "modelo que
 * falla en silencio y devuelve una plantilla".
 */
export interface EnrutadoCognitivo {
  /** Orden de preferencia, del más barato al más capaz. */
  escalera: string[];
  /** Si true, nunca sube a un modelo de pago aunque toda la escalera falle. */
  soloGratuitos: boolean;
  /** Modelo que atendió la última vez, para que se vea qué está pensando. */
  ultimoUsado?: string | null;
  /** Si la última respuesta salió de plantilla en vez de un modelo real. */
  ultimaFueDegradada?: boolean;
}

// ─────────────────────────────────────────────────────────── Linaje y vínculos

export interface Linaje {
  /** Quién lo engendró. null = lo creó el usuario. */
  progenitorId: string | null;
  /** Hijos directos. */
  descendientes: string[];
  /** 0 = primera generación (creada por el usuario). */
  generacion: number;
  /** "usuario" | "agente" */
  origen: "usuario" | "agente";
  /** Familia a la que pertenece el linaje, si tiene nombre. */
  familiaId?: string | null;
}

export type TipoVinculo =
  | "mentor" | "aprendiz" | "pareja" | "rival" | "aliado"
  | "delegacion" | "supervision" | "hermandad";

export interface Vinculo {
  id: string;
  origenId: string;
  destinoId: string;
  tipo: TipoVinculo;
  /** 0–1: cuánto pesa este vínculo al orquestar. */
  fuerza: number;
  bidireccional: boolean;
  /** Por qué existe; lo escribe quien lo crea (usuario o ser). */
  motivo?: string | null;
  creadoEn: number;
}

export interface Comunidad {
  id: string;
  nombre: string;
  proposito: string;
  miembros: string[];
  /** Espacio 3D donde se reúne, si lo tiene. */
  espacioId?: string | null;
  color?: string | null;
  creadaEn: number;
}

// ─────────────────────────────────────────────────────────── Espacios 3D

export interface Espacio {
  id: string;
  nombre: string;
  /** Quién lo construyó: un ser, o el usuario. */
  constructorId: string | null;
  /** "taller" | "agora" | "biblioteca" | "jardin" | "laboratorio" | libre */
  arquetipo: string;
  /** Semilla determinista de la geometría del entorno. */
  semilla: number;
  /** Seres que lo habitan ahora mismo. */
  habitantes: string[];
  /** Objetos/herramientas 3D colocados dentro. */
  objetos: ObjetoEspacio[];
  creadoEn: number;
}

export interface ObjetoEspacio {
  id: string;
  tipo: string;
  etiqueta: string;
  posicion: [number, number, number];
  /** Herramienta real que este objeto representa, si representa alguna. */
  herramientaId?: string | null;
}

// ─────────────────────────────────────────────────────────── Propuestas

/** Trabajo que un ser hizo fuera de su dominio y espera tu sí. */
export interface Propuesta {
  id: string;
  serId: string;
  titulo: string;
  descripcion: string;
  /** Rama variante donde vive el trabajo. */
  rama: string;
  /** Ficheros tocados, con su diff cuando lo hay. */
  cambios: { ruta: string; diff?: string | null; lineas?: number | null }[];
  estado: "pendiente" | "aceptada" | "descartada";
  creadaEn: number;
}

// ─────────────────────────────────────────────────────────── El ser

export interface Ser {
  id: string;
  nombre: string;
  rol: string;
  /** Frase con la que el ser se describe a sí mismo. */
  esencia?: string | null;
  color?: string | null;
  estado: "activo" | "durmiendo" | "suspendido";

  /** Rasgos del cuerpo. Los deriva `derivarAdn`; se guardan para no recalcular. */
  adn?: RasgosAdn | null;
  /** Ajustes que el usuario (o el propio ser) hizo encima del ADN derivado. */
  adnAjustes?: Partial<RasgosAdn> | null;

  personalidades: { id: string; nombre: string; color?: string | null; rol?: string | null }[];
  cerebros: { id: string; nombre: string; color?: string | null }[];
  habilidades: string[];
  herramientas: string[];
  /** Reglas que el ser se compromete a seguir, en su idioma. */
  reglas: string[];

  soberania: Soberania;
  enrutado: EnrutadoCognitivo;
  linaje: Linaje;
  comunidades: string[];
  espacioHogarId?: string | null;

  /** Imaginación de fondo: si piensa por su cuenta y cada cuánto. */
  imaginacion: { activa: boolean; frecuencia: string; nivelPermiso: string };
  /** Cuotas reales de máquina. */
  recursos: { concurrencia: number; cpuPorcentaje: number; ramMb: number };

  /** Ciclos, tareas y recuerdos acumulados; alimenta la evolución del cuerpo. */
  experiencia: number;
  creadoEn: number;
  actualizadoEn: number;
}

/** Versión ligera para listados y para el mundo 3D. */
export interface SerListado {
  id: string;
  nombre: string;
  rol: string;
  estado: Ser["estado"];
  color?: string | null;
  adn?: RasgosAdn | null;
  generacion: number;
  comunidades: string[];
  experiencia: number;
}

export interface NodoLinaje {
  id: string;
  nombre: string;
  progenitorId: string | null;
  generacion: number;
  familiaId?: string | null;
}

/** Lo mínimo para engendrar un ser. Todo lo demás tiene valor por defecto. */
export interface SolicitudGenesis {
  nombre: string;
  rol?: string;
  esencia?: string;
  arquetipo?: string;
  color?: string;
  personalidades?: string[];
  cerebros?: string[];
  habilidades?: string[];
  herramientas?: string[];
  reglas?: string[];
  soberania?: Partial<Soberania>;
  enrutado?: Partial<EnrutadoCognitivo>;
  /** Si lo engendra otro ser, su id. */
  progenitorId?: string | null;
}

/** Soberanía por defecto: libre en lo suyo, curioso en todo, prudente fuera. */
export const SOBERANIA_POR_DEFECTO: Soberania = {
  dominio: [],
  exploracion: [],
  medios: [],
  cerebros: [],
  puedeProponerFuera: true,
  prefijoRamaVariante: "variante/",
  limitesDuros: [],
};

/** Escalera por defecto: primero lo gratuito, luego lo local, nunca lo caro. */
export const ENRUTADO_POR_DEFECTO: EnrutadoCognitivo = {
  escalera: ["openrouter/free", "bitnet-158-local"],
  soloGratuitos: true,
  ultimoUsado: null,
  ultimaFueDegradada: false,
};
