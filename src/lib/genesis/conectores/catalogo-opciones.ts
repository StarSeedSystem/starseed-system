import { guardarClave, prestarClave, usarClave, revocar } from "./boveda-servidor";

/**
 * Fusión de proveedores-catalogo y free-catalog para crear un catálogo único de opciones.
 * 
 * Este módulo es PURO: no hace I/O, solo procesa los datos de entrada.
 * 
 * @param proveedores - Array de ProveedorInfo desde src/lib/mando/proveedores-catalogo.ts
 * @param fuentesGratis - Array de CatalogSource desde src/ai/astraura/free-catalog.ts
 * @returns Array fusionado de OpcionCatalogo
 */
export function fusionarCatalogos(
  proveedores: ProveedorInfo[],
  fuentesGratis: CatalogSource[]
): OpcionCatalogo[] {
  const resultado: OpcionCatalogo[] = [];

  // Proveer proveedores del catálogo
  for (const prov of proveedores) {
    resultado.push(convertirProveedorOpcion(prov));
  }

  // Proveer fuentes gratis
  for (const fuente of fuentesGratis) {
    resultado.push(convertirFuenteOpcion(fuente));
  }

  return resultado;
}

/**
 * Convierte un ProveedorInfo a OpcionCatalogo.
 */
function convertirProveedorOpcion(prov: ProveedorInfo): OpcionCatalogo {
   // Determinar papeles basado en el campo papel
   const papeles: Papel[] = prov.papel ? [prov.papel as Papel] : [];

   // Determinar si requiere cuenta
   const requiereCuenta = prov.requiereCuenta ?? false;

  // Determinar enlaces
  const enlaceAlta = prov.panelClaves ?? null; // Asumimos que panelClaves es donde se da de alta
  const enlaceClave = prov.panelClaves ?? null; // panelClaves es donde se consigue la clave

  // Determinar privacidad (valor por defecto ya que no está en proveedores-catalogo)
  const privacidad: Privacidad = "desconocida";

  // El campo gratis debe ser null para proveedores de pago, o tener la nota de gratis
  let gratis: Gratis | null = null;
  if (!prov.dePago && prov.gratis) {
    // Intentar extraer números de la gratis string
    gratis = parseGratisNota(prov.gratis);
  }

  return {
    id: prov.id,
    nombre: prov.nombre,
    tipo: "proveedor",
    papeles,
    gratis,
    requiereCuenta,
    enlaceAlta,
    enlaceClave,
    variables: prov.variables,
    privacidad,
    licencia: null, // No disponible en la fuente
    verificado: null, // No disponible en la fuente
    fuente: "proveedores-catalogo"
  };
}

/**
 * Convierte un CatalogSource a OpcionCatalogo.
 */
function convertirFuenteOpcion(fuente: CatalogSource): OpcionCatalogo {
  // Determinar papeles basado en las fortalezas de los modelos
  const papeles: Papel[] = determinarPapelesDesdeFortalezas(fuente.models);

  // Determinar si requiere cuenta (basado en requiresKey y si es instant/local)
  const requiereCuenta = requiereCuentaParaFuente(fuente);

  // Determinar enlaces
  const enlaceAlta = fuente.getKeyUrl ?? null; // getKeyUrl suele ser donde se da de alta y consigue clave
  const enlaceClave = fuente.getKeyUrl ?? null;

  // Determinar privacidad
  const privacidad = convertirPrivacidad(fuente.privacy);

  // El campo gratis viene del limits
  let gratis: Gratis | null = null;
  if (fuente.limits) {
    gratis = parseGratisNota(fuente.limits);
  }

  // Determinar licencia (valor por defecto)
  const licencia: Licencia | null = null;

  // Determinar verificado (valor por defecto)
  const verificado: string | null = null;

  return {
    id: fuente.id,
    nombre: fuente.label,
    tipo: "modelo",
    papeles,
    gratis,
    requiereCuenta,
    enlaceAlta,
    enlaceClave,
    variables: [], // No disponible en free-catalog
    privacidad,
    licencia,
    verificado,
    fuente: "free-catalog"
  };
}

