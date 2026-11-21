"use client";

/**
 * useMarcasGeo — reúne las fuentes en vivo de MI cuenta y devuelve las marcas del Mapa (MAP1114C).
 * Solo lectura de: filas de la malla, presencia en vivo, antenas medidas de este medio, capas anunciadas, ficha de
 * este aparato y la última posición que midió este aparato. Nada se inventa.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMallaNeuronasEstado, type FichaDispositivo } from "@/lib/network/malla-neuronas";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import { medirSenales, type SenalesMedio } from "@/lib/neurons/senales-medio";
import { describirMedio, type DescripcionMedio } from "@/lib/neurons/medio";
import { construirMarcas, type MarcaGeo } from "@/lib/senales/geo/marcas";
import { CAPAS_SENALES } from "@/lib/senales/geo/capas";
import { camposDeCapa, contarSenalesSinZona, type Campo } from "@/lib/senales/geo/cobertura";
import {
  EVENTO_POSICION, fijarCompartirPosicion, guardarPosicionCruda, leerCompartirPosicion, leerPosicionCruda,
} from "@/lib/senales/geo/almacen-posicion";
import type { PosicionCruda } from "@/lib/senales/geo/modelo-geo";
import { ESTADO_INICIAL, type CanalPosicion, type EstadoCanalPosicion } from "@/lib/senales/geo/canal-posicion";
import { observarPermisoUbicacion } from "@/lib/senales/geo/fuente-posicion";
import { mismosEnlaces, type EnlaceMedido } from "@/lib/senales/geo/enlaces-medidos";
import { abrirCanalPosicionReal, leerEnlacesMedidosReales } from "@/lib/senales/geo/fuentes-vivas";
import { useSenalesPublicadas, type EstadoSenalesPublicadas } from "@/lib/senales/espectro/usar-senales-publicadas";
import type { MiPosicion } from "@/components/map/map-view-extension";
import { useAhora } from "../use-mapa-vivo";

export type PermisoUbicacion = "concedido" | "denegado" | "por-pedir" | "desconocido";

export interface MarcasGeo {
  marcas: MarcaGeo[];
  presenciaConectada: boolean;
  ahora: number;
  permiso: PermisoUbicacion;
  compartir: boolean;
  fijarCompartir: (on: boolean) => void;
  /** Cada medida de la posición de este aparato (la vigilancia la hace `MapView`). */
  alMiPosicion: (p: MiPosicion) => void;
  errorUbicacion: string | null;
  alErrorUbicacion: (motivo: string) => void;
  /** Cuándo empezó esta vista (epoch ms): para decir «desde cuándo» no hay posición. */
  desde: number;
  /** (MAP1114D) Unión al canal privado de posición y posiciones llegadas por él. */
  canal: EstadoCanalPosicion;
  /** (MAP1114D) Enlaces con medida real (Bluetooth, red local) entre este aparato y las demás neuronas. */
  enlaces: EnlaceMedido[];
  /** (AUD1117) Lectura de las señales publicadas por toda la red (`useSenalesPublicadas`), que pintan
   * las capas `red-*`; con lectura fallida, su `estado` y `motivo` son lo que dice el panel. */
  publicadas: EstadoSenalesPublicadas;
  /** (MRA10b) Campos de las capas `red-*`: solo zonas aproximadas publicadas, nunca un punto exacto;
   * `sinZona` cuenta aparte las señales que no se pueden dibujar. */
  camposRed: { campos: Record<string, Campo[]>; sinZona: Record<string, number> };
  /** (AUD1117F4) Señales medidas de ESTE medio, para publicarlas en el espectrómetro. */
  senales: SenalesMedio | null;
  /** (AUD1117F4) Id de este dispositivo (neuronId) para publicar sus señales. */
  deviceId: string | null;
  /** (AUD1117F4) Descripción de este medio (id, tipo, etiqueta) para publicar sus señales. */
  medio: DescripcionMedio | null;
}

