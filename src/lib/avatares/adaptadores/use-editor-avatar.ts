"use client";
/**
 * Editor de avatar en tiempo real (AV1011B). Contrato: architecture/astraura-avatares-3d.md §3.
 *
 * El editor, el dictado, un mando MIDI y Astraura producen el MISMO `CambioAvatar`. Aquí se aplica
 * al instante en pantalla, se agrupa por clave para los demás presentes (nunca si no hay nadie) y
 * se guarda en el almacén de AV1011D tras 5 s de calma y como mucho cada 30 s, o al cerrar.
 * Lo que no entiende el dictado local va a Astraura, que solo puede devolver una lista JSON de
 * cambios; cada uno pasa por `sanearCambio`. PURO donde se puede: el reloj y las dependencias se
 * inyectan, y las pruebas usan reloj falso.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AdnAvatar } from "../adn/adn";
import {
  CALMA_GUARDADO_MS,
  ENTRE_GUARDADOS_MS,
  aplicarCambio,
  crearColaEnvio,
  debeGuardar,
  diffAdn,
  encolar,
  intervaloEnvioMs,
  lote,
  sanearCambio,
  type CambioAvatar,
} from "../adn/cambios";
import { cambiosDesdeFrase } from "../adn/dictado";
import { eventoDeLinea } from "@/lib/astraura/conversacion-rapida";
import type { SavedResource } from "@/lib/library-store";

export const TOPE_HISTORIAL = 50;
/** Tipo de elemento de la Biblioteca que el editor admite como pieza de avatar. */
export const KIND_PIEZA_AVATAR = "pieza-avatar";

export interface DependenciasEditorAvatar {
  /** Almacén de AV1011D: guarda el ADN (normalmente `saveAdnToLibrary`). */
  guardar: (adn: AdnAvatar) => Promise<void> | void;
  /** Publica un lote de cambios a los demás presentes. */
  emitir: (cambios: CambioAvatar[]) => void;
  /** Cuántas personas (aparte de ti) están mirando este avatar ahora mismo. */
  otrosPresentes: () => number;
  /** Traduce a cambios lo que el dictado local no entendió. `null` = no hay modelo disponible. */
  interpretarConAstraura?: (frase: string, adn: AdnAvatar) => Promise<unknown>;
  /** Reloj inyectable (pruebas con reloj falso). */
  ahora?: () => number;
}

export interface ResultadoDictadoAvatar {
  cambios: CambioAvatar[];
  sinEntender: string[];
  aviso: string | null;
}

export interface EstadoVozAvatar {
  fase: "libre" | "pensando" | "sin-modelo";
  frase: string;
  cambios: number;
  aviso: string | null;
}

/** Referencia interna (`biblioteca:`/`genesis:`) de una pieza guardada; nunca una URL externa. */
export function refDePieza(r: Pick<SavedResource, "id" | "url">): string {
  const u = (r.url ?? "").trim();
  return /^(biblioteca|genesis):[\w./:-]{1,160}$/.test(u) ? u : `biblioteca:${r.id}`;
}

/** Piezas de avatar que hay de verdad en la Biblioteca (las demás no valen para ninguna ranura). */
export function piezasDeBiblioteca(items: readonly SavedResource[]): SavedResource[] {
  return items.filter((i) => i.kind === KIND_PIEZA_AVATAR);
}

