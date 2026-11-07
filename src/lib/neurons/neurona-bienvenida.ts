/*
 * neurona-bienvenida — las reglas de la ventana «Esta neurona» tras iniciar sesión (NEU1107B · 2026-11-07).
 * Contrato: architecture/neurona-bienvenida.md.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Alex: «en las versiones instaladas, después de iniciar sesión falta una ventana: que detecte si el
 * aparato ya tiene un registro de neurona de otro medio donde inició sesión y sugiera fusionarlas, y
 * que ofrezca editar los ajustes básicos: el nombre y la función principal de la neurona, sus capas de
 * conciencia, sus medios de transmisión preferidos y más».
 *
 * Aquí, PURO (sin red, sin DOM; el almacenamiento llega como texto):
 *   · cuándo se abre sola: UNA vez por cuenta × aparato, solo en las apps instaladas (escritorio y
 *     Android); en la web y la app web instalada solo a mano (`decidirBienvenida`);
 *   · el registro local de «ya vista» (no viaja con la cuenta: es de este aparato);
 *   · la carga de la fusión que se manda (`planFusionBienvenida`): qué id se queda, cuáles se absorben
 *     y con qué nombre; valida que no se fusione nada que la persona no eligió;
 *   · el borrador de ajustes básicos y el resumen de lo que cambia (`resumenCambios`).
 * Las acciones (leer la cuenta, fusionar, guardar) están en `neurona-bienvenida-acciones.ts`.
 */

import type { NeuronKind, NeuronRole } from "@/lib/neurons/neurons";
import type { CapaConciencia } from "@/lib/astraura/capas-conciencia";
import type { MedioTransmision, PreferenciasMedio } from "@/lib/mensajeria/medios/tipos";
import type { Medio } from "@/lib/actualizaciones/version-por-medio";

/** Registro local (este aparato) de cuentas que ya vieron la ventana. Fuera de SYNCED_KEYS a propósito. */
export const CLAVE_BIENVENIDA_NEURONA = "starseed.neurona.bienvenida.v1";
/** Abre la ventana a mano desde cualquier parte (Ajustes › Neuronas › Esta neurona, Aurora…). */
export const EVENTO_ABRIR_BIENVENIDA_NEURONA = "starseed:abrir-bienvenida-neurona";
/** Medios en los que se abre sola tras iniciar sesión. */
export const MEDIOS_AUTOMATICOS: readonly Medio[] = ["escritorio", "android"];

export type PasoBienvenida = "fusion" | "ajustes" | "resumen";
export type ResultadoBienvenida = "completada" | "omitida";

export interface RegistroBienvenida {
  v: 1;
  /** uid → cuándo se vio, con qué neurona y cómo terminó. */
  cuentas: Record<string, { ts: number; neurona: string; resultado: ResultadoBienvenida }>;
}

const VACIO: RegistroBienvenida = { v: 1, cuentas: {} };

/** Lee el registro (o basura) y devuelve uno válido. Pura. */
export function leerRegistroBienvenida(crudo: string | null | undefined): RegistroBienvenida {
  if (!crudo) return { v: 1, cuentas: {} };
  try {
    const o = JSON.parse(crudo) as Partial<RegistroBienvenida> | null;
    const cuentas: RegistroBienvenida["cuentas"] = {};
    if (o && typeof o === "object" && o.cuentas && typeof o.cuentas === "object") {
      for (const [uid, r] of Object.entries(o.cuentas)) {
        if (!uid || uid.length > 80 || !r || typeof r !== "object") continue;
        const ts = typeof r.ts === "number" && Number.isFinite(r.ts) ? r.ts : 0;
        const resultado: ResultadoBienvenida = r.resultado === "omitida" ? "omitida" : "completada";
        cuentas[uid] = { ts, neurona: typeof r.neurona === "string" ? r.neurona.slice(0, 80) : "", resultado };
      }
    }
    return { v: 1, cuentas };
  } catch {
    return { ...VACIO, cuentas: {} };
  }
}

/** El registro con esta cuenta marcada como vista. Pura. */
export function conBienvenidaVista(
  reg: RegistroBienvenida,
  uid: string,
  neurona: string,
  resultado: ResultadoBienvenida,
  ahora: number,
): RegistroBienvenida {
  if (!uid) return reg;
  return { v: 1, cuentas: { ...reg.cuentas, [uid]: { ts: ahora, neurona, resultado } } };
}

/** ¿Esta cuenta ya vio la ventana en este aparato? Pura. */
export function bienvenidaVista(reg: RegistroBienvenida, uid: string | null | undefined): boolean {
  return !!uid && !!reg.cuentas[uid];
}

/* ───────────────────────────── Cuándo se abre ───────────────────────────── */

export interface EntradaDecisionBienvenida {
  uid: string | null;
  /** Medio de este aparato (`leerInstalada().medio`); null si no se sabe. */
  medio: Medio | null;
  registro: RegistroBienvenida;
  /** Hay neuronas de la cuenta que parecen este aparato (`detectarDuplicadas`). */
  hayCandidatas: boolean;
  /** Esta neurona ya tiene sus ajustes básicos hechos (marca de «configurada»). */
  configurada: boolean;
  /** La abrió la persona (botón): se enseña siempre que haya sesión. */
  manual: boolean;
}

