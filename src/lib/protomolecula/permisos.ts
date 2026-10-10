/**
 * Protomolécula · PERMISOS. Qué puede hacer cada ORIGEN y cada ROL en cada ÁMBITO. Módulo PURO.
 * Se apoya en lo que ya existe: roles de sala (`salas/sala.ts`) y ámbitos personal › perfil › grupo
 * › pública (`nucleo/alcance-memoria.ts`). No inventa un tercer sistema.
 *
 *  · Mover un parámetro: editor o dueño, desde cualquier origen (es reversible y lleva autor).
 *  · Estructura, mandos y arrancar herramientas ajenas: una IA o un agente piden confirmación.
 *  · Código: la Protomolécula PROPONE (candidato revisable). Aceptarlo es cosa de una persona con
 *    la mano; jamás de una IA. Nada de esto toca el núcleo del OS (`nucleo/invariantes.ts`).
 *  · Salud de un wearable: solo local por defecto; viajar a la sesión exige consentimiento por
 *    métrica, vigente y del ámbito justo; en sesión pública, además, permiso expreso.
 *  · Abrir el ámbito (personal → público) solo lo hace el dueño, con la mano y confirmando.
 */
import { AMBITOS, METRICAS_SALUD } from "./tipos";
import type { Ambito, Capa, Consentimiento, MetricaSalud, Operacion, Origen, Rol, Sesion } from "./tipos";

export type AccionProto =
  | "ver" | "mover-parametro" | "editar-estructura" | "vincular-control" | "proponer-codigo"
  | "aplicar-codigo" | "lanzar-externo" | "invitar" | "cambiar-ambito" | "publicar";
export interface Decision { permitido: boolean; confirmar: boolean; motivo: string }
export interface ContextoPermiso {
  rol: Rol | null;
  origen: Origen;
  ambito: Ambito;
  accion: AccionProto;
  /** `lanzar-externo`: app nativa o servicio local (fuera del aislamiento del navegador). */
  nativo?: boolean;
}

export const esAutomatico = (o: Origen): boolean => o === "ia" || o === "agente";
const indiceAmbito = (a: Ambito): number => AMBITOS.indexOf(a);
const si = (motivo: string, confirmar = false): Decision => ({ permitido: true, confirmar, motivo });
const no = (motivo: string): Decision => ({ permitido: false, confirmar: false, motivo });

export function decidir(c: ContextoPermiso): Decision {
  const { rol, origen: o, ambito: a, accion } = c;
  const auto = esAutomatico(o), abierto = a === "grupo" || a === "publica";
  if (rol === null) return accion === "ver" && a === "publica" ? si("Sesión pública: cualquiera puede mirar.") : no("No eres miembro de esta sesión.");
  if (accion === "ver") return si("Los miembros ven la sesión.");
  if (accion === "proponer-codigo") return rol === "observador" ? no("Un observador mira, no propone.") : si("Se guarda como CANDIDATO: nada se ejecuta hasta que una persona lo revise.");
  const editor = rol === "dueno" || rol === "editor";
  if (!editor) return no(`Con el rol «${rol}» solo se mira o se comenta.`);
  switch (accion) {
    case "mover-parametro": return si(auto ? "Cambio de una IA: reversible y con su nombre." : "Cambio reversible con autor.");
    case "editar-estructura": return si("Capas y herramientas de la molécula.", auto && abierto);
    case "vincular-control": return si("Un mando se vincula a un parámetro.", auto);
    case "lanzar-externo":
      if (auto && c.nativo) return no("Una IA no arranca una app nativa ni un servicio local por su cuenta.");
      return si(c.nativo ? "Fuera del aislamiento del navegador: se pide confirmación." : "Herramienta aislada (iframe con sandbox o WASM en Worker).", c.nativo === true || auto);
    case "aplicar-codigo":
      return o === "mano" ? si("Aceptas un candidato que has leído; sigue sin tocar el núcleo del OS.", true) : no("El código solo lo acepta una persona, con la mano, tras leerlo.");
    case "invitar": return rol === "dueno" || abierto ? si("Invitar amplía el círculo.", auto) : no("En una sesión reservada solo invita su dueño.");
    case "cambiar-ambito": case "publicar":
      return rol !== "dueno" ? no("Solo el dueño cambia el ámbito o publica.") : o === "mano" ? si("Decisión del dueño, siempre confirmada.", true) : no("Cambiar el ámbito o publicar se hace con la mano, no por voz, mando ni IA.");
  }
}

