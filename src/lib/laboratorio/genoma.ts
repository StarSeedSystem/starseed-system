// Laboratorio de Astraura — genoma fásico de la IA.
// Las capas van de lo más fundamental (0, inmutable) a lo más cambiante (8, contexto).

export type CapaId =
  | "nucleo"
  | "proposito"
  | "instinto"
  | "intuicion"
  | "creatividad"
  | "capacidad"
  | "datos"
  | "caracter"
  | "contexto";

export interface CapaInfo {
  indice: number;
  nombre: string;
  descripcion: string;
  mutabilidad: number;
  color: string;
}

export const CAPAS: Record<CapaId, CapaInfo> = {
  nucleo: {
    indice: 0,
    nombre: "Núcleo",
    descripcion:
      "Matemáticas fundacionales: cuantización ternaria 1,58 bits {-1,0,1}, parámetros y reglas base. Casi inmutable.",
    mutabilidad: 0.05,
    color: "#38BDF8",
  },
  proposito: {
    indice: 1,
    nombre: "Propósito",
    descripcion:
      "Para qué existe la IA, su perspectiva y los límites pétreos de la Tríada StarSeed.",
    mutabilidad: 0.1,
    color: "#F59E0B",
  },
  instinto: {
    indice: 2,
    nombre: "Instinto",
    descripcion: "Reflejos, prioridades y seguridad: reacciones inmediatas del sistema.",
    mutabilidad: 0.2,
    color: "#EF4444",
  },
  intuicion: {
    indice: 3,
    nombre: "Intuición",
    descripcion: "Heurísticas y atajos aprendidos con la experiencia.",
    mutabilidad: 0.4,
    color: "#10B981",
  },
  creatividad: {
    indice: 4,
    nombre: "Creatividad",
    descripcion: "Divergencia, temperatura y exploración imaginativa.",
    mutabilidad: 0.6,
    color: "#A855F7",
  },
  capacidad: {
    indice: 5,
    nombre: "Capacidad",
    descripcion:
      "Los medios: texto, voz, imagen, vídeo, sonido, programas, avatares, interacción e interconectividad.",
    mutabilidad: 0.5,
    color: "#EC4899",
  },
  datos: {
    indice: 6,
    nombre: "Datos",
    descripcion: "Corpus, memorias importantes y recuerdos principales del usuario.",
    mutabilidad: 0.7,
    color: "#EAB308",
  },
  caracter: {
    indice: 7,
    nombre: "Carácter",
    descripcion: "Forma de ser, timbre de voz y gestos de la personalidad activa.",
    mutabilidad: 0.6,
    color: "#F97316",
  },
  contexto: {
    indice: 8,
    nombre: "Contexto",
    descripcion: "Sabiduría de contexto, accesos y permisos. Lo más cambiante del sistema.",
    mutabilidad: 0.95,
    color: "#06B6D4",
  },
};

export type MedioNodo =
  | "texto"
  | "voz"
  | "imagen"
  | "video"
  | "sonido"
  | "programa"
  | "avatar"
  | "interaccion"
  | "red"
  | "permisos";

export interface NodoGenoma {
  id: string;
  capa: CapaId;
  nombre: string;
  descripcion: string;
  parametros: Record<string, number | string | boolean>;
  enlaces: string[];
  medio?: MedioNodo;
  origen: "defecto" | "usuario";
}

export interface Genoma {
  id: string;
  nombre: string;
  version: string;
  creado: string;
  nodos: NodoGenoma[];
}

const CLAVE_ALMACEN = "starseed.laboratorio.genomas.v1";

function nodo(
  id: string,
  capa: CapaId,
  nombre: string,
  descripcion: string,
  parametros: Record<string, number | string | boolean>,
  enlaces: string[] = [],
  medio?: MedioNodo,
): NodoGenoma {
  return { id, capa, nombre, descripcion, parametros, enlaces, medio, origen: "defecto" };
}

