"use client";

/**
 * Estado vivo del aparato (batería, red, medio, sesión) para la cabecera del Centro de Control.
 * Solo lee: no pide permisos ni escribe nada. Cada dato aparece cuando el navegador lo da.
 */
import { useEffect, useState } from "react";
import { hasStarseedSession } from "@/lib/settings-sync";
import { describirMedio } from "@/lib/neurons/medio";
import { redDesdeNavegador, type Bateria, type EstadoAparato, type NavegadorRed, type Red } from "./estado-aparato";

interface BateriaNavegador {
  level: number;
  charging: boolean;
  addEventListener: (tipo: string, fn: () => void) => void;
  removeEventListener: (tipo: string, fn: () => void) => void;
}
type NavegadorConExtras = Navigator & { getBattery?: () => Promise<BateriaNavegador>; connection?: NavegadorRed["connection"] & EventTarget };

const RED_INICIAL: Red = { enLinea: true, tipo: null, ahorroDatos: false };

export function useEstadoAparato(): EstadoAparato {
  const [bateria, setBateria] = useState<Bateria | null>(null);
  const [red, setRed] = useState<Red>(RED_INICIAL);
  const [medio, setMedio] = useState<string | null>(null);
  const [sesion, setSesion] = useState<boolean | null>(null);

  // Batería (solo Chromium).
  useEffect(() => {
    const nav = navigator as NavegadorConExtras;
    if (typeof nav.getBattery !== "function") return;
    let vivo = true;
    let bat: BateriaNavegador | null = null;
    const leer = () => {
      if (vivo && bat) setBateria({ nivel: bat.level, cargando: bat.charging });
    };
    nav.getBattery().then(
      (b) => {
        if (!vivo) return;
        bat = b;
        leer();
        b.addEventListener("levelchange", leer);
        b.addEventListener("chargingchange", leer);
      },
      () => {},
    );
    return () => {
      vivo = false;
      bat?.removeEventListener("levelchange", leer);
      bat?.removeEventListener("chargingchange", leer);
    };
  }, []);

  // Red: conectado/desconectado y, si el navegador lo dice, el tipo.
  useEffect(() => {
    const nav = navigator as NavegadorConExtras;
    const leer = () => setRed(redDesdeNavegador({ onLine: nav.onLine, connection: nav.connection ?? null }));
    leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", leer);
    nav.connection?.addEventListener?.("change", leer);
    return () => {
      window.removeEventListener("online", leer);
      window.removeEventListener("offline", leer);
      nav.connection?.removeEventListener?.("change", leer);
    };
  }, []);

  // Medio (cómo se abre el OS en este aparato) y sesión.
  useEffect(() => {
    let vivo = true;
    try {
      const etiqueta = describirMedio().etiqueta;
      setMedio(etiqueta || null);
    } catch {
      setMedio(null);
    }
    hasStarseedSession().then(
      (s) => vivo && setSesion(s),
      () => vivo && setSesion(false),
    );
    return () => {
      vivo = false;
    };
  }, []);

  return { bateria, red, medio, sesion };
}