/** Saca la primera lista JSON de una respuesta de modelo, aunque venga envuelta en texto o markdown. */
export function listaDeCambios(texto: string): unknown[] {
  const m = texto.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const v: unknown = JSON.parse(m[0]);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** La única instrucción que se le da a Astraura: devolver SOLO la lista JSON de cambios. */
export function instruccionAstraura(frase: string, adn: AdnAvatar): string {
  const actual = {
    morfologia: adn.morfologia,
    materiales: adn.materiales,
    piezas: adn.piezas,
    expresionBase: adn.expresionBase,
    aura: adn.aura,
    movimiento: adn.movimiento,
    visibilidad: adn.visibilidad,
  };
  return [
    "Eres el editor de avatares de StarSeed OS.",
    `La persona dijo: «${frase.slice(0, 200)}».`,
    "Devuelve SOLO una lista JSON (sin explicación, sin markdown) de objetos CambioAvatar.",
    'Formatos válidos: {"op":"morfologia","clave":"altura|complexion|cabeza|hombros|cintura|piernas|brazos|estilizado","valor":0..1};',
    '{"op":"material","slot":"piel|cabello|ojos|ropa-1|ropa-2|acento|aura","campo":"color|metal|rugosidad|emisivo","valor":"#rrggbb"|0..1};',
    '{"op":"pieza","slot":"cabeza|cabello|torso|piernas|cara|pies|manos|accesorio-1|espalda|accesorio-2|mascota","ref":"biblioteca:…"|null};',
    '{"op":"expresion","clave":"happy|sad|angry|relaxed|surprised|neutral|aa|…","valor":0..1};',
    '{"op":"aura","campo":"tono|intensidad|ligadaEmocion","valor":número|booleano};',
    '{"op":"movimiento","campo":"energia|amplitud|ritmo|postura","valor":0..1};',
    '{"op":"nombre","valor":"texto"}; {"op":"visibilidad","valor":"privado|grupo|publico"}.',
    "Nunca inventes URLs: una pieza solo puede ser una referencia interna de la Biblioteca.",
    `Estado actual del avatar: ${JSON.stringify(actual).slice(0, 1500)}`,
  ].join("\n");
}

/** Adaptador por defecto: la conversación en vivo del OS (local primero, nube gratuita después). */
async function astrauraEnRed(frase: string, adn: AdnAvatar): Promise<unknown> {
  const r = await fetch("/api/astraura/conversacion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texto: instruccionAstraura(frase, adn),
      historial: [],
      persona: { id: "editor-avatar", nombre: "Editor de avatar" },
    }),
  });
  if (!r.ok || !r.body) return null;
  const lector = r.body.getReader();
  const dec = new TextDecoder();
  let resto = "", texto = "";
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const lineas = resto.split("\n");
    resto = lineas.pop() ?? "";
    for (const l of lineas) {
      const e = eventoDeLinea(l);
      if (e?.t === "token") texto += e.v;
      else if (e?.t === "error") return null;
    }
  }
  return listaDeCambios(texto);
}

/**
 * Hook del editor: ADN vivo, deshacer/rehacer (pila de ADN, tope 50), envío agrupado a los demás
 * presentes y guardado con calma. Todos los efectos de fuera (almacén, emisión, reloj, Astraura) se
 * inyectan; el hook no toca `localStorage`, la red ni el reloj real por su cuenta.
 */