/** Abrir el círculo (hacia lo público) pide confirmar; cerrarlo, no. */
export function puedeCambiarAmbito(rol: Rol | null, origen: Origen, desde: Ambito, hacia: Ambito): Decision {
  if (desde === hacia) return no("Ya está en ese ámbito.");
  const base = decidir({ rol, origen, ambito: desde, accion: "cambiar-ambito" });
  if (!base.permitido) return base;
  return indiceAmbito(hacia) > indiceAmbito(desde) ? si(hacia === "publica" ? "Pasará a ser PÚBLICO: cualquiera podrá verlo." : "Se abre a más gente.", true) : si("Se reserva a un círculo más pequeño.");
}

/** Capas que citan una Entidad más reservada que el ámbito al que se abre la molécula: otros no podrían abrirlas. */
export function referenciasRotas(capas: Capa[], ambitoMolecula: Ambito, ambitoDe: (tipo: string, id: string) => Ambito): string[] {
  return capas.filter((c) => c.referencia && indiceAmbito(ambitoDe(c.referencia.tipo, c.referencia.id)) < indiceAmbito(ambitoMolecula)).map((c) => c.id);
}

/* ── Salud de wearables ── */
export const AVISO_SALUD = "Son lecturas de un dispositivo: no son un diagnóstico ni un consejo médico.";

/** «wearable:pulso» → la métrica; «wearable:algo-raro» → null (es salud, pero no sabemos qué); otro origen → undefined (no es salud). */
export function metricaDeFuente(fuente: string | undefined): MetricaSalud | null | undefined {
  if (!fuente?.startsWith("wearable:")) return undefined;
  const m = fuente.slice(9);
  return (METRICAS_SALUD as readonly string[]).includes(m) ? (m as MetricaSalud) : null;
}

export function crearConsentimiento(metrica: MetricaSalud, ambitoMax: Ambito, usuarioId: string, ahora: number, o: { expreso?: boolean; duracionMs?: number } = {}): Consentimiento {
  return { metrica, ambitoMax, expreso: ambitoMax === "publica" ? o.expreso === true : undefined, concedidoPor: usuarioId, concedidoEn: ahora, caducaEn: o.duracionMs ? ahora + o.duracionMs : undefined };
}
export const revocarConsentimiento = (cs: Consentimiento[], metrica: MetricaSalud, usuarioId: string): Consentimiento[] =>
  cs.filter((c) => !(c.metrica === metrica && c.concedidoPor === usuarioId));

export interface DecisionSalud { local: true; difundir: boolean; motivo: string }
/** Lo local (tu propio aparato moviendo tu propia pantalla) siempre vale; viajar a la sesión, solo con consentimiento. */
export function decidirSalud(metrica: MetricaSalud | null, ambitoSesion: Ambito, cs: Consentimiento[], usuarioId: string, ahora: number): DecisionSalud {
  if (ambitoSesion === "personal") return { local: true, difundir: true, motivo: "Sesión solo tuya." };
  if (metrica === null) return { local: true, difundir: false, motivo: "Métrica de salud sin identificar: se queda en tu aparato." };
  const c = cs.find((x) => x.metrica === metrica && x.concedidoPor === usuarioId && (x.caducaEn === undefined || x.caducaEn > ahora));
  if (!c) return { local: true, difundir: false, motivo: `Sin consentimiento para «${metrica}»: se queda en tu aparato.` };
  if (indiceAmbito(c.ambitoMax) < indiceAmbito(ambitoSesion)) return { local: true, difundir: false, motivo: `Consentiste «${metrica}» solo hasta el ámbito «${c.ambitoMax}».` };
  if (ambitoSesion === "publica" && !c.expreso) return { local: true, difundir: false, motivo: "En una sesión pública hace falta tu permiso expreso para esta métrica." };
  return { local: true, difundir: true, motivo: `Consentimiento vigente para «${metrica}».` };
}

export interface DecisionOperacion extends Decision { difundir: boolean }
/** Decide una operación concreta: permisos de rol/origen y, si viene de un wearable, el filtro de salud. */
export function decidirOperacion(op: Operacion, rol: Rol | null, s: Pick<Sesion, "ambito" | "consentimientos">, ahora: number): DecisionOperacion {
  const d = decidir({ rol, origen: op.origen, ambito: s.ambito, accion: "mover-parametro" });
  const metrica = op.origen === "sensor" ? metricaDeFuente(op.fuente) : undefined;
  if (!d.permitido || metrica === undefined) return { ...d, difundir: d.permitido };
  const h = decidirSalud(metrica, s.ambito, s.consentimientos, op.autor.id, ahora);
  return { ...d, motivo: `${d.motivo} ${h.motivo}`, difundir: h.difundir };
}
