"use client";
/**
 * Avatares 3D · HOOK DEL EDITOR EN TIEMPO REAL (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * Todo entra por el MISMO `CambioAvatar`: el panel, la voz (dictado del OS + Astraura para lo no
 * entendido) y un mando MIDI (Web MIDI con permiso explícito, reutilizando el adaptador de la
 * Protomolécula §4.4). Tres velocidades del contrato: pantalla al instante, los demás en lote
 * agrupado y NUNCA si no hay nadie mirando, y guardado tras calma en el almacén de AV1011D.
 * El reloj, el guardado, la emisión y Astraura VAN INYECTADOS: aquí no hay red ni disco propios
 * y se puede probar con reloj falso. La pila de deshacer no retiene nada antes de 50 pasos.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MORFOLOGIA, SLOTS_MATERIAL, SLOTS_PIEZA, type AdnAvatar, type EstiloMovimiento, type Morfologia } from "../adn/adn";
import { sanearCambio, aplicarCambio, crearColaEnvio, debeGuardar, encolar as encolarCambio, lote, type CambioAvatar } from "../adn/cambios";
import { cambiosDesdeFrase } from "../adn/dictado";
import { pedirAccesoMidi, hayMidi, conectarMidi as escucharMidi, type MensajeMidi, type NavegadorMidi } from "@/lib/protomolecula/adaptador-midi";

/* ── Pila de deshacer/rehacer (tope 50) ─────────────────────────────────── */
export const TOPE_PILA = 50;
export interface PilaAdn {
  pasado: AdnAvatar[];
  futuro: AdnAvatar[];
}
export const crearPila = (): PilaAdn => ({ pasado: [], futuro: [] });
/** Empuja el estado previo; cuando pasa del tope se pierde el más viejo (siempre ≤ TOPE_PILA). */
export function empujar(p: PilaAdn, adn: AdnAvatar): PilaAdn {
  const pasado = [...p.pasado, adn];
  return { pasado: pasado.length > TOPE_PILA ? pasado.slice(pasado.length - TOPE_PILA) : pasado, futuro: [] };
}
export function deshacerPila(p: PilaAdn, actual: AdnAvatar): { estado: PilaAdn; adn: AdnAvatar | null } {
  if (p.pasado.length === 0) return { estado: p, adn: null };
  const adn = p.pasado[p.pasado.length - 1];
  return { estado: { pasado: p.pasado.slice(0, -1), futuro: [actual, ...p.futuro] }, adn: adn };
}
export function rehacerPila(p: PilaAdn, actual: AdnAvatar): { estado: PilaAdn; adn: AdnAvatar | null } {
  if (p.futuro.length === 0) return { estado: p, adn: null };
  return { estado: { pasado: [...p.pasado, actual], futuro: p.futuro.slice(1) }, adn: p.futuro[0] };
}

/* ── Astraura: lo que el dictado local no entendió ──────────────────────── */

/** La instrucción que pide a Astraura SOLO una lista JSON de cambios del mismo formato del contrato §3. */
export function instruccionAstraura(sinEntender: readonly string[]): string {
  return [
    "Personalización de un avatar 3D. Responde ÚNICAMENTE con una lista JSON de cambios, sin ayuda ni explicación. Formato por cambio: "
      + '{"op":"morfologia","clave":"<una de: ' + MORFOLOGIA.join("|") + '>","valor":0..1} · '
      + '{"op":"material","slot":"<una de: ' + SLOTS_MATERIAL.join("|") + '>","campo":"color","valor":"#rrggbb"} · '
      + '{"op":"pieza","slot":"<una de: ' + SLOTS_PIEZA.join("|") + '>","ref":"biblioteca:<id>"} · '
      + '{"op":"expresion","clave":"<happy|sad|angry|surprised|relaxed|neutral>","valor":0..1} · '
      + '{"op":"aura","campo":"<tono(0..360)|intensidad(0..1)|ligadaEmocion>","valor":…} · '
      + '{"op":"movimiento","campo":"<energia|amplitud|ritmo|postura>","valor":0..1}.',
    "Pedía: " + sinEntender.join("; "),
  ].join("\n");
}

/** Respuesta de Astraura → cambios válidos (sanearCambio filtra lo que no cuadra; nada queda sin revisar). */
export function cambiosDeAstraura(texto: string): CambioAvatar[] {
  if (!texto) return [];
  const a = texto.indexOf("["), z = texto.lastIndexOf("]");
  if (a < 0 || z <= a) return [];
  try {
    const lista = JSON.parse(texto.slice(a, z + 1)) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
  } catch {
    return [];
  }
}

