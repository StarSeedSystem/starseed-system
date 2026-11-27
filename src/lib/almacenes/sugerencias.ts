/**
 * Sugerencias de modalidad y acomodo para almacenes
 *
 * Dado un almacén con sus medidas (velocidad, tamaño, salud, uso) y qué contiene
 * (cerebros/partes del manifiesto), sugiere la modalidad más adecuada y cómo
 * acomodar los datos. Solo sugiere; nunca aplica sin aceptación del dueño.
 *
 * Reglas (architecture/almacenes-cerebros.md §2, §7, §10):
 * - USB lento → respaldo / secundario
 * - SSD rápido → cerebro activo / respaldo vivo
 * - Disco viejo con avisos de salud → secundario con aviso
 * - Lo fundamental nunca solo en extraíble sin confirmación
 * - Modalidades: cerebro-completo, parte, replica, respaldo-vivo, neurona-nodo, secundario
 */

import {
  TipoAlmacen,
  ModalidadAlmacen,
  ModalidadCarpeta,
  MedidasAlmacen,
  type Almacen,
  type ManifiestoAlmacen,
} from "./modelo";
import { validarManifiestoAlmacen } from "./modelo";
import { cerebrosEnManifiesto } from "./manifiesto";
import { esFundamental } from "./ubicaciones";

/** Resultado de una sugerencia para un almacén. */
export interface SugerenciaAlmacen {
  /** Modalidad sugerida para el almacén completo. */
  modalidadSugerida: ModalidadAlmacen;
  /** Modalidades sugeridas por carpeta (si el almacén tiene partes). */
  carpetasSugeridas: Record<string, ModalidadCarpeta>;
  /** Razones de la sugerencia (para mostrar en UI). */
  razones: string[];
  /** Advertencias (ej. salud crítica, único copia fundamental en extraíble). */
  advertencias: string[];
  /** Confianza de la sugerencia (0-1). */
  confianza: number;
}

/** Entrada para sugerir: almacén + manifiesto opcional. */
export interface EntradaSugerencia {
  /** El almacén con sus medidas medidas. */
  almacen: Almacen;
  /** Manifiesto opcional (lo que hay escrito en .starseed/almacen.json). */
  manifiesto?: ManifiestoAlmacen;
  /** Otros almacenes de la misma neurona (para comparar y detectar duplicados). */
  otrosAlmacenes?: Almacen[];
}

/** Umbrales de velocidad (MB/s) para clasificar discos. */
const UMBRALES_VELOCIDAD = {
  /** < 50 MB/s → lento (USB 2.0, HDD viejo, SD). */
  LENTO: 50,
  /** 50-400 MB/s → medio (USB 3.0, SATA SSD, red 1Gbps). */
  MEDIO: 400,
  /** > 400 MB/s → rápido (NVMe, USB 3.1/3.2/4, Thunderbolt, 10Gbps+). */
  RAPIDO: 400,
} as const;

/** Umbrales de espacio libre (GB). */
const UMBRALES_ESPACIO = {
  ESCASO: 10,    // < 10 GB libres
  MODERADO: 50,  // 10-50 GB
  AMPLIO: 50,    // > 50 GB
} as const;

/** Umbrales de salud para decisiones. */
const SALUD_CRITICA: MedidasAlmacen["salud"][] = ["critica", "desconocida"];

/**
 * Clasifica la velocidad de un almacén.
 */
export function clasificarVelocidad(m: MedidasAlmacen): "lento" | "medio" | "rapido" {
  const vel = Math.max(m.velocidadLecturaMbps, m.velocidadEscrituraMbps);
  if (vel < UMBRALES_VELOCIDAD.LENTO) return "lento";
  if (vel < UMBRALES_VELOCIDAD.RAPIDO) return "medio";
  return "rapido";
}

/**
 * Clasifica el espacio libre de un almacén.
 */
export function clasificarEspacio(m: MedidasAlmacen): "escaso" | "moderado" | "amplio" {
  const libreGb = Number(m.libreBytes) / 1_073_741_824;
  if (libreGb < UMBRALES_ESPACIO.ESCASO) return "escaso";
  if (libreGb < UMBRALES_ESPACIO.AMPLIO) return "moderado";
  return "amplio";
}

/**
 * Evalúa la salud del almacén para decisiones de modalidad.
 */
export function evaluarSalud(m: MedidasAlmacen): "buena" | "regular" | "mala" {
  if (m.salud === "excelente" || m.salud === "buena") return "buena";
  if (m.salud === "regular") return "regular";
  return "mala"; // critica, desconocida
}

