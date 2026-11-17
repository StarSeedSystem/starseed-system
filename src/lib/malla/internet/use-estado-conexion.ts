"use client";

/**
 * Cableado del lector de conexión (contrato de la malla cristalina, §8.2): lee la señal del
 * navegador con `leerConexion`, la clasifica con `clasificarConexion` y vuelve a leer cuando
 * `navigator.connection` dispara `change` vía `suscribirConexion`.
 *
 * El entorno se INYECTA; si falta, se usa el `navigator` real del navegador. «falta en el puente
 * nativo: ver §8.2 del contrato» — la marca de red de pago del lado nativo (Android
 * `isActiveNetworkMetered`) aún no la trae el puente, así que no se pasa `nativa` y
 * `nativaMedida` queda null.
 */

import { useEffect, useMemo, useState } from "react";
import {
  leerConexion,
  suscribirConexion,
  type ConexionNavegador,
  type EntornoConexion,
  type LecturaConexion,
} from "./lector-conexion";
import { clasificarConexion } from "./conexion-limitada";
import { TextosInternet, type EstadoConexion, type FuenteLimitada } from "./tipos";

export interface OpcionesUseEstadoConexion {
  /** Entorno inyectado; si falta, se usa el `navigator` real del navegador. */
  entorno?: EntornoConexion;
  /** Declaración de la persona (§8.2: manda sobre toda señal). Aún sin panel que la escriba: null. */
  declarada?: boolean | null;
}

export interface EstadoConexionViva {
  estado: EstadoConexion;
  fuente: FuenteLimitada;
  motivo: string;
  textoEstado: string;
  textoFuente: string;
  /** Identifica la conexión tal como se leyó: la negativa «Ahora no» vale solo para esta conexión. */
  clave: string;
}

function entornoReal(): EntornoConexion {
  if (typeof window === "undefined") return {};
  const nav = window.navigator as Navigator & { connection?: ConexionNavegador | null };
  return { navigator: { connection: nav.connection ?? null } };
}

/** Firma estructural de la señal inyectada: igual si los datos son iguales, aunque el objeto sea otro. */
function firmaEntorno(entorno?: EntornoConexion): string {
  const c = entorno?.navigator?.connection;
  return [
    typeof c?.type === "string" ? c.type : "-",
    typeof c?.effectiveType === "string" ? c.effectiveType : "-",
    typeof c?.saveData === "boolean" ? String(c.saveData) : "-",
    typeof c?.addEventListener === "function" ? "s" : "n",
    typeof entorno?.nativa?.medida === "function" ? "s" : "n",
  ].join("|");
}

export function useEstadoConexion(opciones: OpcionesUseEstadoConexion = {}): EstadoConexionViva {
  // El entorno se recuerda por su FIRMA y no por la identidad del objeto: un llamador que
  // recrea `{ entorno: {...} }` en cada render (o un test con renderHook) no debe provocar
  // que el efecto vuelva a correr y haga setLectura en bucle (agotaba el heap del worker).
  // Si cambia la señal de verdad, la firma cambia y se vuelve a leer y a suscribir.
  const firma = firmaEntorno(opciones.entorno);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entorno = useMemo(() => opciones.entorno ?? entornoReal(), [firma]);
  const declarada = opciones.declarada ?? null;
  const [lectura, setLectura] = useState<LecturaConexion>(() => leerConexion(entorno));

  useEffect(() => {
    setLectura(leerConexion(entorno));
    return suscribirConexion(entorno, () => setLectura(leerConexion(entorno)));
  }, [entorno]);

  const { estado, fuente, motivo } = clasificarConexion({ declarada, ...lectura });
  const textoEstado = estado === "limitada"
    ? TextosInternet.conexionLimitada
    : estado === "no-limitada"
      ? TextosInternet.conexionNoLimitada
      : TextosInternet.conexionDesconocida;
  const textoFuente = fuente === "declarada"
    ? TextosInternet.fuenteDeclarada
    : fuente === "nativa"
      ? TextosInternet.fuenteNativa
      : fuente === "navegador"
        ? TextosInternet.fuenteNavegador
        : "";
  const marca = (v: boolean | null | undefined): string => (v === null || v === undefined ? "-" : v ? "1" : "0");
  const clave = [
    marca(declarada),
    marca(lectura.nativaMedida),
    lectura.tipo ?? "-",
    marca(lectura.saveData),
    lectura.effectiveType ?? "-",
  ].join("|");
  return { estado, fuente, motivo, textoEstado, textoFuente, clave };
}
