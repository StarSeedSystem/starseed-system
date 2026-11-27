// Preferencias de NFC por relación y por neurona concreta (contrato: architecture/nfc-neuronas.md §3 y §4).
// Módulo puro: sin red, disco ni Node. Todas las funciones devuelven datos nuevos, nunca mutan.

/** Catálogo de acciones (§4). */
export const ACCIONES = [
  "anadir_contacto", "mandar_mensaje", "enviar_archivo", "enviar_cerebro", "crear_grupo", "invitar_grupo",
  "compartir_capacidades", "compartir_almacenamiento", "compartir_senales", "compartir_internet",
  "vincular_capa", "control_remoto", "acceso_cerebros", "registrar_entrada_evento", "abrir_oferta_nodo",
  "registrar_ubicacion",
] as const;
export type Accion = (typeof ACCIONES)[number];

export const RELACIONES = [
  "misma_cuenta", "cuenta_reconocida", "cuenta_nueva", "nodo_propio", "nodo_publico", "etiqueta",
] as const;
export type Relacion = (typeof RELACIONES)[number];

export type PerfilVisible = "mostrar" | "ocultar" | "pedir";
export type AvisoEncuentro = "notificar" | "silenciar";
export type UbicacionEncuentro = "privada" | "publica" | "no";

export interface PreferenciasRelacion {
  perfil: PerfilVisible;
  automaticas: Accion[];
  ofrecidas: Accion[];
  aviso: AvisoEncuentro;
  ubicacion: UbicacionEncuentro;
  sugerenciasAstraura: boolean;
}

export interface PreferenciasNfc {
  version: 1;
  porRelacion: Record<Relacion, PreferenciasRelacion>;
  /** Excepciones por neurona concreta: solo pisan los campos que traen. */
  porNeurona: Record<string, Partial<PreferenciasRelacion>>;
  ignoradas: string[];
  /** Neuronas recordadas: pasan a «cuenta reconocida» si eran de otra cuenta nueva. */
  recordadas: string[];
}

/** Acciones que mueven datos o dan poder: nunca automáticas con cuentas ajenas ni con lo desconocido. */
export const ACCIONES_SENSIBLES: readonly Accion[] = [
  "enviar_archivo", "enviar_cerebro", "compartir_capacidades", "compartir_almacenamiento", "compartir_senales",
  "compartir_internet", "vincular_capa", "control_remoto", "acceso_cerebros", "crear_grupo", "invitar_grupo",
];
/** Solo la misma cuenta (o un nodo propio) puede ofrecer control remoto y acceso a cerebros. */
export const ACCIONES_SOLO_PROPIAS: readonly Accion[] = ["control_remoto", "acceso_cerebros"];
const AUTO_AJENAS_SEGURAS: readonly Accion[] = ["anadir_contacto", "registrar_ubicacion", "abrir_oferta_nodo"];

const esPropia = (r: Relacion) => r === "misma_cuenta" || r === "nodo_propio";
const unicas = (a: readonly Accion[]): Accion[] => ACCIONES.filter((x) => a.includes(x));

/** Valores por defecto seguros (§3): con otras cuentas nada automático; sugerencias solo con la misma cuenta. */
export function porDefectoRelacion(r: Relacion): PreferenciasRelacion {
  const base: PreferenciasRelacion = { perfil: "pedir", automaticas: [], ofrecidas: [], aviso: "notificar", ubicacion: "no", sugerenciasAstraura: false };
  switch (r) {
    case "misma_cuenta":
      return { ...base, perfil: "mostrar", sugerenciasAstraura: true, ofrecidas: [...ACCIONES].filter((a) => a !== "registrar_entrada_evento") };
    case "nodo_propio":
      return { ...base, perfil: "mostrar", ofrecidas: ["abrir_oferta_nodo", "registrar_ubicacion", "compartir_capacidades", "control_remoto"] };
    case "cuenta_reconocida":
      return { ...base, perfil: "mostrar", ofrecidas: ["anadir_contacto", "mandar_mensaje", "enviar_archivo", "invitar_grupo"] };
    case "cuenta_nueva":
      return { ...base, ofrecidas: ["anadir_contacto", "mandar_mensaje"] };
    case "nodo_publico":
      return { ...base, ofrecidas: ["abrir_oferta_nodo", "registrar_entrada_evento", "registrar_ubicacion"] };
    case "etiqueta":
      return { ...base, perfil: "ocultar", ofrecidas: ["abrir_oferta_nodo"] };
  }
}