/**
 * Calcula el uso actual del almacén (0-1).
 */
export function calcularUso(m: MedidasAlmacen): number {
  const total = Number(m.totalBytes);
  const libre = Number(m.libreBytes);
  if (total === 0) return 0;
  return 1 - libre / total;
}

/**
 * Detecta si un almacén es extraíble.
 */
export function esExtraible(a: Almacen): boolean {
  return a.tipo === "extraible";
}

/**
 * Detecta si un almacén es del sistema (disco interno de la neurona).
 */
export function esSistema(a: Almacen): boolean {
  return a.tipo === "disco_interno" || a.tipo === "neurona";
}

/**
 * Cuenta cuántos cerebros/partes fundamentales hay en el manifiesto.
 */
function contarFundamentales(manifiesto?: ManifiestoAlmacen): number {
  if (!manifiesto) return 0;
  let count = manifiesto.cerebros.length;
  for (const [, modalidad] of Object.entries(manifiesto.partes)) {
    // No sabemos la modalidad de la carpeta aquí, asumimos fundamental si está en partes
    count++;
  }
  return count;
}

/**
 * Verifica si hay datos fundamentales solo en este almacén extraíble
 * (comparando con otros almacenes de la neurona).
 */
function esUnicaCopiaFundamentalEnExtraible(
  almacen: Almacen,
  manifiesto: ManifiestoAlmacen | undefined,
  otrosAlmacenes: Almacen[] = []
): boolean {
  if (!esExtraible(almacen)) return false;
  if (!manifiesto) return false;

  const fundamentales = cerebrosEnManifiesto(manifiesto).length +
    Object.keys(manifiesto.partes).length;

  if (fundamentales === 0) return false;

  // Verificar si otros almacenes online tienen copias de los mismos cerebros
  for (const otro of otrosAlmacenes) {
    if (!otro.medidas.enLinea) continue;
    if (otro.idVolumen === almacen.idVolumen) continue;
    // Simplificación: si hay otro almacén online con espacio, asumimos que podría tener copia
    if (otro.medidas.libreBytes > BigInt(0)) return false;
  }

  return true;
}

/**
 * Sugiere la modalidad para un almacén basándose en sus medidas y contenido.
 * Función pura: misma entrada → misma salida.
 */
