"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { publicarSenales, type FilaPublicable } from "@/lib/senales/espectro/publicar";
import { uidActual } from "@/lib/consumo/usuario";
import type { SenalesMedio } from "@/lib/neurons/senales-medio";
import { createClient } from "@/utils/supabase/client";

export interface EntradaPublicacion {
  deviceId: string;
  medioId: string;
  medioTipo: string;
  medioEtiqueta: string;
  senales: SenalesMedio;
  ahora: number;
}

export interface CapasHabilitadas {
  publica: boolean;
  comunidad: boolean;
  privada: boolean;
}

function bandaPorMedio(tipo: string): string {
  switch (tipo) {
    case "wifi":
      return "2,4/5 GHz Wi-Fi";
    case "bluetooth":
      return "2,4 GHz BLE";
    case "lora":
      return "868/915 MHz LoRa";
    case "malla":
      return "WebRTC P2P";
    case "internet":
      return "IP";
    case "serie":
      return "Serie";
    default:
      return "desconocida";
  }
}

function frecuenciaPorMedio(tipo: string): number {
  switch (tipo) {
    case "wifi":
      return 2450000;
    case "bluetooth":
      return 2440000;
    case "lora":
      return 868000;
    case "malla":
      return 0;
    case "internet":
      return 0;
    case "serie":
      return 0;
    default:
      return 0;
  }
}

function anchoPorMedio(tipo: string): number {
  switch (tipo) {
    case "wifi":
      return 20000;
    case "bluetooth":
      return 2000;
    case "lora":
      return 125;
    case "malla":
      return 0;
    case "internet":
      return 0;
    case "serie":
      return 0;
    default:
      return 0;
  }
}

function fuerzaPorMedio(tipo: string, senales: SenalesMedio): number {
  switch (tipo) {
    case "wifi":
      return senales.internet.mbps ? Math.min(-30, -90 + senales.internet.mbps) : -70;
    case "bluetooth":
      return senales.bluetooth.disponible === true ? -55 : -90;
    case "lora":
      return senales.lora.estado === "ready" ? -85 : -120;
    case "malla":
      return senales.malla.pares > 0 ? -60 : -100;
    case "internet":
      return senales.internet.mbps ? Math.min(-30, -90 + senales.internet.mbps) : -70;
    default:
      return -100;
  }
}

function calidadPorMedio(tipo: string, senales: SenalesMedio): number {
  switch (tipo) {
    case "wifi":
      return senales.internet.mbps ? Math.min(1, senales.internet.mbps / 100) : 0.3;
    case "bluetooth":
      return senales.bluetooth.disponible === true ? 0.7 : 0;
    case "lora":
      return senales.lora.estado === "ready" ? 0.6 : 0;
    case "malla":
      return senales.malla.pares > 0 ? Math.min(1, senales.malla.pares / 5) : 0;
    case "internet":
      return senales.internet.mbps ? Math.min(1, senales.internet.mbps / 100) : 0.3;
    default:
      return 0;
  }
}

function origenPorMedio(tipo: string, senales: SenalesMedio): "medida" | "declarada" | "estimada" {
  switch (tipo) {
    case "wifi":
      return senales.internet.mbps ? "medida" : "estimada";
    case "bluetooth":
      return senales.bluetooth.disponible === true ? "declarada" : "estimada";
    case "lora":
      return senales.lora.estado === "ready" ? "medida" : "estimada";
    case "malla":
      return senales.malla.pares > 0 ? "medida" : "estimada";
    case "internet":
      return senales.internet.mbps ? "medida" : "estimada";
    default:
      return "estimada";
  }
}

function medioActivo(tipo: string, senales: SenalesMedio): boolean {
  switch (tipo) {
    case "wifi":
    case "internet":
      return senales.internet.enLinea;
    case "bluetooth":
      return senales.bluetooth.disponible === true;
    case "lora":
      return senales.lora.estado === "ready";
    case "malla":
      return senales.malla.pares > 0 || senales.malla.otrasCuentas > 0;
    case "serie":
      return senales.serie.disponible;
    default:
      return false;
  }
}

export function senalesMedioAFilasPublicables(
  entrada: EntradaPublicacion,
  capasHabilitadas: ("publica" | "comunidad" | "privada")[]
): FilaPublicable[] {
  const { deviceId, senales, ahora } = entrada;
  const filas: FilaPublicable[] = [];

  const todosLosMedios: Array<{ tipo: string; capa: "publica" | "comunidad" | "privada" }> = [];

  for (const capa of capasHabilitadas) {
    todosLosMedios.push({ tipo: "wifi", capa });
    todosLosMedios.push({ tipo: "bluetooth", capa });
    todosLosMedios.push({ tipo: "lora", capa });
    todosLosMedios.push({ tipo: "malla", capa });
    todosLosMedios.push({ tipo: "internet", capa });
  }

  for (const { tipo, capa } of todosLosMedios) {
    if (!medioActivo(tipo, senales)) continue;

    const fila: FilaPublicable = {
      device_id: deviceId,
      capa,
      comunidad: capa === "comunidad" ? "comunidad" : null,
      medio: tipo,
      banda: bandaPorMedio(tipo),
      frecuencia_khz: frecuenciaPorMedio(tipo),
      ancho_khz: anchoPorMedio(tipo),
      fuerza_dbm: fuerzaPorMedio(tipo, senales),
      calidad: calidadPorMedio(tipo, senales),
      origen: origenPorMedio(tipo, senales),
      zona: null,
      ficha: null,
      medido_en: new Date(ahora).toISOString(),
    };
    filas.push(fila);
  }

  return filas;
}

export function usePublicarSenales(
  entrada: EntradaPublicacion | null,
  capas: CapasHabilitadas
): { publicar: () => Promise<void>; publicando: boolean; ultimaPublicacion: Date | null; error: string | null } {
  const publicandoRef = useRef(false);
  const [publicando, setPublicando] = useState(false);
  const [ultimaPublicacion, setUltimaPublicacion] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capasHabilitadas = useMemo(
    () => {
      const arr: ("publica" | "comunidad" | "privada")[] = [];
      if (capas.publica) arr.push("publica");
      if (capas.comunidad) arr.push("comunidad");
      if (capas.privada) arr.push("privada");
      return arr;
    },
    [capas.publica, capas.comunidad, capas.privada]
  );

  const publicar = useCallback(async () => {
    if (!entrada || capasHabilitadas.length === 0) return;
    if (publicandoRef.current) return;

    publicandoRef.current = true;
    setPublicando(true);
    setError(null);

    try {
      const uid = await uidActual();
      const filas = senalesMedioAFilasPublicables(entrada, capasHabilitadas);

      if (filas.length === 0) {
        setPublicando(false);
        publicandoRef.current = false;
        return;
      }

      const resultado = await publicarSenales({
        cliente: createClient(),
        uid,
        filas,
        ahora: new Date(entrada.ahora),
      });

      if (resultado.ok) {
        setUltimaPublicacion(new Date());
      } else {
        setError(resultado.motivo ?? "Error desconocido al publicar");
      }
    } catch (e: any) {
      setError(e.message ?? "Error al publicar");
    } finally {
      setPublicando(false);
      publicandoRef.current = false;
    }
  }, [entrada, capasHabilitadas]);

  useEffect(() => {
    if (!entrada || capasHabilitadas.length === 0) return;

    const intervalo = setInterval(() => {
      publicar();
    }, 60_000);

    publicar();

    return () => clearInterval(intervalo);
  }, [entrada, capasHabilitadas, publicar]);

  return { publicar, publicando, ultimaPublicacion, error };
}