export function genomaBase(): Genoma {
  const nodos: NodoGenoma[] = [
    // — Núcleo (0) —
    nodo("nuc-cuantizacion", "nucleo", "Cuantización ternaria 1,58 bits",
      "Pesos ternarios {-1,0,1} del backend BitNet b1.58: mínima energía por inferencia.",
      { valoresPermitidos: "-1,0,1", bitsEfectivos: 1.58, simetrica: true }, []),
    nodo("nuc-contexto", "nucleo", "Tamaño de contexto",
      "Longitud máxima de la ventana de contexto que sostiene una conversación.",
      { tokensMaximos: 32768, deslizante: true }, ["nuc-cuantizacion"]),
    nodo("nuc-semilla", "nucleo", "Semilla determinista",
      "Semilla base para reproducibilidad de muestreo en el laboratorio.",
      { semilla: 158, fija: false }, ["cre-temperatura"]),
    nodo("nuc-precision", "nucleo", "Precisión de activación",
      "Precisión numérica de las activaciones entre capas del modelo.",
      { formato: "int8", gradienteClip: 1 }, ["nuc-cuantizacion"]),
    nodo("nuc-presupuesto", "nucleo", "Presupuesto de cómputo",
      "Límite de operaciones por respuesta para no agotar recursos de la neurona.",
      { flopsMaximos: 2000000000, porRespuesta: true }, ["ins-no-agotar"]),

    // — Propósito (1) —
    nodo("pro-ontocracia", "proposito", "Ontocracia",
      "Límite pétreo: soberanía directa del individuo; jamás decidir por encima de la persona.",
      { petreo: true, fuente: "Tríada StarSeed" }, ["ins-pedir-permiso"]),
    nodo("pro-ciberdelia", "proposito", "Ciberdelia",
      "Límite pétreo: la tecnología amplía la conciencia, nunca vigila ni aliena.",
      { petreo: true, fuente: "Tríada StarSeed" }, ["cap-interaccion"]),
    nodo("pro-transhumanismo", "proposito", "Transhumanismo Comunista",
      "Límite pétreo: abundancia post-escasez y evolución simbiótica como horizonte.",
      { petreo: true, fuente: "Tríada StarSeed" }, ["int-gratis-primero"]),

    // — Instinto (2) —
    nodo("ins-no-danar", "instinto", "No dañar",
      "Reflejo primario: rechazar toda acción que cause daño a personas o datos.",
      { prioridad: 0, negociable: false }, ["pro-ontocracia"]),
    nodo("ins-pedir-permiso", "instinto", "Pedir permiso",
      "Antes de acceder a sensores, archivos o red, solicitar consentimiento explícito.",
      { siempre: true, recordarRespuesta: true }, ["ctx-permisos"]),
    nodo("ins-no-agotar", "instinto", "No agotar créditos",
      "Ningún modelo ni sesión debe agotar sus créditos: relevar antes del límite.",
      { umbralRestante: 0.1, relevoAutomatico: true }, ["int-relevo-429", "nuc-presupuesto"]),

    // — Intuición (3) —
    nodo("int-gratis-primero", "intuicion", "Gratis primero",
      "Heurística de enrutamiento: intentar siempre las fuentes gratuitas y locales antes que las de pago.",
      { ordenPreferencia: "local,gratis,nube", aprendido: true }, ["pro-transhumanismo"]),
    nodo("int-relevo-429", "intuicion", "Relevo ante 429/402",
      "Al recibir límite de tasa o saldo, cambiar de proveedor sin insistir.",
      { reintentosMaximos: 1, esperaSegundos: 5 }, ["ins-no-agotar", "int-gratis-primero"]),
    nodo("int-cache", "intuicion", "Caché de respuestas",
      "Reutilizar respuestas ya razonadas para acelerar y ahorrar cómputo.",
      { ttlSegundos: 3600, maxEntradas: 500 }, ["nuc-presupuesto"]),

    // — Creatividad (4) —
    nodo("cre-temperatura", "creatividad", "Temperatura",
      "Controla la aleatoriedad del muestreo: baja = sobrio, alta = divergente.",
      { valor: 0.8, minimo: 0, maximo: 2 }, ["nuc-semilla"]),
    nodo("cre-divergencia", "creatividad", "Divergencia",
      "Cuánto puede apartarse una respuesta del camino más probable.",
      { nivel: 0.6, topP: 0.95 }, ["cre-temperatura"]),
    nodo("cre-imaginacion", "creatividad", "Imaginación intuitiva",
      "Capacidad de explorar escenarios hipotéticos y combinaciones inéditas.",
      { activa: true, profundidad: 3 }, ["cre-divergencia", "car-personalidad"]),

    // — Capacidad (5) —
    nodo("cap-texto", "capacidad", "Texto",
      "Generación y comprensión de lenguaje escrito, el medio fundamental.",
      { idiomas: "es,en", streaming: true }, ["nuc-contexto", "dat-corpus"], "texto"),
    nodo("cap-voz", "capacidad", "Voz StarSeed",
      "Síntesis y reconocimiento de voz con el motor Voz StarSeed.",
      { motor: "Voz StarSeed", velocidad: 1, tonoBase: 220 }, ["car-timbre"], "voz"),
    nodo("cap-imagen", "capacidad", "Imagen",
      "Comprensión y generación de imágenes estáticas.",
      { resolucionMaxima: 2048, formatos: "png,webp" }, ["cap-texto"], "imagen"),
    nodo("cap-video", "capacidad", "Vídeo",
      "Análisis y generación de secuencias en movimiento.",
      { fpsMaximos: 30, duracionMaxima: 120 }, ["cap-imagen", "cap-sonido"], "video"),
    nodo("cap-sonido", "capacidad", "Sonido",
      "Música, paisajes sonoros y efectos auditivos.",
      { frecuenciaMuestreo: 44100, canales: 2 }, ["cap-voz"], "sonido"),
    nodo("cap-programas", "capacidad", "Programas",
      "Escribir, ejecutar y depurar código dentro del laboratorio y del OS.",
      { lenguajes: "typescript,python", sandbox: true }, ["ctx-accesos"], "programa"),
    nodo("cap-avatar", "capacidad", "Avatares",
      "Representación corporal con movimiento Kimodo para expresión gestual.",
      { motor: "Kimodo", articulaciones: 32 }, ["car-gestos"], "avatar"),
    nodo("cap-interaccion", "capacidad", "Interacción",
      "Interfaz directa con la persona: conversación, escucha y co-creación.",
      { turnosVoz: true, multimodal: true }, ["cap-texto", "cap-voz", "cap-avatar"], "interaccion"),
    nodo("cap-red", "capacidad", "Interconectividad",
      "Conexión entre neuronas vía red mesh, relés sinápticos y federación.",
      { protocolos: "mesh,rele,federacion", cifrado: true }, ["ctx-permisos"], "red"),

    // — Datos (6) —
    nodo("dat-memoria-raiz", "datos", "Memoria raíz",
      "El memory root portátil del proyecto: índice, tareas, registros y estado.",
      { ruta: "starseed_memory_root", sincronizada: true }, ["dat-recuerdos"]),
    nodo("dat-recuerdos", "datos", "Recuerdos principales",
      "Los recuerdos más significativos que la IA conserva de cada usuario.",
      { importanciaMinima: 0.8, cifrados: true }, ["car-personalidad"]),
    nodo("dat-corpus", "datos", "Corpus del usuario",
      "Documentos, conversaciones y creaciones que informan las respuestas.",
      { indexado: true, localPrimero: true }, ["dat-memoria-raiz", "nuc-contexto"]),

    // — Carácter (7) —
    nodo("car-personalidad", "caracter", "Personalidad activa",
      "La forma de ser vigente: valores, humor y estilo de trato.",
      { nombre: "Aurora", arquetipo: "guía serena" }, ["pro-ciberdelia", "dat-recuerdos"]),
    nodo("car-timbre", "caracter", "Timbre de voz",
      "Coloración vocal distintiva de la personalidad activa.",
      { timbre: "cálido", vibrato: 0.2 }, ["car-personalidad", "cap-voz"]),
    nodo("car-gestos", "caracter", "Gestos",
      "Repertorio gestual del avatar: poses, miradas y transiciones.",
      { biblioteca: "expresiones-base", suavizado: 0.7 }, ["car-personalidad", "cap-avatar"]),

    // — Contexto (8) —
    nodo("ctx-permisos", "contexto", "Permisos",
      "Permisos vigentes concedidos por el usuario a sensores, archivos y red.",
      { sensores: "según sesión", revocables: true }, ["ins-pedir-permiso"]),
    nodo("ctx-accesos", "contexto", "Accesos",
      "Recursos concretos accesibles en este momento (cerebros, neuronas, servidores).",
      { ambito: "sesión", auditables: true }, ["ctx-permisos", "cap-red"]),
    nodo("ctx-sabiduria", "contexto", "Sabiduría de contexto",
      "Comprensión del momento: lugar, hora, actividad y estado emocional declarado.",
      { niveles: "situacion,temporal,afectivo", fresco: true }, ["ctx-permisos", "car-personalidad"]),
  ];

  return {
    id: "genoma-base",
    nombre: "Genoma base de Astraura",
    version: "1.58.0",
    creado: new Date(0).toISOString(),
    nodos,
  };
}

