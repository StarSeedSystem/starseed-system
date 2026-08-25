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

  /** Acceso a internet y herramientas. Ausente = nunca se le concedió. */
  internet?: CapacidadInternet | null;
  /** De dónde salió su cuerpo. Ausente = procedural, el de siempre. */
  avatarFuente?: FuenteAvatar | null;
  /** Sus cerebros con enrutado y sincronización. Complementa `cerebros`. */
  cerebrosPropios?: CerebroSer[] | null;
  /** Si nació de un proceso de Imaginación Intuitiva, cuál. */
  procesoTipoId?: string | null;

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

// ═══════════════════════════════════════════════════════════════════════
// OLA 2 — Oficina, capacidades y avatares
//
// Portamos la oficina 3D de Hermes3D (MIT, © 2026 Luke The Dev,
// github.com/iamlukethedev/Hermes3D). Hermes3D es «gateway-first»: la
// interfaz no posee el estado de los agentes, lo pide a un backend por
// WebSocket. Eso es justo lo que nos permite integrarlo de verdad en vez de
// copiarlo: Astraura ES el gateway, y los trabajadores de la oficina son
// nuestros seres, con sus personalidades y su sistema 1.58 bit.
//
// ENDPOINTS NUEVOS (los implementa el backend; ninguno más, ninguno menos):
//   GET    /api/genesis/oficina                     → EstadoOficina
//   GET    /api/genesis/bots_predeterminados        → BotPredeterminado[]
//   POST   /api/genesis/bots_predeterminados/instalar → { ok, creados: string[] }
//   POST   /api/genesis/seres/{id}/internet         → { ok, ser }
//   POST   /api/genesis/seres/{id}/avatar/buscar    → { ok, candidatos: FuenteAvatar[] }
//   POST   /api/genesis/seres/{id}/avatar           → { ok, ser }
//   GET    /api/genesis/herramientas                → HerramientaDisponible[]
//   POST   /api/genesis/seres/{id}/cerebros         → { ok, ser }
// ═══════════════════════════════════════════════════════════════════════

/**
 * Acceso a internet y a las herramientas del sistema, por ser.
 *
 * Es opcional y se concede a conciencia: un ser con `activa` en false no sale
 * a la red, punto. Y cada fuente se concede por separado, porque «leer la
 * biblioteca del OS» y «leer tus carpetas» no son el mismo permiso ni de lejos.
 */
export interface CapacidadInternet {
  activa: boolean;
  /** Biblioteca en línea del OS (paquetes, diseños, funciones publicadas). */
  bibliotecaOS: boolean;
  /** Biblioteca propia del usuario. */
  bibliotecaUsuario: boolean;
  /** Carpetas y archivos del dispositivo, dentro de su soberanía. */
  dispositivo: boolean;
  /** Búsqueda web abierta. Lo más amplio, y por eso aparte. */
  web: boolean;
  /** Si no está vacío, SOLO estos dominios. Gana sobre `bloqueados`. */
  dominiosPermitidos: string[];
  dominiosBloqueados: string[];
  ultimoAcceso?: number | null;
  /** Último error real de red, para que un acceso roto no parezca apagado. */
  ultimoError?: string | null;
}

/** Una herramienta que un ser puede usar, con su origen real. */
export interface HerramientaDisponible {
  id: string;
  nombre: string;
  /** "biblioteca-os" | "biblioteca-usuario" | "dispositivo" | "web" | "nativa" */
  fuente: string;
  descripcion?: string | null;
  /** Permiso que exige; vacío = ninguno. */
  requierePermiso?: string | null;
  disponible: boolean;
  /** Por qué no está disponible, cuando no lo está. */
  motivo?: string | null;
}

/**
 * Un cerebro propio del ser: dónde vive, a dónde se enruta y si se sincroniza.
 * Alex lo pidió literal: «memorias en cerebros propios configurables y
 * enrutables y sincronizables».
 */
export interface CerebroSer {
  id: string;
  nombre: string;
  color?: string | null;
  /** Dónde vive físicamente. */
  rutaAlmacen?: string | null;
  /** Medio o servidor al que se enruta (R2, disco externo, otro nodo). */
  enrutadoA?: string | null;
  sincronizable: boolean;
  ultimaSync?: number | null;
  /** Nunca "ok" por defecto: si no se ha sincronizado nunca, se dice. */
  estadoSync?: "ok" | "fallo" | "nunca";
  /** Detalle del último fallo de sincronización, si lo hubo. */
  errorSync?: string | null;
  /**
   * Desglose vía por vía del ÚLTIMO intento de sincronización (cierre de
   * deuda, ver `ResultadoSincronizacion` al final de este fichero). Con más
   * de un medio en juego (hoy: R2 y Supabase) un fallback que salva el
   * resultado global no debe esconder que otro medio sigue roto: arriba
   * `estadoSync` sigue siendo el veredicto de conjunto, esto es la verdad
   * completa. Ausente = el backend todavía no manda este desglose.
   */
  vias?: ViaSincronizacion[] | null;
}