export function sugerirModalidadAlmacen(entrada: EntradaSugerencia): SugerenciaAlmacen {
  const { almacen, manifiesto, otrosAlmacenes = [] } = entrada;
  const m = almacen.medidas;
  const razones: string[] = [];
  const advertencias: string[] = [];
  const carpetasSugeridas: Record<string, ModalidadCarpeta> = {};

  // Clasificaciones base
  const velocidad = clasificarVelocidad(m);
  const espacio = clasificarEspacio(m);
  const salud = evaluarSalud(m);
  const uso = calcularUso(m);
  const extraible = esExtraible(almacen);
  const sistema = esSistema(almacen);
  const online = m.enLinea;

  let modalidadSugerida: ModalidadAlmacen = "secundario";
  let confianza = 0.5;

  // --- Reglas de decisión ---

  // 1. Si está offline, no se puede usar para nada activo
  if (!online) {
    modalidadSugerida = "secundario";
    razones.push("Almacén fuera de línea: solo secundario (datos regenerables).");
    confianza = 0.9;
    return { modalidadSugerida, carpetasSugeridas, razones, advertencias, confianza };
  }

  // 2. Salud crítica → solo secundario con aviso fuerte
  if (salud === "mala") {
    modalidadSugerida = "secundario";
    advertencias.push(
      `⚠️ Salud ${m.salud}: NO usar para datos fundamentales. Solo cachés, compilaciones, pesados regenerables.`
    );
    razones.push("Salud crítica o desconocida: solo modo secundario.");
    confianza = 0.95;
  }
  // 3. Neurona/nodo de la malla → neurona-nodo (ANTES que sistema, porque esSistema(neurona)=true)
  else if (almacen.tipo === "neurona" || almacen.tipo === "nodo") {
    modalidadSugerida = "neurona-nodo";
    razones.push("Neurona/nodo de la malla: ofrece capacidad a otras neuronas.");
    confianza = 0.85;
  }
  // 4. Disco del sistema → cerebro-completo o parte (nunca secundario si hay espacio)
  else if (sistema) {
    if (espacio === "amplio" && velocidad !== "lento") {
      modalidadSugerida = "cerebro-completo";
      razones.push("Disco interno con espacio amplio y buena velocidad: ideal para cerebro completo.");
      confianza = 0.9;
    } else if (espacio === "moderado") {
      modalidadSugerida = "parte";
      razones.push("Disco interno con espacio moderado: lleva partes del cerebro.");
      confianza = 0.8;
    } else {
      modalidadSugerida = "secundario";
      razones.push("Disco interno casi lleno: solo secundario (cachés, pesados).");
      confianza = 0.7;
    }
  }
  // 5. Extraíble rápido (SSD USB 3+) con espacio → respaldo-vivo o cerebro-completo
  else if (extraible && velocidad === "rapido" && espacio !== "escaso") {
    if (espacio === "amplio") {
      modalidadSugerida = "respaldo-vivo";
      razones.push("SSD extraíble rápido y amplio: respaldo vivo (se actualiza solo al conectarse).");
      confianza = 0.85;
    } else {
      modalidadSugerida = "parte";
      razones.push("SSD extraíble rápido pero espacio moderado: parte de un cerebro.");
      confianza = 0.75;
    }
  }
  // 6. Extraíble medio (USB 3.0 HDD, SATA) → respaldo o parte
  else if (extraible && velocidad === "medio") {
    if (espacio === "amplio") {
      modalidadSugerida = "respaldo-vivo";
      razones.push("Disco extraíble medio y amplio: respaldo vivo programado.");
      confianza = 0.7;
    } else {
      modalidadSugerida = "parte";
      razones.push("Disco extraíble medio: parte de un cerebro o réplica.");
      confianza = 0.65;
    }
  }
  // 7. Extraíble lento (USB 2.0, SD, HDD viejo) → solo secundario o réplica
  else if (extraible && velocidad === "lento") {
    modalidadSugerida = "secundario";
    razones.push("Medio extraíble lento: solo secundario (cachés, compilaciones, réplicas frías).");
    confianza = 0.8;
    if (espacio === "amplio") {
      razones.push("Pero tiene espacio amplio: puede servir como réplica independiente (copia congelada).");
    }
  }
  // 8. Red (NAS, servidor) → neurona-nodo o respaldo-vivo
  else if (almacen.tipo === "red") {
    if (velocidad === "rapido" && espacio === "amplio") {
      modalidadSugerida = "neurona-nodo";
      razones.push("NAS/servidor rápido y amplio: ofrece capacidad a la malla (neurona-nodo).");
      confianza = 0.8;
    } else {
      modalidadSugerida = "respaldo-vivo";
      razones.push("Almacén de red: respaldo vivo programado.");
      confianza = 0.7;
    }
  }
  // 9. Nube → respaldo-vivo
  else if (almacen.tipo === "nube") {
    modalidadSugerida = "respaldo-vivo";
    razones.push("Almacén en nube: respaldo vivo (sincronización programada).");
    confianza = 0.7;
  }

  // --- Ajustes por contenido actual (manifiesto) ---

  if (manifiesto) {
    const validacion = validarManifiestoAlmacen(manifiesto);
    if (!validacion.valido) {
      advertencias.push(`Manifiesto inválido: ${validacion.errores.join("; ")}`);
      confianza *= 0.5;
    }

    const cerebros = manifiesto.cerebros.length;
    const partes = Object.keys(manifiesto.partes).length;
    const fundamentales = cerebros + partes; // Simplificación

    if (fundamentales > 0) {
      // Si ya tiene cerebros completos, mantener esa modalidad
      if (cerebros > 0 && modalidadSugerida !== "cerebro-completo") {
        modalidadSugerida = "cerebro-completo";
        razones.push(`Ya contiene ${cerebros} cerebro(s) completo(s): modalidad cerebro-completo.`);
        confianza = Math.max(confianza, 0.9);
      }
      // Si tiene partes, modalidad parte o respaldo-vivo
      else if (partes > 0) {
        if (modalidadSugerida === "secundario") {
          modalidadSugerida = "parte";
          razones.push(`Contiene ${partes} parte(s): modalidad parte.`);
          confianza = Math.max(confianza, 0.8);
        }
      }

      // Regla de 2 copias: avisar si extraíble es única copia
      if (esUnicaCopiaFundamentalEnExtraible(almacen, manifiesto, otrosAlmacenes)) {
        advertencias.push(
          `⚠️ Este medio extraíble es la ÚNICA copia de ${fundamentales} dato(s) fundamental(es). ` +
          `Conecte otro medio o active un respaldo vivo en otro almacén.`
        );
        confianza *= 0.7;
      }
    }
  }

  // --- Sugerencias por carpeta (si hay partes en el manifiesto) ---
  if (manifiesto && Object.keys(manifiesto.partes).length > 0) {
    for (const [ruta, cerebroId] of Object.entries(manifiesto.partes)) {
      // Heurística simple: carpetas del cerebro → parte o respaldo-vivo
      if (ruta.startsWith("/cerebros/") || ruta.startsWith("/privado/")) {
        carpetasSugeridas[ruta] = "parte";
      } else if (ruta === "/respaldos" || ruta.startsWith("/respaldos/") || ruta === "/backup" || ruta.startsWith("/backup/")) {
        carpetasSugeridas[ruta] = "respaldo-vivo";
      } else if (ruta.startsWith("/desarrollo/") || ruta.startsWith("/cache/") || ruta.startsWith("/build/")) {
        carpetasSugeridas[ruta] = "secundario";
      } else {
        carpetasSugeridas[ruta] = "parte";
      }
    }
  }

  return { modalidadSugerida, carpetasSugeridas, razones, advertencias, confianza };
}