function esObjetivo(v: unknown): v is ObjetivoDeslizador {
  const o = v as Record<string, unknown>;
  if (typeof o !== "object" || o === null || typeof (o as { campo?: unknown }).campo !== "string") return false;
  if (o.campo === "morfologia" || o.campo === "movimiento") return typeof (o as { clave?: unknown }).clave === "string" && o.clave.length <= 12;
  return o.campo === "aura" && ((o as { clave?: unknown }).clave === "tono" || (o as { clave?: unknown }).clave === "intensidad");
}

/** Un mensaje CC → cambio (0…127 → 0…1; el tono del aura va en grados). `null` si no cuadra. */
export function cambioDeMidi(m: MensajeMidi, objetivo: ObjetivoDeslizador): CambioAvatar | null {
  if (m.fuente.tipo !== "midi" || m.fuente.mensaje !== "cc" || typeof m.bruto !== "number") return null;
  const v = Math.max(0, Math.min(127, m.bruto)) / 127;
  if (objetivo.campo === "morfologia") return sanearCambio({ op: "morfologia", clave: objetivo.clave, valor: v });
  if (objetivo.campo === "movimiento") return sanearCambio({ op: "movimiento", campo: objetivo.clave, valor: v });
  const campo = objetivo.clave === "tono" ? Math.round((v * 360) % 360) : v;
  return sanearCambio({ op: "aura", campo: objetivo.clave, valor: campo });
}

