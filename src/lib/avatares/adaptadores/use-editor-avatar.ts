"use client";
/**
 * Avatares 3D · EDITOR EN TIEMPO REAL (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * `useEditorAvatar` aplica cada cambio al instante (`aplicarCambio`, sin red), mantiene deshacer/rehacer
 * (pila de ADN, tope 50), agrupa y emite a los demás presentes con `encolar`/`lote` (NUNCA sin nadie
 * mirando) y guarda en el almacén de AV1011D con `debeGuardar` (5 s de calma, como mucho cada 30 s).
 * La voz dictada pasa por `cambiosDesdeFrase`; lo que el dictado no entiende va a Astraura pidiendo
 * SOLO una lista JSON de `CambioAvatar`, filtrada por `sanearCambio`. El mando MIDI por CC usa el
 * mapeo de la Protomolécula si existe (hoy no lo tiene: comprobado el 2026-10-31) y si no, Web MIDI
 * con permiso explícito y el mapa por defecto (CC 20–27 → los 8 deslizadores de morfología).
 * Todo lo de fuera (almacén, emisión, Astraura, Protomolécula) llega inyectado en `deps`: los tests
 * usan dobles y reloj falso. El panel es `src/components/avatares/editor-avatar.tsx`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdnAvatar, Morfologia } from "../adn/adn";
import {
  aplicarCambio, crearColaEnvio, debeGuardar, encolar, lote, sanearCambio, type CambioAvatar,
} from "../adn/cambios";
import { cambiosDesdeFrase } from "../adn/dictado";

/** Tope de la pila de deshacer: 50 pasos de ADN (contrato §3). */
export const MAX_PASOS = 50;

/** Mapa por defecto CC → deslizador (20–27, los 8 de morfología en el orden de `MORFOLOGIA`). */
export const CC_DEFECTO: Readonly<Record<number, Morfologia>> = Object.freeze({
  20: "altura", 21: "complexion", 22: "cabeza", 23: "hombros", 24: "cintura", 25: "piernas", 26: "brazos", 27: "estilizado",
});

export interface DependenciasEditorAvatar {
  /** Almacén de AV1011D (`saveAdnToLibrary`). Un fallo deja el guardado pendiente; nunca se dice «guardado» en falso. */
  guardar: (adn: AdnAvatar) => Promise<void> | void;
  /** Otros presentes (AV1011E): se llama una vez por lote emitido. Opcional: sin él no viaja nada. */
  emitir?: (cambios: readonly CambioAvatar[]) => void;
  /** Astraura. Recibe la instrucción y lo pendiente de entender; devuelve el TEXTO con SOLO la lista JSON, o null si hoy no hay modelo disponible. */
  astraura: ((instruccion: string, frase: string) => Promise<string | null>) | null;
  /** Mapeo de controles de la Protomolécula (CC → deslizador). Sin él se usa `CC_DEFECTO`. */
  mapeoMidi?: Readonly<Record<number, Morfologia>> | null;
}

/** Instrucción para Astraura: SOLO una lista JSON de `CambioAvatar`, sin prosa. */
export const INSTRUCCION_ASTRAURA = [
  "Eres el traductor de cambios de un avatar 3D del OS StarSeed.",
  "Responde SOLO con una lista JSON de CambioAvatar, sin texto ni código de ejemplo;",
  "cada cambio es uno de: {\"op\":\"morfologia\",\"clave\":\"altura|complexion|cabeza|hombros|cintura|piernas|brazos|estilizado\",\"valor\":0-1},",
  "{\"op\":\"material\",\"slot\":\"piel|cabello|ojos|ropa-1|ropa-2|acento|aura\",\"campo\":\"color|metal|rugosidad|emisivo\",\"valor\":\"#rrggbb\" o 0-1},",
  "{\"op\":\"pieza\",\"slot\":\"cabeza|cabello|torso|piernas|cara|pies|manos|accesorio-1|espalda|accesorio-2|mascota\",\"ref\":\"biblioteca:…\"|null,\"tinte\":\"#rrggbb\"?},",
  "{\"op\":\"expresion\",\"clave\":\"neutral|happy|angry|sad|relaxed|surprised\",\"valor\":0-1},",
  "{\"op\":\"aura\",\"campo\":\"tono|ligadaEmocion\",\"valor\":0-360 o true/false},",
  "{\"op\":\"movimiento\",\"campo\":\"energia|amplitud|ritmo|postura\",\"valor\":0-1},",
  "o {\"op\":\"nombre\",\"valor\":\"…\"}. No inventes referencias que no vengan de la Biblioteca.",
  "Si la petición no es sobre el avatar, responde [].",
].join(" ");