/**
 * Determina los papeles basado en las fortalezas de los modelos.
 */
function determinarPapelesDesdeFortalezas(models: CatalogModel[]): Papel[] {
  const papelesSet = new Set<Papel>();
  
  for (const model of models) {
    for (const strength of model.strengths) {
      // Mapear fortalezas a papeles
      switch (strength) {
        case "chat":
          papelesSet.add("chat");
          break;
        case "code":
           papelesSet.add("código");
          break;
        case "vision":
           papelesSet.add("visión");
          break;
        case "fast":
          // fast podría ser para voz o conversación rápida
          papelesSet.add("chat"); // Asumimos que fast es para chat rápido
          break;
        case "reasoning":
          // reasoning podría ser para múltiples papeles
          break;
        default:
          // Ignorar otras fortalezas por ahora
          break;
      }
    }
  }
  
  return Array.from(papelesSet);
}

/**
 * Determina si una fuente requiere cuenta.
 */
function requiereCuentaParaFuente(fuente: CatalogSource): boolean {
  // Las fuentes instant y local no requieren cuenta
  if (fuente.tier === "instant" || fuente.tier === "local" || fuente.tier === "local-gpu") {
    return false;
  }
  
  // Las fuentes free-key requieren clave, lo que generalmente implica cuenta
  if (fuente.tier === "free-key") {
    return fuente.requiresKey;
  }
  
  // Las fuentes de pago pueden o no requerir cuenta
  if (fuente.tier === "paid") {
    return true; // Asumimos que los de pago requieren cuenta
  }
  
  return false;
}

/**
 * Convierte la privacidad de free-catalog a nuestro tipo.
 */
function convertirPrivacidad(privacidad: "local" | "browser" | "cloud"): Privacidad {
  switch (privacidad) {
    case "local":
      return "local";
    case "browser":
      return "nube-sin-retencion"; // En el navegador, no sale del dispositivo
    case "cloud":
      // Para cloud, asumimos con retención a menos que se indique lo contrario
      // En una implementación real, miraríamos el campo why u otros indicadores
      return "nube-con-retencion";
    default:
      return "desconocida";
  }
}

/**
 * Parsea una string de límites/gratis para extraer números estructurados.
 * 
 * @param nota - String descriptiva de límites
 * @returns Objeto Gratis con los números encontrados y la nota original
 */
function parseGratisNota(nota: string): Gratis {
  // Inicializamos todo en null
  const resultado: Gratis = {
    rpm: null,
    porDia: null,
    horasMes: null,
    almacenamientoGb: null,
    nota
  };

  // Expresiones regulares para buscar números con unidades
  const rpmMatch = nota.match(/(\d+(?:\.\d+)?)\s*\/?\s*(?:min|minuto|minutos)/i);
  if (rpmMatch) {
    resultado.rpm = parseFloat(rpmMatch[1]);
  }

  const porDiaMatch = nota.match(/(\d+(?:\.\d+)?)\s*(?:per\s+)?day|\/día|\/dia/i);
  if (porDiaMatch) {
    resultado.porDia = parseFloat(porDiaMatch[1]);
  }

  const horasMesMatch = nota.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|horas?)\s*(?:per\s+)?month|\/mes/i);
  if (horasMesMatch) {
    resultado.horasMes = parseFloat(horasMesMatch[1]);
  }

  const almacenamientoGbMatch = nota.match(/(\d+(?:\.\d+)?)\s*(?:gb|gigabytes?)\s*(?:per\s+)?(?:month|\/mes)/i);
  if (almacenamientoGbMatch) {
    resultado.almacenamientoGb = parseFloat(almacenamientoGbMatch[1]);
  }

  return resultado;
}

/**
 * Tipo para el papel que desempeña una opción.
 */
export type Papel = 
  | "escritor" 
  | "revisor" 
  | "chat" 
  | "visión" 
  | "voz" 
  | "imagen" 
  | "código";

