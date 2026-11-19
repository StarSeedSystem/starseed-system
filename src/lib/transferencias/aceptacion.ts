/**
 * aceptacion — qué hacer con lo que LLEGA por la malla (FMT1119 · 2026-11-19).
 * Libre y segura: todo formato se admite; se pregunta siempre, salvo que la persona haya encendido
 * «aceptar sin preguntar» para ESA neurona reconocida (de una desconocida nunca se auto-acepta). Si se
 * eligió analizar, queda en cuarentena hasta el resultado; un análisis de peligro vuelve a preguntar.
 */

export type TipoEnvio = "archivo" | "carpeta" | "sincronizacion-cerebro";
export type NivelRiesgo = "limpio" | "aviso" | "peligro";
export interface NeuronaOrigen {
  id: string;
  nombre: string;
  /** Ya vinculada y reconocida por la persona. Una desconocida nunca se auto-acepta. */
  reconocida: boolean;
}
export interface SolicitudAceptacion {
  tipoEnvio: TipoEnvio;
  nombre: string;
  tamano: number;
  /** Tipo declarado por el remitente (MIME) y tipo real por los bytes, si ya se leyó. */
  tipo?: string | null;
  tipoReal?: string | null;
  neurona: NeuronaOrigen;
  /** Por dónde llegó: «red local», «malla de la cuenta», «Bluetooth»… */
  via: string;
  analisisSolicitado?: boolean;
  analisisHecho?: boolean;
  nivelRiesgo?: NivelRiesgo | null;
}
export interface PreferenciasAceptacion {
  /** neuronaId → «aceptar sin preguntar». Ausente = apagado. */
  aceptarSinPreguntar: Readonly<Record<string, boolean>>;
  /** neuronaId → «analizar siempre lo que llegue de ella». Ausente = apagado. */
  analizarSiempre: Readonly<Record<string, boolean>>;
  /** Defecto de la cuenta para analizar todo lo recibido. Apagado por defecto. */
  analizarSiempreCuenta?: boolean;
}
export type DecisionAceptacion = "aceptar" | "preguntar";
export interface ResultadoAceptacion {
  decision: DecisionAceptacion;
  /** Frase para la tarjeta, en español neutro. */
  motivo: string;
  /** true si Astraura ofrecerá analizar (toca hacerlo o ya se hizo). */
  pedirAnalisis: boolean;
  /** No se puede abrir todavía: falta aceptar o falta el análisis elegido. */
  enCuarentena: boolean;
}
/** Ajustes de fábrica: nada se auto-acepta y nada se analiza solo. Puro. */
export function preferenciasPorDefecto(): PreferenciasAceptacion {
  return { aceptarSinPreguntar: {}, analizarSiempre: {}, analizarSiempreCuenta: false };
}
/** Enciende o apaga «aceptar sin preguntar» para UNA neurona, sin mutar. Puro. */
export function conAceptarSinPreguntar(p: PreferenciasAceptacion, neuronaId: string, activo: boolean): PreferenciasAceptacion {
  return { ...p, aceptarSinPreguntar: { ...p.aceptarSinPreguntar, [neuronaId]: activo } };
}
/** Enciende o apaga «analizar siempre» para UNA neurona, sin mutar. Puro. */
export function conAnalizarSiempre(p: PreferenciasAceptacion, neuronaId: string, activo: boolean): PreferenciasAceptacion {
  return { ...p, analizarSiempre: { ...p.analizarSiempre, [neuronaId]: activo } };
}
/** Solo si la neurona es reconocida y su ajuste está encendido. Puro. */
export function puedeAceptarSinPreguntar(p: PreferenciasAceptacion, neurona: NeuronaOrigen): boolean {
  return neurona.reconocida === true && p.aceptarSinPreguntar[neurona.id] === true;
}
/** Solo si la persona lo pidió o lo dejó activado (neurona o cuenta). Puro. */
export function debeAnalizar(s: SolicitudAceptacion, p: PreferenciasAceptacion): boolean {
  return s.analisisSolicitado === true || p.analizarSiempre[s.neurona.id] === true || p.analizarSiempreCuenta === true;
}

/** Decisión de aceptación. Ningún formato se rechaza: como mucho se pregunta. Puro. */
export function decidirAceptacion(s: SolicitudAceptacion, p: PreferenciasAceptacion): ResultadoAceptacion {
  const pedirAnalisis = debeAnalizar(s, p);
  const peligro = s.analisisHecho === true && s.nivelRiesgo === "peligro";
  const auto = puedeAceptarSinPreguntar(p, s.neurona);
  let decision: DecisionAceptacion = "preguntar";
  let motivo = "Neurona reconocida, pero «aceptar sin preguntar» está apagado para ella.";
  if (!s.neurona.reconocida) motivo = "Neurona desconocida: siempre se pregunta antes de aceptar.";
  else if (peligro) motivo = "El análisis de Astraura encontró señales de peligro: decide tú si lo aceptas.";
  else if (auto) {
    decision = "aceptar";
    motivo = `Neurona reconocida (${s.neurona.nombre}) con «aceptar sin preguntar» activado.`;
  }
  const enCuarentena = decision === "preguntar" || (pedirAnalisis && s.analisisHecho !== true);
  return { decision, motivo, pedirAnalisis, enCuarentena };
}
/** Solo tras aceptar y, si se eligió analizar, con el análisis hecho. Puro. */
export function puedeAbrir(r: ResultadoAceptacion): boolean {
  return r.decision === "aceptar" && !r.enCuarentena;
}
/** Cómo se llama lo que llega, para la tarjeta. Puro. */
export function etiquetaMedio(tipo: TipoEnvio): string {
  if (tipo === "carpeta") return "Carpeta";
  if (tipo === "sincronizacion-cerebro") return "Sincronización de cerebro";
  return "Archivo";
}

/** Tamaño en unidades decimales, con coma y sin decimales de más. Puro. */
export function tamanoLegible(bytes: number): string {
  let n = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) {
    n /= 1000;
    i++;
  }
  const v = i === 0 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${String(v).replace(".", ",")} ${u[i]}`;
}
/** Las líneas que ve la persona antes de decidir: nombre, tamaño, tipo real, origen y medio. Puro. */
export function describirSolicitud(s: SolicitudAceptacion): string[] {
  const tipoReal = s.tipoReal && s.tipoReal.trim() ? s.tipoReal : "sin leer (por determinar)";
  const declarado = s.tipo && s.tipo.trim() ? ` (declarado ${s.tipo})` : "";
  const origen = s.neurona.reconocida ? "neurona reconocida" : "neurona desconocida";
  return [
    `Nombre: ${s.nombre}`,
    `Tamaño: ${tamanoLegible(s.tamano)}`,
    `Tipo real: ${tipoReal}${declarado}`,
    `Origen: ${s.neurona.nombre} (${origen})`,
    `Medio: ${etiquetaMedio(s.tipoEnvio)} · ${s.via}`,
  ];
}
