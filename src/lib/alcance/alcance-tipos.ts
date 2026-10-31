// Alcance del agente de imaginación (INV1025O): tipos compartidos entre el
// panel de Genesis, el almacén privado de objetivos y la evaluación de envío.
// Módulo puro, apto para cliente: nada de node:*. (INV1025P: vista del panel
// y seguimiento de respuestas; `seguimiento-respuestas.ts` también es puro.)
import type { EstadoSeguimiento } from "@/lib/mail/seguimiento-respuestas";
// (re-export para cliente: el tipo vive en el módulo puro del correo)
export type { EstadoSeguimiento };

/** Medio por el que sale un mensaje del alcance. `red` jamás se automatiza. */
export type MedioAlcance =
  | "correo-propio"
  | "correo-usuario"
  | "formulario"
  | "github"
  | "red";

/** Ciclo de vida de un envío de alcance. */
export type EstadoEnvio =
  | "pendiente"
  | "aprobada"
  | "enviada"
  | "respondida"
  | "sin-respuesta"
  | "rebotada"
  | "no-contactar";

/** Importancia del objetivo: sin dato se trata como alto (R8). */
export type NivelAlcance = "alto" | "medio" | "bajo";

/** Objetivo del alcance tal y como lo ve la evaluación de envío. */
export interface DestinoAlcance {
  /** Referencia opaca obj-…: nunca la dirección en memoria pública (R5). */
  id: string;
  nombrePublico: string;
  nivel: NivelAlcance;
  medio: MedioAlcance;
  /** Canal que la propia entidad publica. Vacío si no lo hay (R1). */
  canalPublicado: string;
}

/** Un envío ya salido, tal y como queda en el registro de envíos. */
export interface EnvioPrevio {
  destinoId: string;
  fecha: string;
  estado: EstadoEnvio;
  /** true cuando el envío fue el recordatorio único a los N días. */
  recordatorio: boolean;
}

/** Límites y ajustes del alcance. El automático nace apagado y sin validar. */
export interface AjustesAlcance {
  automatico: { activo: boolean; validado: boolean };
  limite_diario: number;
  recordatorio_dias: number;
  pausa_rechazo_dias: number;
  pausa_no_contactar_dias: number;
}

export const AJUSTES_DEFECTO: AjustesAlcance = {
  automatico: { activo: false, validado: false },
  limite_diario: 5,
  recordatorio_dias: 14,
  pausa_rechazo_dias: 90,
  pausa_no_contactar_dias: 180,
};

/** Pie del mensaje: identidad real del remitente y forma de no recibir más. */
export interface PieAlcance {
  identidad: string;
  baja: string;
}

/** Propuesta del alcance tal y como la muestra y aprueba Genesis. */
export interface PropuestaAlcance {
  id: string;
  medio: MedioAlcance;
  asunto: string;
  cuerpo: string;
  enlaces: string[];
  pie: PieAlcance;
  estado: "esperando-aprobacion" | "aprobada";
  /** true solo cuando aprobó una persona: los agentes no mueven esto (R2). */
  aprobadaPorHumano: boolean;
  /** Huella SHA-256 del texto tal y como se aprobó; si el texto cambia, caduca. */
  huellaAprobada: string;
  /** true si este envío lo sacaría el automático (solo nivel bajo y correo-propio). */
  automatico: boolean;
  /** true si este envío es el recordatorio único a los N días. */
  recordatorio: boolean;
}

/** Resultado de la última comprobación de un enlace del mensaje. */
export interface EnlaceVerificado {
  url: string;
  codigo: number;
  verificadoEn: string;
}

/** Confirmación escrita: solo vale si la puso una persona (R2). */
export interface ConfirmacionEscrita {
  texto: string;
  porPersona: boolean;
}

/** Entrada completa de evaluarEnvio: reloj y registros inyectados. */
export interface EntradaEnvio {
  propuesta: PropuestaAlcance;
  destino: DestinoAlcance;
  ajustes?: AjustesAlcance;
  registro: EnvioPrevio[];
  suprimidos: string[];
  ahora: Date;
  enlaces: EnlaceVerificado[];
  confirmacion: ConfirmacionEscrita;
}

/** Veredicto: puede salir solo si no hay ni un motivo. */
export interface VeredictoEnvio {
  puede: boolean;
  motivos: string[];
}

/* ── INV1025P · Panel de Genesis y servidor del envío (tipos compartidos) ── */

/** Canal de contacto tal y como lo guarda el almacén privado (R5). */
export interface CanalContacto {
  medio?: string;
  valor?: string;
  fuente_url?: string;
}