/** Lo que hay guardado: solo mapeos válidos (lo corrupto se descarta, sin lanzar). */
export function cargarMapeosMidi(almacen: AlmacenMidi | null): MapaMidi {
  if (!almacen) return {};
  try {
    const bruto = JSON.parse(almacen.getItem(CLAVE_MIDI) ?? "{}") as unknown;
    const out: MapaMidi = {};
    for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) if (/^cc\d{1,3}$/.test(k) && esObjetivo(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** Guarda el mapeo en el aparato (solo CLAVE_MIDI); false si el aparato no dejó. */
export function guardarMapeosMidi(almacen: AlmacenMidi | null, mapa: MapaMidi): boolean {
  if (!almacen) return false;
  try {
    almacen.setItem(CLAVE_MIDI, JSON.stringify(mapa));
    return true;
  } catch {
    return false;
  }
}

/* ── MIDI: CC → deslizador (mapeo propio del editor, persistido por aparato) ── */
export type ObjetivoDeslizador =
  | { campo: "morfologia"; clave: Morfologia }
  | { campo: "movimiento"; clave: keyof EstiloMovimiento }
  | { campo: "aura"; clave: "tono" | "intensidad" };
export type MapaMidi = Record<string, ObjetivoDeslizador>;
export const CLAVE_MIDI = "starseed.avatar.editor.midi.v1";
export interface AlmacenMidi {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/* ── Hook ───────────────────────────────────────────────────────────────── */
export type EstadoMidi = "sin-nav" | "conectado" | "denegado" | "sin-soporte";

export interface DependenciasEditor {
  ahora: () => number;
  guardar: (adn: AdnAvatar) => Promise<void>;
  otrosPresentes?: number;
  /** Canal de los demás presentes (AV1011E aún no está integrado); null = solo tu pantalla. */
  emitir?: (cambios: CambioAvatar[]) => void;
  /** Astraura para lo no entendido; null o respuesta null = se dice en el aviso. */
  preguntarAstraura?: (instruccion: string) => Promise<string | null>;
  /** Almacén del mapeo MIDI; por defecto el localStorage del aparato. */
  almacen?: AlmacenMidi | null;
}
export interface EditorMidi {
  estado: EstadoMidi;
  motivo: string | null;
  /** Objetivo que está esperando que llegue un CC para mapearse. */
  aprendiendo: string | null;
  mapeos: MapaMidi;
}

export function useEditorAvatar(adnInicial: AdnAvatar, deps: DependenciasEditor) {
  const [adn, setAdn] = useState<AdnAvatar>(adnInicial);
  const [pila, setPila] = useState<PilaAdn>(crearPila);
  const [aviso, setAviso] = useState<string | null>(null);
  const [esperandoAstraura, setEsperandoAstraura] = useState(false);
  const [objetivoMidi, setObjetivoMidi] = useState<string | null>(null);
  const [midiEstado, setMidiEstado] = useState<{ estado: EstadoMidi; motivo: string | null }>({ estado: "sin-nav", motivo: null });
  const [mapeosEstado, setMapeosEstado] = useState<MapaMidi>(() => cargarMapeosMidi(deps.almacen ?? null));
  const adnRef = useRef(adnInicial);
  const colaRef = useRef(crearColaEnvio());
  const sinGuardar = useRef(false);
  const ultimoCambio = useRef(deps.ahora());
  // Nunca guardado aún: la primera calma de 5 s del turno ya guarda.
  const ultimoGuardado = useRef(Number.NEGATIVE_INFINITY);
  const guardando = useRef(false);
  const soltarMidi = useRef<(() => void) | null>(null);
  const aprendiendo = useRef<string | null>(null);
  const mapeos = useRef<MapaMidi>(mapeosEstado);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const pilaRef = useRef(pila);
  const fijarPila = useCallback((p: PilaAdn) => {
    pilaRef.current = p;
    setPila(p);
  }, []);
  depsRef.current = deps;

  useEffect(() => () => soltarMidi.current?.(), []);

  const fijarAdn = useCallback((n: AdnAvatar) => {
    adnRef.current = n;
    setAdn(n);
  }, []);

  /** Cada cambio aplicado: al instante en pantalla, un paso a la pila y a la cola de los demás. */
  const aplicarLista = useCallback((cs: readonly CambioAvatar[]) => {
    let actual = adnRef.current;
    for (const c of cs) {
      const n = aplicarCambio(actual, c);
      if (n === actual) continue;
      const previo = actual;
      setPila((p) => empujar(p, previo));
      encolarCambio(colaRef.current, c);
      sinGuardar.current = true;
      ultimoCambio.current = depsRef.current.ahora();
      actual = n;
    }
    if (actual !== adnRef.current) fijarAdn(actual);
  }, [fijarAdn]);

  /** Deshacer: el rev no retrocede (la revisión más alta gana en sincronía; el almacén lo exige). */
  const deshacer = useCallback(() => {
    const r = deshacerPila(pila, adnRef.current);
    if (!r.adn) return;
    setPila(r.estado);
    const revAhora = adnRef.current.rev;
    fijarAdn(r.adn.rev >= revAhora ? r.adn : { ...r.adn, rev: revAhora });
    sinGuardar.current = true;
    ultimoCambio.current = depsRef.current.ahora();
  }, [pila, fijarAdn]);

  const rehacer = useCallback(() => {
    const r = rehacerPila(pila, adnRef.current);
    if (!r.adn) return;
    setPila(r.estado);
    fijarAdn(r.adn);
    sinGuardar.current = true;
    ultimoCambio.current = depsRef.current.ahora();
  }, [pila, fijarAdn]);

  /** Voz: primero lo que el OS entiende solo; lo que queda va a Astraura (o se dice que no hay modelo). */
  const dictar = useCallback(async (frase: string) => {
    const base = adnRef.current;
    const { cambios, sinEntender } = cambiosDesdeFrase(frase, base);
    if (cambios.length) aplicarLista(cambios);
    if (!sinEntender.length) return;
    const ask = depsRef.current.preguntarAstraura;
    if (!ask) {
      setAviso(`Astraura no está disponible desde aquí: «${sinEntender.join("; ")}» se queda sin aplicar.`);
      return;
    }
    setEsperandoAstraura(true);
    setAviso(`Pidiendo a Astraura: «${sinEntender.join("; ")}»…`);
    try {
      const respuesta = await ask(instruccionAstraura(sinEntender));
      if (respuesta === null) {
        setAviso("Astraura no respondió: esa parte del dictado no se aplicó.");
      } else {
        const cs = cambiosDeAstraura(respuesta);
        if (!cs.length) setAviso("Astraura respondió, pero no devolvió cambios válidos: nada aplicado.");
        else {
          aplicarLista(cs);
          setAviso(`Astraura aplicó ${cs.length} cambio(s) sobre «${sinEntender.join("; ")}».`);
        }
      }
    } catch {
      setAviso("La llamada a Astraura falló: esa parte del dictado no se aplicó.");
    } finally {
      setEsperandoAstraura(false);
    }
  }, [aplicarLista]);

  /** Ritmo del editor: emite a los demás (nunca sin nadie mirando) y guarda tras calma (§3). */
  const tic = useCallback((op: { cerrando?: boolean } = {}) => {
    const d = depsRef.current;
    const ahora = d.ahora();
    const paraOtros = lote(colaRef.current, ahora, d.otrosPresentes ?? 0);
    if (paraOtros && d.emitir) d.emitir(paraOtros);
    if (!debeGuardar({ sinGuardar: sinGuardar.current, ultimoCambio: ultimoCambio.current, ultimoGuardado: ultimoGuardado.current, ahora, cerrando: op.cerrando === true })) return;
    if (guardando.current) return;
    guardando.current = true;
    const adnAGuardar = adnRef.current;
    void d.guardar(adnAGuardar)
      .then(() => {
        sinGuardar.current = false;
        ultimoGuardado.current = d.ahora();
        guardando.current = false;
      })
      .catch((e: unknown) => {
        guardando.current = false;
        setAviso(`No se pudo guardar el avatar: ${e instanceof Error ? e.message : "error desconocido"}.`);
      });
  }, []);

  /** MIDI (Protomolécula §4.4): permiso explícito SOLO al pulsar, luego CC → deslizador mapeado. */
  const conectarMidi = useCallback(async (nav: NavegadorMidi | null) => {
    const r = await pedirAccesoMidi(nav);
    if (!r.ok) {
      setMidiEstado({ estado: hayMidi(nav) ? "denegado" : "sin-soporte", motivo: r.motivo });
      return;
    }
    setMidiEstado({ estado: "conectado", motivo: null });
    soltarMidi.current?.();
    soltarMidi.current = escucharMidi(r.acceso, (m: MensajeMidi) => recibir(m));
  }, []);

  const recibir = useCallback((m: MensajeMidi) => {
    if (m.fuente.tipo !== "midi" || m.fuente.mensaje !== "cc") return;
    const clave = `cc${m.fuente.numero}`;
    const enCurso = aprendiendo.current;
    if (enCurso) {
      const dest = objetivoDeEtiqueta(enCurso);
      if (!dest) return;
      aprendiendo.current = null;
      setObjetivoMidi(null);
      const nuevos = { ...mapeos.current, [clave]: dest };
      mapeos.current = nuevos;
      setMapeosEstado(nuevos);
      guardarMapeosMidi(depsRef.current.almacen ?? null, nuevos);
      setAviso(`CC ${m.fuente.numero} mapeado a ${etiquetaObjetivo(dest)}.`);
      return;
    }
    const dest = mapeos.current[clave];
    if (!dest) return;
    const c = cambioDeMidi(m, dest);
    if (c) aplicarLista([c]);
  }, [aplicarLista]);
  const dejarDeAprender = useCallback(() => {
    aprendiendo.current = null;
    setObjetivoMidi(null);
  }, []);
  const fijarObjetivoMidi = useCallback((k: string | null) => {
    aprendiendo.current = k;
    setObjetivoMidi(k);
  }, []);
  const quitarMapeoMidi = useCallback((k: string) => {
    const { [k]: _fuera, ...resto } = mapeos.current;
    mapeos.current = resto;
    setMapeosEstado(resto);
    guardarMapeosMidi(depsRef.current.almacen ?? null, resto);
  }, []);

  return {
    adn, aviso, esperandoAstraura,
    cambiar, deshacer, rehacer,
    puedeDeshacer: pila.pasado.length > 0,
    puedeRehacer: pila.futuro.length > 0,
    dictar, tic, midi: { ...midiEstado, aprendiendo: objetivoMidi, mapeos: mapeosEstado },
    conectarMidi, fijarObjetivoMidi, quitarMapeoMidi, dejarDeAprender,
  };
}

/* ── Etiquetas de objetivo MIDI (etiqueta ↔ ObjetivoDeslizador) ─────────── */
export const OPCIONES_MIDI: readonly string[] = [
  ...MORFOLOGIA.map((k) => `morfologia.${k}`),
  "movimiento.energia", "movimiento.amplitud", "movimiento.ritmo", "movimiento.postura",
  "aura.tono", "aura.intensidad",
];
const NOMBRE_DESCLIZADOR: Record<string, string> = {
  altura: "Altura", complexion: "Complexión", cabeza: "Cabeza", hombros: "Hombros", cintura: "Cintura",
  piernas: "Piernas", brazos: "Brazos", estilizado: "Estilizado", energia: "Energía", amplitud: "Amplitud",
  ritmo: "Ritmo", postura: "Postura", tono: "Tono del aura", intensidad: "Intensidad del aura",
};
export const etiquetaObjetivo = (o: ObjetivoDeslizador): string => `${o.campo === "aura" ? "Aura" : o.campo === "movimiento" ? "Movimiento" : "Morfología"} · ${NOMBRE_DESCLIZADOR[o.clave] ?? o.clave}`;

/** «morfologia.altura» → objetivo, o `null` si la etiqueta no sirve. */
export function objetivoDeEtiqueta(t: string): ObjetivoDeslizador | null {
  if (!OPCIONES_MIDI.includes(t)) return null;
  const [campo, clave] = t.split(".") as ["morfologia" | "movimiento" | "aura", string];
  if (campo === "aura") return { campo: "aura", clave: clave as "tono" | "intensidad" };
  if (campo === "movimiento") return { campo, clave: clave as keyof EstiloMovimiento };
  return { campo, clave: clave as Morfologia };
}

export type TipoMensajeMidi = MensajeMidi;
export type NavMidi = NavegadorMidi;
