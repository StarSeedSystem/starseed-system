// Decisión de opciones al encontrar otra neurona por NFC (contrato: architecture/nfc-neuronas.md §3, §4 y §7).
// Módulo puro: dada la tarjeta propia, la ajena, la relación y las preferencias, dice qué se muestra,
// qué botones se ofrecen y qué se hace solo. Nunca hay nada automático con lo desconocido.

import type { TarjetaNeurona } from "./tarjeta";
import {
  ACCIONES,
  ACCIONES_SENSIBLES,
  ACCIONES_SOLO_PROPIAS,
  esIgnorada,
  relacionEfectiva,
  resolver,
  type Accion,
  type AvisoEncuentro,
  type PerfilVisible,
  type PreferenciasNfc,
  type Relacion,
  type UbicacionEncuentro,
} from "./preferencias";

/** Qué se enseña de la otra neurona: la identidad solo si la tarjeta ajena la trae y las preferencias lo permiten. */
export type PerfilMostrado =
  | { tipo: "completo"; neuronaId: string; cuenta: { modo: "hash" | "alias"; valor: string } }
  | { tipo: "solo_neurona"; neuronaId: string }
  | { tipo: "pendiente"; neuronaId: string }; // «pedir permiso»: nada se enseña hasta el toque

export interface DecisionEncuentro {
  /** Si la hoja «Cerca de ti» / la notificación debe salir. Una neurona ignorada no sale. */
  mostrar: boolean;
  motivoOculto?: "ignorada";
  relacion: Relacion;
  perfil: PerfilMostrado;
  /** Se ejecutan sin preguntar (siempre ⊆ lo permitido y nunca con desconocidas). */
  automaticas: Accion[];
  /** Botones: lo permitido que no es automático. */
  ofrecidas: Accion[];
  aviso: AvisoEncuentro;
  ubicacion: UbicacionEncuentro;
  sugerenciasAstraura: boolean;
  /** Acciones que se quitaron por no poder cumplirse (sin oferta, sin transporte común). */
  noDisponibles: Accion[];
}

export interface EntradaDecision {
  propia: TarjetaNeurona;
  ajena: TarjetaNeurona;
  relacion: Relacion;
  prefs: PreferenciasNfc;
}

/** Acciones que necesitan un canal para mover datos entre las dos neuronas. */
const NECESITAN_TRANSPORTE: readonly Accion[] = [
  "enviar_archivo", "enviar_cerebro", "compartir_capacidades", "compartir_almacenamiento", "compartir_senales",
  "compartir_internet", "vincular_capa", "control_remoto", "acceso_cerebros",
];
/** Acciones que dependen de lo que el nodo ajeno ofrece. */
const NECESITAN_OFERTA: readonly Accion[] = ["abrir_oferta_nodo", "registrar_entrada_evento"];

const esPropia = (r: Relacion) => r === "misma_cuenta" || r === "nodo_propio";

function hayTransporteComun(a: TarjetaNeurona, b: TarjetaNeurona): boolean {
  return a.transportes.some((x) => b.transportes.some((y) => y.tipo === x.tipo));
}

function perfilMostrado(modo: PerfilVisible, ajena: TarjetaNeurona): PerfilMostrado {
  if (modo === "pedir") return { tipo: "pendiente", neuronaId: ajena.neuronaId };
  const c = ajena.cuenta;
  if (modo === "ocultar" || c.modo === "nada" || c.valor === undefined) return { tipo: "solo_neurona", neuronaId: ajena.neuronaId };
  return { tipo: "completo", neuronaId: ajena.neuronaId, cuenta: { modo: c.modo, valor: c.valor } };
}

export function decidir(e: EntradaDecision): DecisionEncuentro {
  const { propia, ajena, prefs } = e;
  const id = ajena.neuronaId;
  const relacion = relacionEfectiva(prefs, e.relacion, id);

  if (esIgnorada(prefs, id)) {
    return {
      mostrar: false, motivoOculto: "ignorada", relacion, perfil: { tipo: "solo_neurona", neuronaId: id },
      automaticas: [], ofrecidas: [], aviso: "silenciar", ubicacion: "no", sugerenciasAstraura: false, noDisponibles: [],
    };
  }

  const p = resolver(prefs, relacion, id);
  const propias = esPropia(relacion);
  const transporte = hayTransporteComun(propia, ajena);
  const hayOferta = ajena.ofertas.length > 0;
  const noDisponibles: Accion[] = [];

  const disponible = (a: Accion): boolean => {
    if (!propias && ACCIONES_SOLO_PROPIAS.includes(a)) return false;
    if (NECESITAN_TRANSPORTE.includes(a) && !transporte) return false;
    if (NECESITAN_OFERTA.includes(a) && !hayOferta) return false;
    return true;
  };

  // Seguridad en capas: aunque las preferencias vengan alteradas, con lo ajeno solo se automatiza lo seguro.
  const permitidaAuto = (a: Accion): boolean => propias || (relacion === "cuenta_reconocida" && !ACCIONES_SENSIBLES.includes(a));

  const ofrecibles = ACCIONES.filter((a) => p.ofrecidas.includes(a));
  const utiles = ofrecibles.filter((a) => {
    const ok = disponible(a);
    if (!ok) noDisponibles.push(a);
    return ok;
  });
  const automaticas = utiles.filter((a) => p.automaticas.includes(a) && permitidaAuto(a));
  const ofrecidas = utiles.filter((a) => !automaticas.includes(a));

  return {
    mostrar: true, relacion, perfil: perfilMostrado(p.perfil, ajena), automaticas, ofrecidas,
    aviso: p.aviso, ubicacion: p.ubicacion, sugerenciasAstraura: propias && p.sugerenciasAstraura, noDisponibles,
  };
}