export function useEditorAvatar(adnInicial: AdnAvatar, deps: DependenciasEditorAvatar) {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const [adn, setAdn] = useState(adnInicial);
  const [marcas, setMarcas] = useState({ pasado: 0, futuro: 0 });
  const [estadoGuardado, setEstadoGuardado] = useState<"limpio" | "pendiente" | "guardando" | "error">("limpio");
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  const [voz, setVoz] = useState<EstadoVozAvatar>({ fase: "libre", frase: "", cambios: 0, aviso: null });

  const adnRef = useRef(adnInicial);
  const pasado = useRef<AdnAvatar[]>([]);
  const futuro = useRef<AdnAvatar[]>([]);
  const cola = useRef(crearColaEnvio());
  const envioTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardadoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sinGuardar = useRef(false);
  const ultimoCambio = useRef(depsRef.current.ahora?.() ?? Date.now());
  const ultimoGuardado = useRef(-Infinity);
  const guardando = useRef(false);
  const vivo = useRef(true);

  const ahora = (): number => depsRef.current.ahora?.() ?? Date.now();
  const enviarPendientesRef = useRef<() => void>(() => {});
  const programarEnvioRef = useRef<() => void>(() => {});
  const guardarAhoraRef = useRef<(cerrando: boolean) => void>(() => {});
  const programarGuardadoRef = useRef<() => void>(() => {});

  const enviarPendientes = (): void => {
    const l = lote(cola.current, ahora(), depsRef.current.otrosPresentes());
    if (l && l.length > 0) depsRef.current.emitir(l);
  };

  /** Un solo temporizador de envío: al saltar, manda lo pendiente y, si queda algo, vuelve a esperar. */
  const programarEnvio = (): void => {
    if (envioTimer.current !== null || cola.current.pendientes.size === 0) return;
    const n = depsRef.current.otrosPresentes();
    if (n <= 0) { cola.current.pendientes.clear(); return; }
    envioTimer.current = setTimeout(() => {
      envioTimer.current = null;
      enviarPendientesRef.current();
      programarEnvioRef.current();
    }, intervaloEnvioMs(n));
  };

  const guardarAhora = (cerrando: boolean): void => {
    const toca = debeGuardar({
      sinGuardar: sinGuardar.current,
      ultimoCambio: ultimoCambio.current,
      ultimoGuardado: ultimoGuardado.current,
      ahora: ahora(),
      cerrando,
    });
    if (!toca || guardando.current) return;
    if (guardadoTimer.current !== null) { clearTimeout(guardadoTimer.current); guardadoTimer.current = null; }
    guardando.current = true;
    sinGuardar.current = false;
    if (vivo.current) { setEstadoGuardado("guardando"); setAvisoGuardado(null); }
    const copia = adnRef.current;
    void Promise.resolve(depsRef.current.guardar(copia))
      .then(() => {
        ultimoGuardado.current = ahora();
        if (!vivo.current) return;
        setEstadoGuardado("limpio");
        setAvisoGuardado(null);
      })
      .catch((e: unknown) => {
        sinGuardar.current = true;
        if (!vivo.current) return;
        setEstadoGuardado("error");
        setAvisoGuardado(e instanceof Error ? e.message : "No se pudo guardar el avatar.");
      })
      .finally(() => {
        guardando.current = false;
        if (sinGuardar.current) programarGuardadoRef.current();
      });
  };

  /** Tras 5 s de calma y 30 s desde el último guardado. Si aún no toca, vuelve a mirar a su hora. */
  const programarGuardado = (): void => {
    if (guardadoTimer.current !== null) { clearTimeout(guardadoTimer.current); guardadoTimer.current = null; }
    if (!sinGuardar.current || !vivo.current) return;
    const t = ahora();
    const faltaCalma = Math.max(0, CALMA_GUARDADO_MS - (t - ultimoCambio.current));
    const faltaEntre = ultimoGuardado.current === -Infinity ? 0 : Math.max(0, ENTRE_GUARDADOS_MS - (t - ultimoGuardado.current));
    guardadoTimer.current = setTimeout(() => {
      guardadoTimer.current = null;
      const t2 = ahora();
      const toca = debeGuardar({
        sinGuardar: sinGuardar.current,
        ultimoCambio: ultimoCambio.current,
        ultimoGuardado: ultimoGuardado.current,
        ahora: t2,
        cerrando: false,
      });
      if (toca) guardarAhoraRef.current(false);
      else programarGuardadoRef.current();
    }, Math.max(faltaCalma, faltaEntre));
  };

  enviarPendientesRef.current = enviarPendientes;
  programarEnvioRef.current = programarEnvio;
  guardarAhoraRef.current = guardarAhora;
  programarGuardadoRef.current = programarGuardado;

  const marcarCambio = (desde: AdnAvatar): void => {
    sinGuardar.current = true;
    ultimoCambio.current = ahora();
    if (vivo.current) setEstadoGuardado("pendiente");
    void desde;
    programarGuardadoRef.current();
  };

  /** Aplica un cambio YA (sin red), lo apila para deshacer y lo encola para los demás presentes. */
  const aplicar = useCallback((cambio: CambioAvatar): boolean => {
    const actual = adnRef.current;
    const siguiente = aplicarCambio(actual, cambio);
    if (siguiente === actual) return false;
    adnRef.current = siguiente;
    setAdn(siguiente);
    pasado.current = [...pasado.current, actual].slice(-TOPE_HISTORIAL);
    futuro.current = [];
    setMarcas({ pasado: pasado.current.length, futuro: 0 });
    encolar(cola.current, cambio);
    programarEnvioRef.current();
    marcarCambio(actual);
    return true;
  }, []);

  const aplicarVarios = useCallback((cambios: readonly CambioAvatar[]): number => {
    let n = 0;
    for (const c of cambios) if (aplicar(c)) n++;
    return n;
  }, [aplicar]);

  const deshacer = useCallback((): boolean => {
    const anterior = pasado.current[pasado.current.length - 1];
    if (!anterior) return false;
    const actual = adnRef.current;
    pasado.current = pasado.current.slice(0, -1);
    futuro.current = [actual, ...futuro.current].slice(0, TOPE_HISTORIAL);
    adnRef.current = anterior;
    setAdn(anterior);
    setMarcas({ pasado: pasado.current.length, futuro: futuro.current.length });
    for (const c of diffAdn(actual, anterior)) encolar(cola.current, c);
    programarEnvioRef.current();
    marcarCambio(actual);
    return true;
  }, []);

  const rehacer = useCallback((): boolean => {
    const siguiente = futuro.current[0];
    if (!siguiente) return false;
    const actual = adnRef.current;
    futuro.current = futuro.current.slice(1);
    pasado.current = [...pasado.current, actual].slice(-TOPE_HISTORIAL);
    adnRef.current = siguiente;
    setAdn(siguiente);
    setMarcas({ pasado: pasado.current.length, futuro: futuro.current.length });
    for (const c of diffAdn(actual, siguiente)) encolar(cola.current, c);
    programarEnvioRef.current();
    marcarCambio(actual);
    return true;
  }, []);

  /** Voz o texto: primero el dictado local (sin red); lo que no entiende va a Astraura y se filtra. */
  const dictar = useCallback(async (frase: string): Promise<ResultadoDictadoAvatar> => {
    const limpia = frase.trim();
    if (!limpia) return { cambios: [], sinEntender: [], aviso: "No se oyó nada." };
    const { cambios, sinEntender } = cambiosDesdeFrase(limpia, adnRef.current);
    const aplicados = aplicarVarios(cambios);
    if (!sinEntender.length) {
      if (vivo.current) setVoz({ fase: "libre", frase: limpia, cambios: aplicados, aviso: null });
      return { cambios, sinEntender, aviso: null };
    }
    if (vivo.current) setVoz({ fase: "pensando", frase: limpia, cambios: aplicados, aviso: null });
    const interpretar = depsRef.current.interpretarConAstraura ?? astrauraEnRed;
    let crudos: unknown = null;
    try { crudos = await interpretar(limpia, adnRef.current); } catch { crudos = null; }
    const lista = Array.isArray(crudos) ? crudos : typeof crudos === "string" ? listaDeCambios(crudos) : [];
    const extras = lista.map(sanearCambio).filter((c): c is CambioAvatar => c !== null);
    if (extras.length === 0) {
      const aviso = sinEntender.length
        ? `No entendí «${sinEntender.join("», «")}» y Astraura no está disponible o no devolvió cambios válidos: el avatar se queda como estaba.`
        : null;
      if (vivo.current) setVoz({ fase: "sin-modelo", frase: limpia, cambios: aplicados, aviso });
      return { cambios, sinEntender, aviso };
    }
    const mas = aplicarVarios(extras);
    if (vivo.current) setVoz({ fase: "libre", frase: limpia, cambios: aplicados + mas, aviso: null });
    return { cambios: [...cambios, ...extras], sinEntender, aviso: null };
  }, [aplicarVarios]);

  /** Al cerrar el editor se guarda aunque no hayan pasado los 5 s ni los 30 s. */
  const cerrar = useCallback((): void => {
    if (guardadoTimer.current !== null) { clearTimeout(guardadoTimer.current); guardadoTimer.current = null; }
    guardarAhoraRef.current(true);
  }, []);

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
      if (envioTimer.current !== null) clearTimeout(envioTimer.current);
      if (guardadoTimer.current !== null) clearTimeout(guardadoTimer.current);
      if (sinGuardar.current) void Promise.resolve(depsRef.current.guardar(adnRef.current)).catch(() => {});
    };
  }, []);

  return {
    adn,
    estadoGuardado,
    avisoGuardado,
    voz,
    puedeDeshacer: marcas.pasado > 0,
    puedeRehacer: marcas.futuro > 0,
    aplicar,
    aplicarVarios,
    deshacer,
    rehacer,
    dictar,
    cerrar,
    instruccion: (frase: string): string => instruccionAstraura(frase, adnRef.current),
  };
}