/**
 * Sugiere cómo acomodar (distribuir) los datos entre varios almacenes.
 * Devuelve un plan de qué va dónde.
 */
export interface PlanAcomodo {
  /** Por almacén: qué modalidad y qué carpetas/cerebros. */
  porAlmacen: Array<{
    almacenId: string;
    almacenNombre: string;
    modalidad: ModalidadAlmacen;
    cerebros: string[];
    carpetas: Record<string, ModalidadCarpeta>;
    razones: string[];
  }>;
  /** Advertencias globales (regla de 2 copias, salud, etc.). */
  advertenciasGlobales: string[];
  /** Resumen legible. */
  resumen: string;
}

/**
 * Genera un plan de acomodo para un conjunto de almacenes.
 * Función pura: misma entrada → misma salida.
 */
export function sugerirPlanAcomodo(almacenes: Almacen[], manifiestos: Map<string, ManifiestoAlmacen>): PlanAcomodo {
  const porAlmacen: PlanAcomodo["porAlmacen"] = [];
  const advertenciasGlobales: string[] = [];
  const cerebrosVistos = new Set<string>();
  const partesVistas = new Map<string, Set<string>>(); // cerebroId -> Set<ruta>

  // Primero, recopilar qué hay en cada almacén
  for (const almacen of almacenes) {
    const manifiesto = manifiestos.get(almacen.idVolumen);
    const entrada: EntradaSugerencia = { almacen, manifiesto, otrosAlmacenes: almacenes.filter(a => a.idVolumen !== almacen.idVolumen) };
    const sugerencia = sugerirModalidadAlmacen(entrada);

    const cerebros: string[] = [];
    const carpetas: Record<string, ModalidadCarpeta> = {};

    if (manifiesto) {
      for (const c of manifiesto.cerebros) {
        cerebros.push(c);
        cerebrosVistos.add(c);
      }
      for (const [ruta, cerebroId] of Object.entries(manifiesto.partes)) {
        const modalidad = sugerencia.carpetasSugeridas[ruta] ?? "parte";
        carpetas[ruta] = modalidad;
        if (!partesVistas.has(cerebroId)) partesVistas.set(cerebroId, new Set());
        partesVistas.get(cerebroId)!.add(ruta);
      }
    }

    porAlmacen.push({
      almacenId: almacen.idVolumen,
      almacenNombre: almacen.nombre,
      modalidad: sugerencia.modalidadSugerida,
      cerebros,
      carpetas,
      razones: sugerencia.razones,
    });

    // Acumular advertencias
    for (const a of sugerencia.advertencias) {
      if (!advertenciasGlobales.includes(a)) advertenciasGlobales.push(a);
    }
  }

  // Verificar regla de 2 copias global
  for (const cerebroId of cerebrosVistos) {
    const almacenesConCerebro = porAlmacen.filter(p => p.cerebros.includes(cerebroId));
    if (almacenesConCerebro.length === 1) {
      const a = almacenesConCerebro[0];
      const esExtraibleAlmacen = almacenes.find(x => x.idVolumen === a.almacenId)?.tipo === "extraible";
      if (esExtraibleAlmacen) {
        advertenciasGlobales.push(
          `⚠️ Cerebro «${cerebroId}» solo en medio extraíble (${a.almacenNombre}). ` +
          `Requiere al menos 2 copias en medios distintos.`
        );
      } else {
        advertenciasGlobales.push(
          `Cerebro «${cerebroId}» solo tiene 1 copia (${a.almacenNombre}). ` +
          `Se recomienda al menos 2 copias en medios distintos.`
        );
      }
    } else if (almacenesConCerebro.length >= 2) {
      // Verificar que estén en medios físicos distintos
      const tiposUnicos = new Set(
        almacenesConCerebro.map(p => {
          const alm = almacenes.find(x => x.idVolumen === p.almacenId);
          return alm?.tipo ?? "desconocido";
        })
      );
      if (tiposUnicos.size === 1) {
        const tipo = [...tiposUnicos][0];
        advertenciasGlobales.push(
          `Cerebro «${cerebroId}» tiene ${almacenesConCerebro.length} copias pero todas en ${tipo}. ` +
          `Se requieren medios físicos distintos.`
        );
      }
    }
  }

  // Verificar partes
  for (const [cerebroId, rutas] of partesVistas) {
    for (const ruta of rutas) {
      const copias = porAlmacen.filter(p => p.carpetas[ruta]);
      if (copias.length === 1) {
        const a = copias[0];
        const alm = almacenes.find(x => x.idVolumen === a.almacenId);
        if (alm?.tipo === "extraible" && esFundamental(a.carpetas[ruta])) {
          advertenciasGlobales.push(
            `⚠️ Carpeta «${ruta}» (${cerebroId}) solo en extraíble (${a.almacenNombre}). ` +
            `Dato fundamental requiere 2 copias en medios distintos.`
          );
        }
      }
    }
  }

  // Resumen
  const totalAlmacenes = almacenes.length;
  const online = almacenes.filter(a => a.medidas.enLinea).length;
  const conCerebros = porAlmacen.filter(p => p.cerebros.length > 0).length;
  const conPartes = porAlmacen.filter(p => Object.keys(p.carpetas).length > 0).length;
  const resumen = `${totalAlmacenes} almacenes (${online} en línea), ${conCerebros} con cerebros completos, ${conPartes} con partes. ` +
    `${advertenciasGlobales.length} advertencia(s).`;

  return { porAlmacen, advertenciasGlobales, resumen };
}

