/**
 * Selector de medio de transmisión de la llamada (LLA1108C) — PURO.
 * «Automático» deja decidir al planificador unificado; un medio concreto se respeta si puede llevar el
 * tipo de llamada. Si el elegido deja de estar disponible a mitad de llamada, se RE-RUTA (para que no se
 * corte) y se dice por qué en español claro. Contrato: `architecture/llamadas-telefonia.md` §4.
 */
import type { TipoSuperficie } from "./maquina";

export type MedioLlamada = "automatico" | "red-local" | "wifi-directo" | "cuenta" | "turn" | "bluetooth";

export const ETIQUETA_MEDIO: Record<MedioLlamada, string> = {
  automatico: "Automático",
  "red-local": "Red local",
  "wifi-directo": "Wi‑Fi directo",
  cuenta: "Cuenta (servidor)",
  turn: "Relé TURN",
  bluetooth: "Bluetooth",
};

/**
 * Lo que cada medio puede llevar HOY. (LLA1111A/H) Bluetooth SÍ lleva la voz (por el enlace de datos) y el vídeo ligero de
 * baja resolución: funciona entre la Mac y la tableta desde la prueba.32. La pantalla compartida NO cabe por Bluetooth
 * (la llamada la sube sola a Wi‑Fi directo si se permite). Va el último en el orden de recambio porque es el más estrecho.
 */
const LLEVA: Record<Exclude<MedioLlamada, "automatico">, { tiempoReal: boolean; pantalla: boolean; video: boolean }> = {
  "red-local": { tiempoReal: true, pantalla: true, video: true },
  "wifi-directo": { tiempoReal: true, pantalla: true, video: true },
  cuenta: { tiempoReal: true, pantalla: true, video: true },
  turn: { tiempoReal: true, pantalla: true, video: true },
  bluetooth: { tiempoReal: true, pantalla: false, video: true },
};

export function medioPuedeLlevar(medio: Exclude<MedioLlamada, "automatico">, tipo: TipoSuperficie): { ok: boolean; motivo?: string } {
  const c = LLEVA[medio];
  if (!c.tiempoReal) {
    return { ok: false, motivo: `${ETIQUETA_MEDIO[medio]} no puede llevar voz ni vídeo en tiempo real; solo mensajes y archivos.` };
  }
  if ((tipo === "video" || tipo === "vivo") && !c.video) return { ok: false, motivo: `${ETIQUETA_MEDIO[medio]} no lleva vídeo.` };
  if (tipo === "pantalla" && !c.pantalla) return { ok: false, motivo: `${ETIQUETA_MEDIO[medio]} no lleva la pantalla compartida: no cabe.${medio === "bluetooth" ? " La voz y el vídeo ligero sí van por Bluetooth." : ""}` };
  return { ok: true };
}

export interface OpcionMedio {
  medio: MedioLlamada;
  etiqueta: string;
  /** Se puede elegir ahora. */
  disponible: boolean;
  /** Por qué sí o por qué no, en español llano. */
  motivo: string;
}

/** `hay`: medios que ahora mismo tienen un enlace utilizable con la otra parte. */
export function opcionesMedio(tipo: TipoSuperficie, hay: Partial<Record<Exclude<MedioLlamada, "automatico">, boolean>>): OpcionMedio[] {
  const lista: OpcionMedio[] = [
    { medio: "automatico", etiqueta: ETIQUETA_MEDIO.automatico, disponible: true, motivo: "El planificador elige el mejor medio disponible y cambia solo si se cae." },
  ];
  for (const m of Object.keys(LLEVA) as Array<Exclude<MedioLlamada, "automatico">>) {
    const c = medioPuedeLlevar(m, tipo);
    const esta = !!hay[m];
    lista.push({
      medio: m,
      etiqueta: ETIQUETA_MEDIO[m],
      disponible: c.ok && esta,
      motivo: !c.ok ? (c.motivo as string) : esta ? (m === "bluetooth" ? "Disponible con esta persona: voz y vídeo ligero (baja resolución)." : "Disponible con esta persona.") : "No hay enlace por este medio ahora mismo.",
    });
  }
  return lista;
}

export interface DecisionMedio {
  /** Medio con el que seguir. */
  usar: MedioLlamada;
  /** Hay que renegociar la ruta (ICE restart / abrir el otro enlace) para cambiarlo. */
  reRutar: boolean;
  /** Se respetó lo pedido; si es false se volvió a automático. */
  respetado: boolean;
  /** Frase para la persona. */
  texto: string;
}

/** Qué hacer cuando la persona pide `pedido` (o cuando el medio actual se cae) con la llamada en curso. */
export function decidirMedio(e: {
  pedido: MedioLlamada;
  actual: Exclude<MedioLlamada, "automatico"> | null;
  tipo: TipoSuperficie;
  hay: Partial<Record<Exclude<MedioLlamada, "automatico">, boolean>>;
  /** Medio que el planificador elegiría solo ahora. */
  sugerido: Exclude<MedioLlamada, "automatico"> | null;
}): DecisionMedio {
  if (e.pedido === "automatico") {
    const m = e.sugerido;
    return {
      usar: "automatico",
      reRutar: !!m && m !== e.actual,
      respetado: true,
      texto: m ? `Automático: ahora va por ${ETIQUETA_MEDIO[m].toLowerCase()}, el mejor medio disponible.` : "Automático: no hay ningún medio disponible ahora; se reintentará.",
    };
  }
  const c = medioPuedeLlevar(e.pedido, e.tipo);
  if (!c.ok) {
    return { usar: "automatico", reRutar: false, respetado: false, texto: `${c.motivo} La llamada sigue por ${e.actual ? ETIQUETA_MEDIO[e.actual].toLowerCase() : "el medio actual"}.` };
  }
  if (!e.hay[e.pedido]) {
    return {
      usar: "automatico",
      reRutar: false,
      respetado: false,
      texto: `No hay enlace por ${ETIQUETA_MEDIO[e.pedido].toLowerCase()} ahora; la llamada sigue por ${e.actual ? ETIQUETA_MEDIO[e.actual].toLowerCase() : "el medio actual"} y no se corta.`,
    };
  }
  return { usar: e.pedido, reRutar: e.pedido !== e.actual, respetado: true, texto: `Fijado en ${ETIQUETA_MEDIO[e.pedido].toLowerCase()}; si se cae, la llamada vuelve a automático para no cortarse.` };
}

/** El medio fijado se cayó a mitad de llamada: ¿a qué se pasa? Siempre se intenta mantener la llamada viva. */
export function alCaerMedio(e: { fijado: MedioLlamada; hay: Partial<Record<Exclude<MedioLlamada, "automatico">, boolean>>; tipo: TipoSuperficie }): DecisionMedio {
  if (e.fijado !== "automatico" && e.hay[e.fijado]) {
    return { usar: e.fijado, reRutar: false, respetado: true, texto: "El medio sigue disponible." };
  }
  const alterno = (Object.keys(LLEVA) as Array<Exclude<MedioLlamada, "automatico">>).find((m) => e.hay[m] && medioPuedeLlevar(m, e.tipo).ok) ?? null;
  return alterno
    ? { usar: "automatico", reRutar: true, respetado: false, texto: `Se perdió ${ETIQUETA_MEDIO[e.fijado].toLowerCase()}; se pasa a ${ETIQUETA_MEDIO[alterno].toLowerCase()} para no cortar la llamada.` }
    : { usar: "automatico", reRutar: false, respetado: false, texto: `Se perdió ${ETIQUETA_MEDIO[e.fijado].toLowerCase()} y no hay otro medio; reconectando.` };
}
