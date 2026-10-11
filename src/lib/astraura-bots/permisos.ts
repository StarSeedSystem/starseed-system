/**
 * Bots/dots de Astraura · PERMISOS (BOT1011). Contrato: architecture/astraura-bots.md §5–§7.
 *
 * Tres preguntas y una tabla cada una, para que nadie las estropee por accidente:
 *   1. ¿Puede este bot usar este SENTIDO ahora? (habilitado por el dueño + consentimiento de la
 *      persona cuyos datos son + medio + sesión). Si sí, el indicador visible es OBLIGATORIO.
 *   2. ¿Puede hacer esta ACCIÓN? (nivel de confianza, rol, gobierno de la entidad, riesgo).
 *   3. ¿Qué MEMORIA ve y dónde escribe? (alcance-memoria: personal › perfil › grupo › pública).
 * Regla de oro: los bots invitados y los de grupo NUNCA leen memoria personal. PURO y sin reloj.
 */
import { alcanceVisiblePara, puedeEscribirEn, type ActorMemoria, type AlcanceMemoria } from "@/lib/nucleo/alcance-memoria";
import { META_ACCION, type AccionBot } from "./acciones";
import {
  SENTIDOS_INTIMOS, esBotDeEntidad, esInvitado,
  type Bot, type ConsentimientoSentido, type Medio, type RolBot, type Sentido, type TipoSesion,
} from "./tipos";

export type Requisito = "nada" | "consentimiento" | "expreso" | "confirmacion" | "votacion" | "configuracion" | "nunca";
export interface Decision {
  permitido: boolean;
  requiere: Requisito;
  motivo: string;
  /** Si el sentido queda activo, la orbe DEBE enseñar su indicador mientras dure. */
  indicador: boolean;
}

const no = (requiere: Requisito, motivo: string): Decision => ({ permitido: false, requiere, motivo, indicador: false });
const si = (motivo: string, indicador = false): Decision => ({ permitido: true, requiere: "nada", motivo, indicador });

/* ── 1 · Sentidos ────────────────────────────────────────────────────────── */

/** Lo que un invitado (externo o AG-UI) no recibe nunca, ni con permiso: solo ve lo que le pasas. */
export const NUNCA_INVITADO: readonly Sentido[] = [
  "captura-pantalla", "archivos", "correo", "terminal", "camara", "microfono", "sensores",
  "ubicacion", "portapapeles", "aparatos",
];
/** A un invitado se le da permiso por un rato, nunca «para siempre». */
export const VIGENCIA_MAX_INVITADO_MS = 60 * 60 * 1000;
const SOLO_NATIVO: readonly Sentido[] = ["terminal"];

export interface PeticionSentido {
  bot: Bot;
  sentido: Sentido;
  /** Persona cuyos datos tocaría el sentido (la que está delante de ese aparato). */
  cuentaId: string;
  sesion: TipoSesion;
  medio: Medio;
  consentimientos: readonly ConsentimientoSentido[];
  ahora: number;
}

export function consentimientoVigente(
  cs: readonly ConsentimientoSentido[], botId: string, sentido: Sentido, cuentaId: string, ahora: number,
): ConsentimientoSentido | null {
  return cs.find((c) => c.botId === botId && c.sentido === sentido && c.cuentaId === cuentaId &&
    (c.vence === null || c.vence > ahora)) ?? null;
}

export function decidirSentido(p: PeticionSentido): Decision {
  const { bot, sentido } = p;
  if (!bot.activo) return no("configuracion", `«${bot.nombre}» está en pausa.`);
  if (!bot.sentidosHabilitados.includes(sentido)) {
    return no("configuracion", `Quien administra «${bot.nombre}» no le habilitó «${sentido}».`);
  }
  if (SOLO_NATIVO.includes(sentido) && p.medio !== "nativo") {
    return no("nunca", "La terminal del aparato solo existe en la app nativa.");
  }
  const invitado = esInvitado(bot);
  if (invitado && NUNCA_INVITADO.includes(sentido)) {
    return no("nunca", `Un bot invitado nunca recibe «${sentido}»: solo lo que tú le pases.`);
  }
  if (sentido === "terminal" && esBotDeEntidad(bot)) {
    return no("nunca", "Un bot de grupo o página no usa la terminal de tu aparato: tiene su propia computadora aislada.");
  }
  const c = consentimientoVigente(p.consentimientos, bot.id, sentido, p.cuentaId, p.ahora);
  if (!c) return no("consentimiento", `«${bot.nombre}» necesita TU permiso para usar «${sentido}».`);
  if (invitado && (c.vence === null || c.vence - p.ahora > VIGENCIA_MAX_INVITADO_MS)) {
    return no("consentimiento", "A un invitado se le da permiso por una hora como mucho.");
  }
  if (p.sesion === "publica" && sentido !== "red" && !c.expreso) {
    return no("expreso", "En una sesión pública hace falta tu permiso expreso para cada sentido.");
  }
  const intimo = SENTIDOS_INTIMOS.includes(sentido);
  return si(intimo ? `Permitido con tu consentimiento; el indicador queda encendido.` : "Permitido.", true);
}

/* ── 2 · Acciones ────────────────────────────────────────────────────────── */

/**
 * Cuánto confía la persona en el bot (como `ui-permisos.ts`). Decisión de Alex (2026-10-11): por
 * defecto el bot personal hace SOLO lo de riesgo bajo (navegar, abrir apps, capas sobre la pantalla…)
 * y lo demás lo propone; todo queda en el registro con su deshacer.
 */
