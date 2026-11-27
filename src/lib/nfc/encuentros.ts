// Encuentros NFC: del resultado de `decidir` a la hoja «Cerca de ti», el registro de Señales y la notificación
// (contrato: architecture/nfc-neuronas.md §4 y §6). Módulo puro: sin red, disco ni Node. Funciona sin conexión.

import type { DecisionEncuentro } from "./decidir";
import type { Accion, Relacion } from "./preferencias";
import type { ViaAcercar } from "./respaldo";

/** Etiquetas legibles de cada acción del catálogo (§4). */
export const ETIQUETA_ACCION: Record<Accion, string> = {
  anadir_contacto: "Añadir a contactos",
  mandar_mensaje: "Mandar mensaje",
  enviar_archivo: "Enviar archivo o folder",
  enviar_cerebro: "Enviar cerebro",
  crear_grupo: "Crear grupo con los presentes",
  invitar_grupo: "Invitar a grupo o comunidad",
  compartir_capacidades: "Compartir capacidades",
  compartir_almacenamiento: "Compartir almacenamiento",
  compartir_senales: "Compartir señales",
  compartir_internet: "Compartir internet",
  vincular_capa: "Vincular capa de conciencia",
  control_remoto: "Control remoto",
  acceso_cerebros: "Acceso a cerebros",
  registrar_entrada_evento: "Registrar entrada al evento",
  abrir_oferta_nodo: "Abrir la oferta del nodo",
  registrar_ubicacion: "Registrar ubicación",
};

export const ETIQUETA_RELACION: Record<Relacion, string> = {
  misma_cuenta: "Tu cuenta",
  cuenta_reconocida: "Cuenta reconocida",
  cuenta_nueva: "Cuenta nueva",
  nodo_propio: "Nodo propio",
  nodo_publico: "Nodo público",
  etiqueta: "Etiqueta pasiva",
};

export const ETIQUETA_VIA: Record<ViaAcercar, string> = { nfc: "NFC", ble: "Bluetooth", qr: "Código QR" };

/** Botones fijos que acompañan siempre a la hoja y a la notificación (§3: ignorar y recordar). */
export type AccionFija = "ignorar" | "recordar";

export interface BotonEncuentro {
  id: Accion | AccionFija;
  etiqueta: string;
  tipo: "accion" | "fija";
}

/** Un encuentro guardado en el registro de Señales. */
export interface RegistroEncuentro {
  id: string;
  neuronaId: string;
  relacion: Relacion;
  via: ViaAcercar;
  en: number; // ms desde epoch
  automaticas: Accion[];
  ofrecidas: Accion[];
  /** Acciones ya resueltas por el usuario o por la regla: queda el rastro auditable. */
  hechas: Accion[];
  ubicacion: "privada" | "publica" | "no";
}

export const MAX_REGISTRO = 100;

/** Botones de la hoja y de la notificación: las ofrecidas más ignorar y recordar (recordar solo si no es propia). */
export function botonesDe(d: DecisionEncuentro): BotonEncuentro[] {
  const botones: BotonEncuentro[] = d.ofrecidas.map((a) => ({ id: a, etiqueta: ETIQUETA_ACCION[a], tipo: "accion" }));
  botones.push({ id: "ignorar", etiqueta: "Ignorar", tipo: "fija" });
  if (d.relacion === "cuenta_nueva" || d.relacion === "nodo_publico") {
    botones.push({ id: "recordar", etiqueta: "Recordar", tipo: "fija" });
  }
  return botones;
}

/** Frase que dice qué se hizo solo, para que nada automático pase en silencio. */
export function resumenAutomaticas(d: DecisionEncuentro): string {
  if (d.automaticas.length === 0) return "";
  return "Hecho automáticamente: " + d.automaticas.map((a) => ETIQUETA_ACCION[a].toLowerCase()).join(", ") + ".";
}

/** Texto de la notificación de un encuentro; `null` si no debe salir (ignorada o silenciada). */
export function textoNotificacion(d: DecisionEncuentro, via: ViaAcercar): { titulo: string; cuerpo: string } | null {
  if (!d.mostrar || d.aviso === "silenciar") return null;
  const quien = d.perfil.tipo === "completo" ? d.perfil.cuenta.valor : "una neurona";
  const partes = [`${ETIQUETA_RELACION[d.relacion]} · vía ${ETIQUETA_VIA[via]}`, resumenAutomaticas(d)].filter(Boolean);
  return { titulo: `Cerca de ti: ${quien}`, cuerpo: partes.join(". ") };
}

/** Crea el registro del encuentro; la ubicación solo se guarda si las preferencias lo permiten. */
export function registrarEncuentro(d: DecisionEncuentro, neuronaId: string, via: ViaAcercar, en: number): RegistroEncuentro {
  return {
    id: `${neuronaId}@${en}`,
    neuronaId,
    relacion: d.relacion,
    via,
    en,
    automaticas: [...d.automaticas],
    ofrecidas: [...d.ofrecidas],
    hechas: [...d.automaticas],
    ubicacion: d.ubicacion,
  };
}

/** Añade al registro (el más nuevo primero, sin repetir id, con tope). No muta. */
export function anadirAlRegistro(registro: readonly RegistroEncuentro[], nuevo: RegistroEncuentro): RegistroEncuentro[] {
  return [nuevo, ...registro.filter((r) => r.id !== nuevo.id)].slice(0, MAX_REGISTRO);
}

/** Marca una acción como hecha (idempotente) y la saca de las pendientes. */
export function marcarHecha(registro: readonly RegistroEncuentro[], id: string, accion: Accion): RegistroEncuentro[] {
  return registro.map((r) =>
    r.id !== id || r.hechas.includes(accion) ? r : { ...r, hechas: [...r.hechas, accion] },
  );
}

/** Línea del registro de Señales: la vía que tomó y cuántas acciones se hicieron. */
export function lineaRegistro(r: RegistroEncuentro): string {
  const hora = new Date(r.en).toISOString().slice(11, 16);
  return `${hora} · ${ETIQUETA_RELACION[r.relacion]} · vía ${ETIQUETA_VIA[r.via]} · ${r.hechas.length} hecha(s)`;
}