export function preferenciasPorDefecto(): PreferenciasNfc {
  const porRelacion = {} as Record<Relacion, PreferenciasRelacion>;
  for (const r of RELACIONES) porRelacion[r] = porDefectoRelacion(r);
  return { version: 1, porRelacion, porNeurona: {}, ignoradas: [], recordadas: [] };
}

/** Aplica las reglas de seguridad: lo que una relación ajena no puede tener, se quita siempre. */
export function sanear(r: Relacion, p: PreferenciasRelacion): PreferenciasRelacion {
  const ofrecidas = unicas(p.ofrecidas).filter((a) => esPropia(r) || !ACCIONES_SOLO_PROPIAS.includes(a));
  let auto = unicas(p.automaticas).filter((a) => ofrecidas.includes(a));
  if (r === "cuenta_nueva" || r === "nodo_publico" || r === "etiqueta") auto = [];
  else if (!esPropia(r)) auto = auto.filter((a) => AUTO_AJENAS_SEGURAS.includes(a));
  return { ...p, ofrecidas, automaticas: auto, sugerenciasAstraura: esPropia(r) ? p.sugerenciasAstraura : false };
}

/** Preferencias efectivas para una relación y, si se da, una neurona concreta (la excepción manda, saneada). */
export function resolver(prefs: PreferenciasNfc, relacion: Relacion, neuronaId?: string): PreferenciasRelacion {
  const base = prefs.porRelacion[relacion] ?? porDefectoRelacion(relacion);
  const excepcion = neuronaId ? prefs.porNeurona[neuronaId] : undefined;
  return sanear(relacion, { ...base, ...(excepcion ?? {}) });
}

export const esIgnorada = (prefs: PreferenciasNfc, neuronaId: string): boolean => prefs.ignoradas.includes(neuronaId);
export const esRecordada = (prefs: PreferenciasNfc, neuronaId: string): boolean => prefs.recordadas.includes(neuronaId);

/** Una cuenta nueva que se recordó cuenta como «reconocida» a partir de entonces. */
export function relacionEfectiva(prefs: PreferenciasNfc, relacion: Relacion, neuronaId: string): Relacion {
  return relacion === "cuenta_nueva" && esRecordada(prefs, neuronaId) ? "cuenta_reconocida" : relacion;
}

const sinEste = (l: string[], id: string) => l.filter((x) => x !== id);

export function establecerRelacion(prefs: PreferenciasNfc, r: Relacion, cambios: Partial<PreferenciasRelacion>): PreferenciasNfc {
  return { ...prefs, porRelacion: { ...prefs.porRelacion, [r]: sanear(r, { ...prefs.porRelacion[r], ...cambios }) } };
}

export function establecerExcepcion(prefs: PreferenciasNfc, neuronaId: string, cambios: Partial<PreferenciasRelacion>): PreferenciasNfc {
  return { ...prefs, porNeurona: { ...prefs.porNeurona, [neuronaId]: { ...prefs.porNeurona[neuronaId], ...cambios } } };
}

export function quitarExcepcion(prefs: PreferenciasNfc, neuronaId: string): PreferenciasNfc {
  const { [neuronaId]: _quitada, ...resto } = prefs.porNeurona;
  return { ...prefs, porNeurona: resto };
}

export function ignorar(prefs: PreferenciasNfc, neuronaId: string): PreferenciasNfc {
  return { ...prefs, ignoradas: [...sinEste(prefs.ignoradas, neuronaId), neuronaId] };
}

export function dejarDeIgnorar(prefs: PreferenciasNfc, neuronaId: string): PreferenciasNfc {
  return { ...prefs, ignoradas: sinEste(prefs.ignoradas, neuronaId) };
}

/** Recordar y ignorar se excluyen: recordar saca a la neurona de la lista de ignoradas. */
export function recordar(prefs: PreferenciasNfc, neuronaId: string): PreferenciasNfc {
  return { ...prefs, recordadas: [...sinEste(prefs.recordadas, neuronaId), neuronaId], ignoradas: sinEste(prefs.ignoradas, neuronaId) };
}

export function olvidar(prefs: PreferenciasNfc, neuronaId: string): PreferenciasNfc {
  return { ...prefs, recordadas: sinEste(prefs.recordadas, neuronaId) };
}