export type NivelBot = "nada" | "proponer" | "aplicar-bajo" | "aplicar";
export const NIVEL_POR_DEFECTO: NivelBot = "aplicar-bajo";
/**
 * Decisión de Alex (2026-10-11): al crear el bot común de un grupo democrático, el grupo le delega
 * por defecto lo de riesgo bajo (organizar y mover sin votar cada vez); publicar, borrar o gastar se
 * vota siempre. El grupo puede quitar la delegación: sin ella (`delegado` ausente) todo se vota.
 */
export const DELEGACION_POR_DEFECTO_GRUPO: "bajo" | "medio" = "bajo";

export interface PeticionAccion {
  bot: Bot;
  accion: AccionBot;
  rol: RolBot;
  nivel: NivelBot;
  /**
   * Riesgo máximo que una votación del grupo DELEGÓ en su bot (p. ej. «mover widgets sin votar»).
   * Sin delegación, en un grupo democrático todo cambio de lo común se vota.
   */
  delegado?: "bajo" | "medio";
}
const ORDEN_RIESGO = { bajo: 0, medio: 1, alto: 2 } as const;

export function decidirAccion(p: PeticionAccion): Decision {
  const { bot, accion, rol, nivel } = p;
  const meta = META_ACCION[accion.tipo];
  if (!bot.activo) return no("configuracion", `«${bot.nombre}» está en pausa.`);
  if (nivel === "nada") return no("configuracion", "Este bot no tiene permiso para actuar: solo conversa.");
  const invitado = esInvitado(bot);
  if (invitado && !meta.invitado) return no("nunca", `Un bot invitado no puede «${accion.tipo}».`);
  if ((rol === "observador" || rol === "invitado") && meta.persistente) {
    return no("nunca", "Con tu papel puedes mirar y proponer en el chat, no cambiar lo compartido.");
  }
  if (esBotDeEntidad(bot) && meta.persistente) {
    const delegado = p.delegado !== undefined && ORDEN_RIESGO[meta.riesgo] <= ORDEN_RIESGO[p.delegado];
    if (bot.gobierno === "democratico" && !delegado) return no("votacion", "Es de todos: lo decide una votación del grupo.");
    if (bot.gobierno === "jerarquico" && rol !== "dueno" && rol !== "admin") {
      return no("confirmacion", "Lo aprueba quien administra el grupo o la página.");
    }
  }
  if (meta.riesgo === "alto") return no("confirmacion", "Acción de riesgo alto: siempre se confirma.");
  if (invitado || nivel === "proponer") return no("confirmacion", "El bot lo propone; tú lo confirmas.");
  if (nivel === "aplicar-bajo" && meta.riesgo !== "bajo") {
    return no("confirmacion", "Por ahora solo hace lo de riesgo bajo: esto lo propone y tú lo confirmas.");
  }
  return si(`Permitido: «${bot.nombre}» puede aplicar «${accion.tipo}» y queda en el registro con su deshacer.`);
}

/* ── 3 · Memoria ─────────────────────────────────────────────────────────── */

/** El bot como actor de `alcance-memoria`: invitado → público; de entidad → grupo; de perfil → personal. */
export function actorDeBot(bot: Bot): ActorMemoria {
  if (esInvitado(bot)) return { tipo: "agente-publico" };
  if (esBotDeEntidad(bot)) return { tipo: "agente-grupo", grupoId: bot.dueno.id };
  return { tipo: "agente-personal" };
}

export function memoriaVisible(bot: Bot): AlcanceMemoria[] {
  return alcanceVisiblePara(actorDeBot(bot));
}

/**
 * ¿Puede leer un recuerdo de este alcance? Lo personal y del perfil, además, solo si es de la
 * MISMA cuenta que el bot (un bot personal no lee la memoria de otra persona).
 */
export function puedeLeerMemoria(bot: Bot, alcance: AlcanceMemoria, cuentaDelRecuerdo: string): boolean {
  if (!memoriaVisible(bot).includes(alcance)) return false;
  if (alcance === "personal" || alcance === "perfil") return cuentaDelRecuerdo === bot.dueno.cuentaId;
  return true;
}

export function puedeEscribirMemoria(bot: Bot, alcance: AlcanceMemoria): boolean {
  return puedeEscribirEn(actorDeBot(bot), alcance);
}

/* ── 4 · Gobierno: quién configura el bot ────────────────────────────────── */

export type CambioBot = "personalidad" | "cuerpo" | "sentidos" | "permisos" | "modelo" | "pausar" | "borrar";

export function decidirConfiguracion(bot: Bot, rol: RolBot, cambio: CambioBot): Decision {
  if (!esBotDeEntidad(bot)) {
    return rol === "dueno" ? si("Es tu bot.") : no("nunca", "Solo su dueño configura un bot personal.");
  }
  if (rol === "observador" || rol === "invitado") return no("nunca", "Tu papel no configura el bot del grupo.");
  // Freno de seguridad: cualquier miembro puede PAUSAR (salida siempre); reanudar sigue el gobierno.
  if (cambio === "pausar") return rol === "miembro" ? no("confirmacion", "Pausar para todos se confirma; queda en el registro.") : si("Pausado.");
  if (bot.gobierno === "democratico") return no("votacion", `Cambiar «${cambio}» del bot común se vota.`);
  if (rol === "dueno" || rol === "admin") {
    return cambio === "borrar" ? no("confirmacion", "Borrar exige copia previa y confirmación.") : si("Lo administras tú.");
  }
  return no("confirmacion", "Lo aprueba quien administra el grupo o la página.");
}