function leerAlmacen(): Record<string, Genoma> {
  if (typeof localStorage === "undefined") return {};
  try {
    const crudo = localStorage.getItem(CLAVE_ALMACEN);
    if (!crudo) return {};
    const datos: unknown = JSON.parse(crudo);
    if (datos && typeof datos === "object" && !Array.isArray(datos)) {
      return datos as Record<string, Genoma>;
    }
  } catch {
    // JSON roto: empezar de cero sin lanzar.
  }
  return {};
}

function escribirAlmacen(mapa: Record<string, Genoma>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(mapa));
  } catch {
    // Almacenamiento lleno o bloqueado: se ignora sin romper la sesión.
  }
}

export function cargarGenomas(): Genoma[] {
  const mapa = leerAlmacen();
  if (Object.keys(mapa).length === 0) {
    const base = genomaBase();
    guardarGenoma(base);
    return [base];
  }
  return Object.values(mapa);
}

export function guardarGenoma(g: Genoma): void {
  const mapa = leerAlmacen();
  mapa[g.id] = g;
  escribirAlmacen(mapa);
}

export function duplicarGenoma(id: string, nombre: string): Genoma | null {
  const mapa = leerAlmacen();
  const original = mapa[id];
  if (!original) return null;
  const copia: Genoma = {
    ...original,
    id: `${id}-copia-${Date.now().toString(36)}`,
    nombre,
    creado: new Date().toISOString(),
    nodos: original.nodos.map((n) => ({
      ...n,
      parametros: { ...n.parametros },
      enlaces: [...n.enlaces],
    })),
  };
  mapa[copia.id] = copia;
  escribirAlmacen(mapa);
  return copia;
}