/** Cada cuánto se reintenta unirse al canal privado si fue rechazado (por ejemplo, tras aplicar la migración o iniciar sesión). */
export const REINTENTO_CANAL_MS = 60_000;
const ENLACES_CADA_MS = 5_000;
const PUBLICAR_CADA_MS = 4_000;

export function usePermisoUbicacion(): PermisoUbicacion {
  const [p, setP] = useState<PermisoUbicacion>("desconocido");
  // (UBI1114K) En la app nativa lo dice el sistema (`ubicacion_estado`); en un navegador, `navigator.permissions`.
  useEffect(() => observarPermisoUbicacion(setP), []);
  return p;
}

export function useMarcasGeo(): MarcasGeo {
  const malla = useMallaNeuronasEstado();
  const presencia = usePresenciaNeuronas();
  const ahora = useAhora();
  const permiso = usePermisoUbicacion();
  // (AUD1117) Señales publicadas por toda la red: alimentan las capas `red-*` del mapa.
  const publicadas = useSenalesPublicadas();
  const [desde] = useState(() => Date.now());
  const [senales, setSenales] = useState<SenalesMedio | null>(null);
  const [capas, setCapas] = useState<string[] | null>(null);
  const [ficha, setFicha] = useState<FichaDispositivo | null>(null);
  const [cruda, setCruda] = useState<PosicionCruda | null>(null);
  const [compartir, setCompartir] = useState(true);
  const [errorUbicacion, setError] = useState<string | null>(null);
  const [medio, setMedio] = useState<DescripcionMedio | null>(null);

  const leerLocal = useCallback(() => {
    setCruda(leerPosicionCruda());
    setCompartir(leerCompartirPosicion());
  }, []);
  useEffect(() => {
    leerLocal();
    window.addEventListener(EVENTO_POSICION, leerLocal);
    return () => window.removeEventListener(EVENTO_POSICION, leerLocal);
  }, [leerLocal]);

  // (AUD1117F4) Descripción de ESTE medio: se lee una vez al montar (el HTML del servidor no lo conoce).
  useEffect(() => {
    try { setMedio(describirMedio()); } catch { setMedio(null); }
  }, []);

  useEffect(() => {
    let vivo = true;
    const medir = () => {
      void medirSenales().then((s) => vivo && setSenales(s)).catch(() => vivo && setSenales(null));
      void import("@/lib/malla/anuncio-capas").then((m) => vivo && setCapas(m.misCapasAnunciadas())).catch(() => vivo && setCapas(null));
    };
    medir();
    const t = setInterval(() => { if (document.visibilityState !== "hidden") medir(); }, 30_000);
    // La ficha de ESTE aparato (RAM, motor local, modelos): se arma una vez y se refresca cada 5 min.
    const fichar = () => {
      void (async () => {
        try {
          const n = await import("@/lib/neurons/neurons");
          const cap = await n.detectCapabilities();
          const m = await import("@/lib/network/malla-neuronas");
          const f = await m.construirFicha({ capabilities: { memoryGb: cap.memoryGb } } as never);
          if (vivo) setFicha(f);
        } catch { if (vivo) setFicha(null); }
      })();
    };
    fichar();
    const t2 = setInterval(fichar, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); clearInterval(t2); };
  }, []);

  const filas = malla.misDispositivos;
  const miNeurona = filas.find((f) => f.esEsteDispositivo)?.neuronId ?? null;

  // (MAP1114D) Canal PRIVADO de posición: se abre con el id de esta neurona y se reintenta si lo rechazan.
  const [canal, setCanal] = useState<EstadoCanalPosicion>(ESTADO_INICIAL);
  const canalRef = useRef<CanalPosicion | null>(null);
  useEffect(() => {
    if (!miNeurona) return;
    let vivo = true;
    let abierto: CanalPosicion | null = null;
    let baja: (() => void) | null = null;
    let reintento: ReturnType<typeof setTimeout> | null = null;
    const abrir = async () => {
      const c = await abrirCanalPosicionReal(miNeurona);
      if (!vivo) { c.cerrar(); return; }
      abierto = c;
      canalRef.current = c;
      setCanal(c.estado());
      baja = c.suscribir(() => {
        const e = c.estado();
        setCanal(e);
        if (e.union === "rechazado" && !reintento && vivo) {
          reintento = setTimeout(() => { reintento = null; if (!vivo) return; baja?.(); c.cerrar(); void abrir(); }, REINTENTO_CANAL_MS);
        }
      });
      if (c.estado().union === "rechazado" && !reintento) {
        reintento = setTimeout(() => { reintento = null; if (!vivo) return; baja?.(); c.cerrar(); void abrir(); }, REINTENTO_CANAL_MS);
      }
    };
    void abrir();
    return () => { vivo = false; if (reintento) clearTimeout(reintento); baja?.(); abierto?.cerrar(); canalRef.current = null; };
  }, [miNeurona]);

  // Mi posición sale SOLO por ese canal y SOLO si está unido; con el interruptor apagado se retira.
  const ultimoPub = useRef(0);
  useEffect(() => {
    const c = canalRef.current;
    if (!c || canal.union !== "unido") return;
    const enviar = () => { ultimoPub.current = Date.now(); void c.publicar(compartir ? cruda : null); };
    const espera = Math.max(0, PUBLICAR_CADA_MS - (Date.now() - ultimoPub.current));
    if (espera === 0) { enviar(); return; }
    const t = setTimeout(enviar, espera);
    return () => clearTimeout(t);
  }, [canal.union, compartir, cruda]);

  // (MAP1114D) Enlaces con medida real, leídos cada pocos segundos.
  const [enlaces, setEnlaces] = useState<EnlaceMedido[]>([]);
  useEffect(() => {
    let vivo = true;
    const leer = () => { void leerEnlacesMedidosReales().then((l) => vivo && setEnlaces((p) => (mismosEnlaces(p, l) ? p : l))); };
    leer();
    const t = setInterval(() => { if (document.visibilityState !== "hidden") leer(); }, ENLACES_CADA_MS);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  const alMiPosicion = useCallback((p: MiPosicion) => {
    setError(null);
    guardarPosicionCruda({ lat: p.lat, lon: p.lng, precisionM: p.accuracy, t: p.t });
  }, []);

  const mia = filas.find((f) => f.esEsteDispositivo);
  const deviceId = mia?.neuronId ?? null;

  const marcas = useMemo(() => {
    return construirMarcas({
      filas,
      medios: presencia.medios,
      yo: { neuronaId: deviceId, nombre: mia?.nombre ?? "Este aparato", plataforma: mia?.plataforma, senales, capas, posicion: cruda, ficha },
      ahora,
      posiciones: canal.posiciones,
      canal: { unido: canal.union === "unido", motivo: canal.motivo },
      enlaces,
      publicadas: publicadas.senales,
    });
  }, [filas, presencia.medios, deviceId, mia?.nombre, mia?.plataforma, senales, capas, cruda, ficha, ahora, canal, enlaces, publicadas.senales]);

  // (MRA10b) A `camposDeCapa` solo le llega lo que necesita: las señales publicadas de cada capa `red-*`
  // (con su zona, nunca un punto) y las marcas para el resto de capas.
  const camposRed = useMemo(() => {
    const campos: Record<string, Campo[]> = {};
    const sinZona: Record<string, number> = {};
    for (const capa of CAPAS_SENALES) {
      if (capa.grupo !== "red") continue;
      campos[capa.id] = camposDeCapa(capa, marcas, ahora, publicadas.senales);
      sinZona[capa.id] = contarSenalesSinZona(capa, marcas, publicadas.senales);
    }
    return { campos, sinZona };
  }, [marcas, ahora, publicadas.senales]);

  return {
    marcas, presenciaConectada: presencia.conectado, ahora, permiso, compartir,
    fijarCompartir: fijarCompartirPosicion, alMiPosicion, errorUbicacion, alErrorUbicacion: setError, desde, canal, enlaces, publicadas, camposRed,
    senales, deviceId, medio,
  };
}