/* ── Lo puro, para pruebas sin DOM ni reloj ─────────────────────────────── */

/** Extrae la lista JSON de la respuesta y filtra por `sanearCambio`: lo inválido no entra. */
export function cambiosDeAstraura(respuesta: string): CambioAvatar[] {
  if (typeof respuesta !== "string") return [];
  const ini = respuesta.indexOf("["), fin = respuesta.lastIndexOf("]");
  if (ini < 0 || fin < ini) return [];
  try {
    const lista = JSON.parse(respuesta.slice(ini, fin + 1)) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
  } catch {
    return [];
  }
}

/** CC de un mando (0–127) → cambio de deslizador, o null si el CC no tiene ranura en el mapa. */
export function cambioDeCC(mapa: Readonly<Record<number, Morfologia>>, cc: number, valor: number): CambioAvatar | null {
  const clave = mapa[cc];
  if (!clave || typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return { op: "morfologia", clave, valor: Math.min(1, Math.max(0, valor / 127)) };
}

export interface EditorAvatar {
  adn: AdnAvatar;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  /** Mensaje de la voz: qué entendió, qué va para Astraura y con qué resultado (o por qué no). */
  mensajeVoz: string | null;
  /** Mensaje del mando MIDI: permiso, entradas conectadas o por qué no se puede. */
  mensajeMidi: string | null;
  aplicar: (c: CambioAvatar) => void;
  deshacer: () => void;
  rehacer: () => void;
  dictar: (frase: string) => Promise<void>;
  conectarMidi: () => Promise<void>;
  /** Guarda ya si hay algo por guardar (al cerrar el editor). */
  cerrar: () => void;
}

/* ── El hook ────────────────────────────────────────────────────────────── */

export function useEditorAvatar(inicial: AdnAvatar, otrosPresentes: number, deps: DependenciasEditorAvatar): EditorAvatar {
  const [adn, setAdn] = useState<AdnAvatar>(inicial);
  const [niveles, setNiveles] = useState({ deshacer: false, rehacer: false });
  const [mensajeVoz, setMensajeVoz] = useState<string | null>(null);
  const [mensajeMidi, setMensajeMidi] = useState<string | null>(null);
  const pasados = useRef<AdnAvatar[]>([]);
  const futuros = useRef<AdnAvatar[]>([]);
  const adnRef = useRef(adn);
  const cola = useRef(crearColaEnvio());
  const otros = useRef(otrosPresentes);
  const depsRef = useRef(deps);
  const reloj = useRef({ ultimoCambio: -Infinity, ultimoGuardado: -Infinity, sinGuardar: false });
  otros.current = otrosPresentes;
  depsRef.current = deps;

  /** Cambia el ADN: mete el anterior en deshacer (tope 50), vacía rehacer y deja pendiente el guardado. */
  const mover = (siguiente: AdnAvatar) => {
    pasados.current.push(adnRef.current);
    if (pasados.current.length > MAX_PASOS) pasados.current.shift();
    futuros.current = [];
    adnRef.current = siguiente;
    setAdn(siguiente);
    setNiveles({ deshacer: true, rehacer: false });
    const r = reloj.current;
    r.sinGuardar = true;
    r.ultimoCambio = Date.now();
  };

  const guardarAhor = (cerrando: boolean) => {
    const r = reloj.current;
    if (!r.sinGuardar) return;
    if (!cerrando && !debeGuardar({ sinGuardar: true, ultimoCambio: r.ultimoCambio, ultimoGuardado: r.ultimoGuardado, ahora: Date.now(), cerrando: false })) return;
    r.sinGuardar = false;
    r.ultimoGuardado = Date.now();
    Promise.resolve(depsRef.current.guardar(adnRef.current)).catch(() => { r.sinGuardar = true; });
  };

  const aplicar = useCallback((c: CambioAvatar) => {
    const f = aplicarCambio(adnRef.current, c);
    if (f === adnRef.current) return;
    encolar(cola.current, c);
    mover(f);
  }, []);

  const deshacer = useCallback(() => {
    const p = pasados.current.pop();
    if (!p) return;
    futuros.current.push(adnRef.current);
    adnRef.current = p;
    setAdn(p);
    setNiveles({ deshacer: pasados.current.length > 0, rehacer: true });
    const r = reloj.current;
    r.sinGuardar = true;
    r.ultimoCambio = Date.now();
  }, []);

  const rehacer = useCallback(() => {
    const f = futuros.current.pop();
    if (!f) return;
    pasados.current.push(adnRef.current);
    adnRef.current = f;
    setAdn(f);
    setNiveles({ deshacer: true, rehacer: futuros.current.length > 0 });
    const r = reloj.current;
    r.sinGuardar = true;
    r.ultimoCambio = Date.now();
  }, []);

  /** Mueve un CC del mando aplicando `sanearCambio` a través de `aplicarCambio`. */
  const moverCC = (cc: number, valor: number) => {
    const mapa = depsRef.current.mapeoMidi ?? CC_DEFECTO;
    const c = cambioDeCC(mapa, cc, valor);
    if (c) aplicar(c);
  };

  const conectarMidi = useCallback(async () => {
    const nav = window.navigator as Navigator;
    if (!nav.requestMIDIAccess) {
      setMensajeMidi("Este navegador no tiene Web MIDI: no se puede conectar un mando aquí.");
      return;
    }
    try {
      setMensajeMidi("Esperando tu permiso de MIDI…");
      const acceso = await nav.requestMIDIAccess({ sysex: false });
      const escuchar = (m: MIDIInput) => {
        m.onmidimessage = (e) => {
          const d = e.data;
          if (d && d.length === 3 && (d[0] & 0xf0) === 0xb0) moverCC(d[1], d[2]);
        };
      };
      for (const m of acceso.inputs.values()) escuchar(m);
      acceso.onstatechange = () => { for (const m of acceso.inputs.values()) escuchar(m); };
      setMensajeMidi(acceso.inputs.size
        ? `Mando MIDI conectado: ${acceso.inputs.size} entrada(s), CC 20–27 mueven los deslizadores.`
        : "Permiso concedido, pero no hay ninguna entrada MIDI: enchúfala y se cuelga sola.");
    } catch {
      setMensajeMidi("El permiso de MIDI se denegó o falló: el editor sigue sin mando.");
    }
  }, []);

  const dictar = useCallback(async (frase: string) => {
    const f = frase.trim();
    if (!f) return;
    const { cambios, sinEntender } = cambiosDesdeFrase(f, adnRef.current);
    for (const c of cambios) aplicar(c);
    const pendiente = sinEntender.slice(0, 3).join("» «");
    if (!sinEntender.length) {
      setMensajeVoz(cambios.length ? `Aplicado${cambios.length === 1 ? "" : "s"}: ${cambios.length} cambio${cambios.length === 1 ? "" : "s"}.` : "No entendí nada de esa frase.");
      return;
    }
    const llamar = depsRef.current.astraura;
    if (!llamar) {
      setMensajeVoz(`No entendí «${pendiente}» y aquí no hay modelo de Astraura disponible para traducirlo.`);
      return;
    }
    setMensajeVoz(`Lo que no entendí («${pendiente}») va para Astraura…`);
    try {
      const cs = cambiosDeAstraura((await llamar(INSTRUCCION_ASTRAURA, sinEntender.join(", "))) ?? "");
      if (!cs.length) { setMensajeVoz(`Astraura no devolvió cambios válidos para «${pendiente}».`); return; }
      for (const c of cs) aplicar(c);
      setMensajeVoz(`Astraura tradujo «${pendiente}»: ${cs.length} cambio${cs.length === 1 ? "" : "s"} aplicado${cs.length === 1 ? "" : "s"}.`);
    } catch {
      setMensajeVoz(`Astraura no respondió: «${pendiente}» queda sin aplicar.`);
    }
  }, [aplicar]);

  /** Latido del editor: emite cada tanto a los presentes y guarda tras la calma. */
  useEffect(() => {
    const tic = () => {
      const ahora = Date.now();
      const envio = lote(cola.current, ahora, otros.current);
      if (envio?.length) depsRef.current.emitir?.(envio);
      if (reloj.current.sinGuardar) guardarAhor(false);
    };
    const h = window.setInterval(tic, 250);
    return () => window.clearInterval(h);
  }, []);

  const cerrar = useCallback(() => guardarAhor(true), []);

  return { adn, puedeDeshacer: niveles.deshacer, puedeRehacer: niveles.rehacer, mensajeVoz, mensajeMidi, aplicar, deshacer, rehacer, dictar, conectarMidi, cerrar };
}