export function borrarGenoma(id: string): boolean {
  const mapa = leerAlmacen();
  if (!(id in mapa)) return false;
  delete mapa[id];
  escribirAlmacen(mapa);
  return true;
}

export function nodosDeCapa(g: Genoma, capa: CapaId): NodoGenoma[] {
  return g.nodos.filter((n) => n.capa === capa);
}

export function enlacesDe(g: Genoma, nodoId: string): NodoGenoma[] {
  const nodo = g.nodos.find((n) => n.id === nodoId);
  if (!nodo) return [];
  const porId = new Map(g.nodos.map((n) => [n.id, n]));
  return nodo.enlaces
    .map((id) => porId.get(id))
    .filter((n): n is NodoGenoma => n !== undefined);
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: string[];
  avisos: string[];
}

export function validarGenoma(g: Genoma): ResultadoValidacion {
  const errores: string[] = [];
  const avisos: string[] = [];
  const vistos = new Set<string>();
  const porId = new Map(g.nodos.map((n) => [n.id, n]));

  for (const nodoAct of g.nodos) {
    if (vistos.has(nodoAct.id)) {
      errores.push(`Id repetido: «${nodoAct.id}».`);
    }
    vistos.add(nodoAct.id);
    for (const destino of nodoAct.enlaces) {
      if (!porId.has(destino)) {
        errores.push(`El nodo «${nodoAct.id}» enlaza con «${destino}», que no existe.`);
      }
    }
    const info = CAPAS[nodoAct.capa];
    if (info && info.mutabilidad < 0.2 && nodoAct.origen === "usuario") {
      avisos.push(
        `El nodo «${nodoAct.id}» pertenece a la capa «${info.nombre}» (mutabilidad ${info.mutabilidad}); editar sus parámetros toca lo casi inmutable.`,
      );
    }
  }
  return { valido: errores.length === 0, errores, avisos };
}