/**
 * Verifica si una modalidad es compatible con el tipo de almacén.
 * Por ejemplo, un USB lento no debería ser "cerebro-completo".
 */
export function esModalidadCompatible(
  modalidad: ModalidadAlmacen,
  almacen: Almacen
): { compatible: boolean; motivo?: string } {
  const vel = clasificarVelocidad(almacen.medidas);
  const espacio = clasificarEspacio(almacen.medidas);
  const extraible = esExtraible(almacen);
  const salud = evaluarSalud(almacen.medidas);

  if (salud === "mala" && modalidad !== "secundario") {
    return { compatible: false, motivo: `Salud ${almacen.medidas.salud}: solo admite modalidad "secundario".` };
  }

  if (extraible && vel === "lento" && modalidad === "cerebro-completo") {
    return { compatible: false, motivo: "Medio extraíble lento: no recomendado para cerebro completo (rendimiento)." };
  }

  if (extraible && vel === "lento" && modalidad === "respaldo-vivo") {
    return { compatible: false, motivo: "Medio extraíble lento: respaldo vivo sería muy lento; use 'replica' o 'secundario'." };
  }

  if (espacio === "escaso" && (modalidad === "cerebro-completo" || modalidad === "respaldo-vivo")) {
    return { compatible: false, motivo: "Espacio escaso: no cabe cerebro completo ni respaldo vivo." };
  }

  if (!almacen.medidas.enLinea && modalidad !== "secundario") {
    return { compatible: false, motivo: "Almacén fuera de línea: solo modalidad 'secundario' disponible." };
  }

  return { compatible: true };
}

/**
 * Obtiene una descripción legible de una modalidad.
 */
export function describirModalidad(modalidad: ModalidadAlmacen): string {
  const descripciones: Record<ModalidadAlmacen, string> = {
    "cerebro-completo": "Cerebro completo: lleva un cerebro entero (privado o de grupo). Al conectarlo, se abre con su desbloqueo.",
    "parte": "Parte de un cerebro: carpetas o capas concretas. El cerebro sabe dónde está cada parte; si el medio no está en línea, se muestra «fuera de línea».",
    "replica": "Réplica independiente: copia congelada en un momento, no se sincroniza.",
    "respaldo-vivo": "Respaldo vivo: copia que se pone al día sola (tiempo real, al conectarse, programada o a mano) con versiones.",
    "neurona-nodo": "Neurona/nodo almacén: ofrece capacidad a la malla (privada, grupo, comunidad o pública).",
    "secundario": "Secundario: datos útiles pero regenerables (cachés, compilaciones, pesados del desarrollo).",
  };
  return descripciones[modalidad];
}