/**
 * Tipo para los límites gratis.
 */
export type Gratis = {
  rpm: number | null;
  porDia: number | null;
  horasMes: number | null;
  almacenamientoGb: number | null;
  nota: string;
};

/**
 * Tipo para la licencia.
 */
export type Licencia = string | null;

/**
 * Tipo para la privacidad.
 */
export type Privacidad = 
  | "local" 
  | "nube-sin-retencion" 
  | "nube-con-retencion" 
  | "desconocida";

/**
 * Tipo de información de un proveedor (desde proveedores-catalogo.ts).
 */
export interface ProveedorInfo {
  id: string;
  nombre: string;
  /** URL base de la API (raíz, sin `/chat/completions`). */
  base: string;
  /** Dónde se consigue la clave. */
  panelClaves: string;
  /** Documentación de la API. */
  docs: string;
  /** Qué da gratis, en una frase. */
  gratis: string;
  /** True si hace falta una cuenta (que solo Alex crea hoy). */
  requiereCuenta: boolean;
  /** True si responde gratis sin clave (a cupo reducido). */
  sinClaveOk?: boolean;
  /** Variables de entorno conocidas para este proveedor. */
  variables: string[];
  /**
   * True si el proveedor es DE PAGO (se cobra por token). Un proveedor con
   * `dePago: true` JAMÁS entra en la rotación de escritores del enjambre:
   * solo se usa a mano, para papeles de confianza como el director. Los
   * proveedores sin esta marca (o `false`) son los gratuitos de la flota.
   */
  dePago?: boolean;
  /**
   * Papel al que está destinado el proveedor en la cadena de relevo. Los
   * proveedores de pago se reservan para «director»; gratuitos y escriben y
   * revisan. Es orientativo y actualmente solo distingue al de pago en la UI.
   */
  papel?: "escritor" | "revisor" | "director";
}

/**
 * Una fuente de inteligencia del catálogo (desde free-catalog.ts).
 */
export interface CatalogSource {
  /** Id estable del catálogo (starseed.astraura). */
  id: string;
  label: string;
  tier: SourceTier;
  /** Adaptador del sistema de providers que la sirve. */
  providerId: string; // Simplificado para este ejemplo
  /** Base URL para el adaptador (OpenAI-compatible salvo nota). */
  baseUrl: string;
  /** ¿Necesita clave API? (las "instant" y locales, no). */
  requiresKey: boolean;
  /** Dónde conseguir la clave gratuita. */
  getKeyUrl?: string;
  /** Modelos curados de la fuente. */
  models: CatalogModel[];
  /** Límite del tier gratis, honesto y legible. */
  limits: string;
  /** Por qué Aurora elegiría esta fuente (transparencia). */
  why: string;
  /** Privacidad: "local" no sale del equipo; "cloud" sí. */
  privacy: "local" | "browser" | "cloud";
  /** Multiplicador de prioridad (privacidad/soberanía puntúan más). */
  weight: number;
  /** (Adenda 71-bis) Fuente registrada en runtime desde la Biblioteca. */
  fromLibrary?: boolean;
  /** (Adenda 67 · P0-2) La fuente FUNCIONA SIN CLAVE, pero acepta una clave
   * opcional para subir sus límites (p.ej. LLM7.io: 30 req/min anónimo →
   * 120 req/min con token gratuito). `requiresKey` sigue siendo false: el
   * router la usa siempre; la clave solo la mejora.
   */
  keyOptional?: boolean;
  /** (Adenda 67 · P0-2) NUNCA enfriar esta fuente tras un fallo/429. Reservado a
   * las redes de seguridad SIN CLAVE: si Pollinations entra en cooldown 60 min,
   * el usuario invitado se queda literalmente SIN CEREBRO. Un fallo transitorio
   * jamás debe apagar el último recurso.
   */
  neverCooldown?: boolean;
  /** Minutos de enfriamiento al recibir 429/cuota agotada (por defecto 60).
   * Las fuentes limitadas por RPM (no por día) usan valores CORTOS: su cuota se
   * recupera en segundos, apagarlas una hora sería absurdo.
   */
  cooldownMinutes?: number;
  /** Preferir SIEMPRE los modelos con sufijo `:free` de esta fuente (OpenRouter):
   * el router los rankea por encima y nunca gasta créditos de pago del usuario
   * sin que lo pida. Ver §18.2 de architecture/astraura-inteligencia.md.
   */
  preferFreeModels?: boolean;
  /** Timeout por petición (ms) para ESTA fuente. Sobrescribe el default por
   * privacidad. Pollinations puede tardar ~40 s en horas punta: matarla a los
   * 30 s convertía respuestas válidas en "fallos" y vaciaba la cadena.
   */
  timeoutMs?: number;
  /** (Ola 278 · OS2 · 2026-09-08) «Gracia de primer token» (ms). Si la fuente
   * empieza a emitir (llega su primer token vía `onChunk`), el router NO la
   * corta por el total: extiende el corte a `timeoutMs + firstTokenGraceMs`.
   * Pensado para el nativo 1.58-bit local, que tarda ~95 s en sacar el primer
   * token y luego va a ~2 tok/s: matarlo justo cuando empieza a responder
   * tiraría una respuesta válida y cedería el turno sin motivo. 0/ausente =
   * comportamiento clásico (corte fijo en `timeoutMs`).
   */
  firstTokenGraceMs?: number;
}