export type MotivoNoBienvenida = "sin-sesion" | "medio-no-automatico" | "ya-vista" | "configurada";

export type DecisionBienvenida =
  | { mostrar: false; motivo: MotivoNoBienvenida }
  | { mostrar: true; pasos: PasoBienvenida[] };

/**
 * ¿Se abre la ventana y con qué pasos? Pura.
 *  · a mano: siempre (con sesión); el paso de fusión solo si hay candidatas;
 *  · sola: solo en escritorio y Android, una vez por cuenta × aparato;
 *  · sin candidatas: solo los ajustes, y ni eso si la neurona ya estaba configurada.
 */
export function decidirBienvenida(e: EntradaDecisionBienvenida): DecisionBienvenida {
  if (!e.uid) return { mostrar: false, motivo: "sin-sesion" };
  const pasos: PasoBienvenida[] = e.hayCandidatas ? ["fusion", "ajustes", "resumen"] : ["ajustes", "resumen"];
  if (e.manual) return { mostrar: true, pasos };
  if (!e.medio || !MEDIOS_AUTOMATICOS.includes(e.medio)) return { mostrar: false, motivo: "medio-no-automatico" };
  if (bienvenidaVista(e.registro, e.uid)) return { mostrar: false, motivo: "ya-vista" };
  if (!e.hayCandidatas && e.configurada) return { mostrar: false, motivo: "configurada" };
  return { mostrar: true, pasos };
}

/* ───────────────────────────── La fusión que se manda ───────────────────────────── */

export interface EntradaPlanFusion {
  /** Id de ESTA neurona. */
  yo: string;
  /** Las que la persona dejó marcadas. */
  seleccionadas: readonly string[];
  /** El id que se queda. */
  principal: string;
  /** El nombre que se queda. */
  nombre: string;
  /** Las candidatas que se enseñaron (nada fuera de aquí se fusiona). */
  ofrecidas: readonly string[];
}

export interface PlanFusionBienvenida {
  principal: string;
  absorbidas: string[];
  nombre: string;
  /** Este medio pasará a usar otro id (el que se queda no es el suyo): hay que recargar al final. */
  esteMedioCambiaDeId: boolean;
}

export const NOMBRE_MAX = 60;

/** Nombre limpio: sin caracteres de control, espacios colapsados, como mucho 60. Pura. */
export function limpiarNombre(n: string | null | undefined): string {
  return String(n ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NOMBRE_MAX)
    .trim();
}

/** Valida y arma la carga de la fusión. Pura. */
export function planFusionBienvenida(e: EntradaPlanFusion): { ok: true; plan: PlanFusionBienvenida } | { ok: false; motivo: string } {
  const ofrecidas = new Set(e.ofrecidas);
  const elegidas = Array.from(new Set(e.seleccionadas.filter((id) => id && id !== e.yo)));
  if (!e.yo) return { ok: false, motivo: "Esta neurona aún no tiene id: espera un momento y vuelve a intentarlo." };
  if (elegidas.length === 0) return { ok: false, motivo: "Marca al menos una neurona para fusionarla con esta." };
  const ajena = elegidas.find((id) => !ofrecidas.has(id));
  if (ajena) return { ok: false, motivo: "Solo se pueden fusionar las neuronas que aparecen en la lista." };
  const grupo = [e.yo, ...elegidas];
  if (!grupo.includes(e.principal)) return { ok: false, motivo: "La neurona que se queda tiene que ser esta o una de las marcadas." };
  const nombre = limpiarNombre(e.nombre);
  if (!nombre) return { ok: false, motivo: "Ponle un nombre a la neurona que se queda." };
  return {
    ok: true,
    plan: {
      principal: e.principal,
      absorbidas: grupo.filter((id) => id !== e.principal),
      nombre,
      esteMedioCambiaDeId: e.principal !== e.yo,
    },
  };
}

/* ───────────────────────────── Ajustes básicos ───────────────────────────── */

export interface BorradorAjustes {
  nombre: string;
  /** Función principal (`NeuronSettings.role`). */
  funcion: NeuronRole;
  /** Capas de conciencia de Astraura (de la cuenta: valen en todas las neuronas). */
  capas: Record<CapaConciencia, boolean>;
  /** Motor 1.58 local en ESTA neurona (`NeuronSettings.astraura158.enabled`). */
  motorLocal: boolean;
  /** false = usa los medios generales de Mensajería. */
  mediosPropios: boolean;
  /** Medios de transmisión preferidos de esta neurona, en orden. */
  medios: PreferenciasMedio;
  /** Escucha de fondo de Aurora (`auroraListening`, efectiva en apps instaladas). */
  escuchaFondo: boolean;
  /** Presta su procesador (`permissions.compute`). */
  compartirComputo: boolean;
  /** Guarda copias para las demás (`permissions.storage`). */
  compartirAlmacen: boolean;
  /** Acepta «Solicitar archivo a esta neurona» (`fileRequests`). */
  solicitudesArchivos: boolean;
  /** Comparte sus carpetas con tus neuronas (NAS de la app nativa). null = este medio no lo sabe. */
  nas: boolean | null;
  /** Es la neurona elegida para las actualizaciones «automática solo en esta neurona». */
  actualizaPrimero: boolean;
  /** Icono (tipo de aparato) con el que se ve en las listas. */
  icono: NeuronKind;
}