/** De dónde salió el cuerpo del ser. */
export interface FuenteAvatar {
  /** "procedural" = derivado de su ADN; "enlinea" = encontrado; "subido" = puesto a mano. */
  modo: "procedural" | "enlinea" | "subido";
  url?: string | null;
  /** Qué buscó el ser para encontrarlo. */
  consulta?: string | null;
  proveedor?: string | null;
  /** Licencia declarada del recurso. Sin licencia conocida no se usa por defecto. */
  licencia?: string | null;
  atribucion?: string | null;
  elegidoEn?: number | null;
}

// ─────────────────────────────────────────── La oficina

export interface SalaOficina {
  id: string;
  nombre: string;
  /** Tipo de proceso imaginativo que se hace aquí, si corresponde. */
  procesoTipoId?: string | null;
  /** 0–1: cuánta actividad real hay ahora mismo. */
  actividad: number;
  color?: string | null;
}

export type ActividadOcupante = "pensando" | "hablando" | "trabajando" | "inactivo";

export interface OcupanteOficina {
  serId: string;
  salaId: string | null;
  actividad: ActividadOcupante;
  /** Proceso imaginativo concreto que está corriendo, si lo hay. */
  procesoId?: string | null;
  /** Qué está haciendo, en una frase. Sale del proceso real. */
  detalle?: string | null;
  desde: number;
}

export interface EstadoOficina {
  salas: SalaOficina[];
  ocupantes: OcupanteOficina[];
  actualizadoEn: number;
  /** Falso cuando el estado no viene de procesos reales. La oficina no debe
   *  animar actividad inventada: si no hay nada corriendo, se ve quieta. */
  datosReales: boolean;
}

// ─────────────────────────────────────────── Bots predeterminados

/**
 * Los 7 procesos de Imaginación Intuitiva pasan a ser los 7 bots de fábrica,
 * cada uno con el agente y la personalidad que YA le corresponden en el motor.
 * No son bots nuevos inventados: son los que llevan tiempo trabajando.
 */
export interface BotPredeterminado {
  /** Coincide con el id del tipo de proceso imaginativo. */
  id: string;
  nombre: string;
  rol: string;
  procesoTipoId: string;
  personalidadId?: string | null;
  agenteId?: string | null;
  /** true si ya existe como ser en la bóveda. */
  instalado: boolean;
  descripcion?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════
// OLA 2 — Cierre de deudas: depósito de la biblioteca del usuario y
// sincronización REAL de cerebros (más de una vía, con la verdad de cada
// una por delante).
//
// ENDPOINTS NUEVOS (los implementa el backend; ninguno más, ninguno menos):
//   POST   /api/genesis/herramientas/biblioteca_usuario              → { ok, recibidos, descartados }
//   POST   /api/genesis/cerebros/sincronizar                         → { ok, resultado }   (todos los cerebros del sistema)
//   POST   /api/genesis/seres/{id}/cerebros/{cerebro_id}/sincronizar → { ok, ser }         (uno solo, de este ser)
//   DELETE /api/genesis/seres/{id}/cerebros/{cerebro_id}             → { ok }
// ═══════════════════════════════════════════════════════════════════════

/**
 * Un paquete de la biblioteca del USUARIO tal y como el backend lo necesita
 * para dejar de decir "no disponible" con razón. Vive de verdad en
 * `localStorage` del navegador (`starseed.library.mine.v1`, ver
 * `src/lib/library/packages.ts` → `LibraryPackage`) — esto es lo mínimo que
 * viaja al depositarla, no el paquete completo (payload, tags, versión…).
 */
export interface PaqueteBibliotecaUsuario {
  id: string;
  /** Tipo de paquete (función, diseño, plantilla…). El backend no impone un vocabulario cerrado. */
  kind?: string;
  name: string;
  description?: string;
}

/** Respuesta de depositar la biblioteca: cuántos entraron y cuántos no — nunca solo un "ok" a secas. */
export interface DepositoBiblioteca {
  recibidos: number;
  descartados: number;
}

/**
 * Un medio de sincronización probado DE VERDAD (R2, Supabase…) y si
 * respondió. El backend no tiene por qué limitarse a estos dos con el
 * tiempo — por eso `medio` es texto libre, no una unión cerrada.
 */
export interface ViaSincronizacion {
  medio: string;
  ok: boolean;
  /** Detalle real del fallo EN ESTA vía — nunca se esconde detrás de un `ok` global que otra vía sí ganó. */
  error?: string | null;
}

/**
 * Resultado de un intento de sincronizar cerebros. `ok` es el veredicto
 * GLOBAL (con que una vía capaz de guardar funcione — hoy Supabase — ya
 * vale); `vias` es la verdad completa, vía por vía, para que un fallback
 * que salvó el resultado nunca esconda que otro medio — hoy R2, por un
 * handshake TLS roto — sigue sin funcionar. Un check verde a secas
 * escondería que la mitad del mecanismo está roto: por eso las dos cosas
 * viajan siempre juntas.
 */
export interface ResultadoSincronizacion {
  ok: boolean;
  vias: ViaSincronizacion[];
  /** Cuántos cerebros tocó este intento: 1 para "uno", puede ser más para "todos". */
  cerebrosTocados: number;
  en: number;
}