/** Objetivo privado (`~/.starseed/alcance/objetivos.json`). Sin nivel se trata como alto (R8). */
export interface ObjetivoPrivado {
  id?: string;
  nombre_publico?: string;
  nivel?: string;
  canal_contacto?: CanalContacto | null;
}

/** Ficha privada (`~/.starseed/alcance/fichas/<obj>.json`), la que el agente construyó. */
export interface FichaPrivada {
  obj_id?: string;
  nombre_publico?: string;
  canal_oficial?: CanalContacto | null;
  tono?: string;
}

/** Objetivo resuelto para evaluar y para PINTAR (la dirección solo se muestra, nunca se guarda). */
export interface DestinoResuelto {
  /** Referencia opaca del objetivo (obj-…). */
  id: string;
  nombrePublico: string;
  nivel: NivelAlcance;
  medio: MedioAlcance;
  /** Canal que la propia entidad publicó: correo o https (vacío si no hay: R1). */
  canalPublicado: string;
}

const MEDIOS: MedioAlcance[] = ["correo-propio", "correo-usuario", "formulario", "github", "red"];
const NIVELES: NivelAlcance[] = ["alto", "medio", "bajo"];

/** Objetivo + ficha ≫ lo que el envío y el panel necesitan de él. PURA. */
export function resolverDestino(o: ObjetivoPrivado | null, f: FichaPrivada | null): DestinoResuelto {
  const objetivo = typeof o === "object" && o !== null ? o : {};
  const ficha = typeof f === "object" && f !== null ? f : {};
  const canal = ficha.canal_oficial && typeof ficha.canal_oficial === "object" ? ficha.canal_oficial : (objetivo.canal_contacto && typeof objetivo.canal_contacto === "object" ? objetivo.canal_contacto : null);
  const valor = `${canal && typeof canal.valor === "string" ? canal.valor : ""}`.trim();
  const fuente = `${canal && typeof canal.fuente_url === "string" ? canal.fuente_url : ""}`.trim();
  const canalPublicado = valor || (fuente.startsWith("https://") ? fuente : "");
  const tipoMedio = `${canal && typeof canal.medio === "string" ? canal.medio : ""}`.trim();
  const nivel = NIVELES.includes(`${objetivo.nivel}`.trim().toLowerCase() as NivelAlcance)
    ? (`${objetivo.nivel}`.trim().toLowerCase() as NivelAlcance)
    : "alto";
  const medio =
    tipoMedio && MEDIOS.includes(tipoMedio as MedioAlcance)
      ? (tipoMedio as MedioAlcance)
      : /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/.test(canalPublicado)
        ? "correo-usuario"
        : canalPublicado.startsWith("https://")
          ? "formulario"
          : "correo-propio";
  return {
    id: `${objetivo.id || ficha.obj_id || ""}`.trim(),
    nombrePublico: `${objetivo.nombre_publico || ficha.nombre_publico || ""}`.trim().slice(0, 120),
    nivel,
    medio,
    canalPublicado,
  };
}

/** Vista que devuelve GET /api/mando/alcance?id=… para montar el panel de alcance. */
export interface VistaAlcance {
  id: string;
  titular: string;
  asunto: string;
  cuerpo: string;
  medio: MedioAlcance;
  /** Firma honesta del remitente (R7); vive en variables de entorno, nunca se guarda. */
  remitente: string;
  /** Dirección/canal resuelto SOLO para mostrarlo en la confirmación (R5). */
  destinatario: string;
  /** Canal público para copiar/abrir en medios no de correo (formulario, github, red). */
  destinoUrl: string;
  /** Estado de la propuesta de imaginación (esperando-aprobacion, aprobada, rechazada…). */
  estadoPropuesta: string;
  /** Estado del envío: pendiente · aprobada · enviada · respondida · sin-respuesta · rebotada · no-contactar. */
  envio: EstadoEnvio;
  aprobada: boolean;
  huellaAprobada: string;
  enlaces: EnlaceVerificado[];
  suprimido: boolean;
  seguimiento: EstadoSeguimiento;
  /** Por qué aún no puede salir, con la confirmación ya sobreentendida. */
  motivos: string[];
}

/** Estado de seguimiento de un envío, mapeado desde el estado del alcance. PURA. */
export function seguimientoDe(envio: EstadoEnvio): EstadoSeguimiento {
  switch (envio) {
    case "enviada":
    case "sin-respuesta":
      return "esperando";
    default:
      return "resuelto";
  }
}