export const FUNCIONES: readonly { id: NeuronRole; titulo: string; texto: string }[] = [
  { id: "ambos", titulo: "Cerebro y servidor", texto: "Piensa con Aurora y sirve archivos y servicios a tus otras neuronas (recomendado)." },
  { id: "cerebro", titulo: "Cerebro", texto: "Cómputo y contexto: IA local, sentidos y conversación. Recibe de la red." },
  { id: "servidor", titulo: "Servidor", texto: "Almacén y servicios: guarda y sirve archivos, memorias y modelos a las demás." },
];

export const ICONOS: readonly { id: NeuronKind; titulo: string }[] = [
  { id: "desktop", titulo: "Ordenador" },
  { id: "laptop", titulo: "Portátil" },
  { id: "mobile", titulo: "Móvil" },
  { id: "tablet", titulo: "Tableta" },
  { id: "server", titulo: "Servidor" },
  { id: "other", titulo: "Otro" },
];

const NOMBRE_CAPA: Record<CapaConciencia, string> = { local: "Local", mesh: "Mesh", nube: "Nube", colectiva: "Colectiva" };
const ORDEN_CAPAS: readonly CapaConciencia[] = ["local", "mesh", "nube", "colectiva"];

function siNo(b: boolean): string {
  return b ? "sí" : "no";
}

function textoMedios(p: PreferenciasMedio, nombres: Readonly<Record<MedioTransmision, string>>): string {
  if (p.modo === "auto") return "automático";
  const lista = p.elegidos.map((m) => nombres[m] ?? m);
  return lista.length ? lista.join(" → ") : "automático";
}

function mismasPreferencias(a: PreferenciasMedio, b: PreferenciasMedio): boolean {
  return a.modo === b.modo && a.siNinguno === b.siNinguno && a.elegidos.join("|") === b.elegidos.join("|");
}

/**
 * Lo que cambia entre el borrador inicial y el final, en frases cortas para el resumen. Pura.
 * `nombresMedio`: nombre corto de cada medio (INFO_MEDIOS[m].corto).
 */
export function resumenCambios(
  antes: BorradorAjustes,
  despues: BorradorAjustes,
  nombresMedio: Readonly<Record<MedioTransmision, string>>,
): string[] {
  const out: string[] = [];
  if (limpiarNombre(antes.nombre) !== limpiarNombre(despues.nombre)) out.push(`Nombre: «${limpiarNombre(despues.nombre)}»`);
  if (antes.funcion !== despues.funcion) out.push(`Función principal: ${FUNCIONES.find((f) => f.id === despues.funcion)?.titulo ?? despues.funcion}`);
  const capas = ORDEN_CAPAS.filter((c) => antes.capas[c] !== despues.capas[c]);
  if (capas.length) out.push(`Capas de conciencia: ${capas.map((c) => `${NOMBRE_CAPA[c]} ${despues.capas[c] ? "encendida" : "apagada"}`).join(", ")}`);
  if (antes.motorLocal !== despues.motorLocal) out.push(`Motor 1.58 local en esta neurona: ${siNo(despues.motorLocal)}`);
  if (antes.mediosPropios !== despues.mediosPropios || (despues.mediosPropios && !mismasPreferencias(antes.medios, despues.medios))) {
    out.push(
      despues.mediosPropios
        ? `Medios de transmisión de esta neurona: ${textoMedios(despues.medios, nombresMedio)}`
        : "Medios de transmisión: los generales de Mensajería",
    );
  }
  if (antes.escuchaFondo !== despues.escuchaFondo) out.push(`Escucha de fondo de Aurora: ${siNo(despues.escuchaFondo)}`);
  if (antes.compartirComputo !== despues.compartirComputo) out.push(`Prestar su procesador: ${siNo(despues.compartirComputo)}`);
  if (antes.compartirAlmacen !== despues.compartirAlmacen) out.push(`Guardar copias para tus neuronas: ${siNo(despues.compartirAlmacen)}`);
  if (antes.solicitudesArchivos !== despues.solicitudesArchivos) out.push(`Aceptar solicitudes de archivos: ${siNo(despues.solicitudesArchivos)}`);
  if (antes.nas !== despues.nas && despues.nas !== null) out.push(`Compartir carpetas (NAS) con tus neuronas: ${siNo(despues.nas)}`);
  if (antes.actualizaPrimero !== despues.actualizaPrimero) {
    out.push(despues.actualizaPrimero ? "Recibe primero las actualizaciones automáticas" : "Ya no recibe primero las actualizaciones");
  }
  if (antes.icono !== despues.icono) out.push(`Icono: ${ICONOS.find((i) => i.id === despues.icono)?.titulo ?? despues.icono}`);
  return out;
}

/** Un id corto para enseñar («62d50afc…»). Pura. */
export function idCorto(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}