/** Un modelo concreto dentro de una fuente. */
export interface CatalogModel {
  /** Id EXACTO que espera la API de la fuente. */
  id: string;
  /** Etiqueta legible. */
  label: string;
  /** Tareas donde este modelo destaca (para el ranking). */
  strengths: string[];
  /** Puntuación de capacidad 1-10 (heurística del catálogo). */
  quality: number;
  /** ¿Entiende imágenes? */
  vision?: boolean;
  /** Ventana de contexto aproximada (tokens). */
  context?: number;
  /** Nota corta (límites o rasgos). */
  note?: string;
}

/** Clase de tarea que Aurora clasifica antes de elegir modelo. */
export type TaskKind =
  | "chat"        // conversación general / control del OS
  | "fast"        // respuesta corta en tiempo real (voz)
  | "code"        // programación
  | "reasoning"   // razonamiento profundo / matemáticas / planificación
  | "vision"      // entender imágenes
  | "long"        // contexto muy largo (documentos, memorias)
  | "creative"    // escritura creativa / cultura
  | "translate"   // traducción / multilingüe
  | "summary"     // resumen / síntesis
  | "embedding"   // embeddings / búsqueda vectorial
  | "rag"         // retrieval-augmented generation
  | "orchestration" // orquestación multi-agente
  | "dag"         // grafos acíclicos dirigidos
  | "tools"       // tool calling / function calling
  | "inference"   // inference de modelos grandes
  | "collab"      // colaboración en tiempo real
  | "drawing"     // dibujo / canvas
  | "webgpu"      // WebGPU shaders
  | "webrtc"      // WebRTC data channels
  | "theory"      // teoría / formalización
  | "quantization" // cuantización
  | "training"    // entrenamiento
  | "1.58-bit"    // 1.58-bit específico
  | "coding"      // agente de código
  | "terminal"    // terminal / shell
  | "autonomous"  // agente autónomo
  | "git";        // git / version control

/** Nivel de fuente de gratuidad. */
export type SourceTier = "instant" | "free-key" | "local" | "local-gpu" | "paid";

/**
 * Entrada del catálogo único de opciones.
 */
export interface OpcionCatalogo {
  id: string;
  nombre: string;
  tipo: "modelo" | "proveedor" | "contenedor" | "herramienta" | "habilidad" | "conector";
  papeles: Papel[];
  gratis: Gratis | null;
  requiereCuenta: boolean;
  enlaceAlta: string | null;
  enlaceClave: string | null;
  variables: string[];
  privacidad: Privacidad;
  licencia: Licencia | null;
  verificado: string | null;
  fuente: string;
}