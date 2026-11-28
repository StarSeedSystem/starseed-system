"use client";

/**
 * VentanaNeuronaGlobal — NEU1126E (parte 2 de 2) · 26-11 · hecha por la dirección a petición de Maggasukha.
 *
 * POR QUÉ NO SALÍA LA VENTANA. La ventana de neurona existía (NEU1125B «Este aparato es nuevo» y la de
 * NEU1126E «comparte neurona», ambas en `AparatoNuevoDialogo`), pero solo se pintaba DENTRO de
 * Ajustes › Neuronas: ningún sitio de la app la montaba. Además la adopción por huella
 * (`usarConfiguracionDeNeurona`) adopta en silencio cuando no había huella guardada (versiones
 * anteriores a la .65). Así la tableta Maggaboard y el teléfono Maggadroid acabaron compartiendo la
 * neurona e0b9faf2 sin que nadie les preguntara.
 *
 * QUÉ HACE. Se monta una vez en toda la app (app-globals) y, al arrancar, comprueba:
 *  1. «comparte neurona»: la fila de la neurona de este aparato tiene dos o más aparatos vivos con
 *     huella (o equipo) distinta → ventana con «Crear una neurona propia» / «Seguir en la misma
 *     neurona (fusionadas)» / «Más tarde», una vez por versión y neurona;
 *  2. «aparato nuevo»: la huella nativa no coincidió (marca `CLAVE_HUELLA_REVISION`) → ventana
 *     «Este aparato es nuevo» con «Crear una neurona nueva» / «Unirlo a una existente».
 * Nunca elige por la persona ni borra nada: solo muestra la ventana existente encima de la página.
 * Se puede cerrar (vuelve en el siguiente arranque; el aviso sigue en Ajustes › Neuronas).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { AparatoNuevoDialogo } from "@/components/settings/neurons/aparato-nuevo-dialogo";
import { CLAVE_HUELLA_REVISION } from "@/lib/neurons/adopcion-neurona";
import { NEURON_EVENT, listNeurons, resolverAliasEsteMedio, thisDeviceId } from "@/lib/neurons/neurons";
import { neuronDeviceSyncId } from "@/lib/network/identidad-dispositivo";
import {
  claveRevisionPospuesto,
  claveRevisionVista,
  revisarIdentidadCompartida,
  type RevisionIdentidad,
} from "@/lib/neurons/revision-identidad";
import { OS_VERSION } from "@/lib/version/os-release";

export type MotivoVentanaNeurona = "compartida" | "nuevo" | null;

/** Cerrada con la X en esta sesión de la app (vuelve en el siguiente arranque). */
export const CLAVE_VENTANA_NEURONA_CERRADA = "starseed.neuron.ventana-global.cerrada";

/** Espera tras arrancar para no competir con la carga de la página (ms). */
export const ESPERA_ARRANQUE_MS = 4_000;

/** PURA: qué ventana toca mostrar. La de «comparte neurona» tiene preferencia. */
export function decidirVentanaNeurona(e: {
  revision: RevisionIdentidad | null;
  revisionYaVista: boolean;
  aparatoNuevo: boolean;
  cerradaEnSesion: boolean;
}): MotivoVentanaNeurona {
  if (e.cerradaEnSesion) return null;
  if (e.revision && !e.revisionYaVista) return "compartida";
  if (e.aparatoNuevo) return "nuevo";
  return null;
}

function leerLocal(clave: string): string | null {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem(clave) : null;
  } catch {
    return null;
  }
}

function leerSesion(clave: string): string | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage.getItem(clave) : null;
  } catch {
    return null;
  }
}

function escribirSesion(clave: string): void {
  try {
    if (typeof window !== "undefined") window.sessionStorage.setItem(clave, String(Date.now()));
  } catch {
    /* sin almacenamiento */
  }
}

function revisionYaVista(r: RevisionIdentidad | null): boolean {
  if (!r) return false;
  return Boolean(leerLocal(claveRevisionVista(OS_VERSION, r.idNeurona)) || leerLocal(claveRevisionPospuesto(OS_VERSION, r.idNeurona)));
}

export default function VentanaNeuronaGlobal() {
  const [motivo, setMotivo] = useState<MotivoVentanaNeurona>(null);
  const [revision, setRevision] = useState<RevisionIdentidad | null>(null);
  const motivoRef = useRef<MotivoVentanaNeurona>(null);
  motivoRef.current = motivo;

  const comprobar = useCallback(async () => {
    let rev: RevisionIdentidad | null = null;
    try {
      const filas = await listNeurons({ fresco: true });
      const yo = resolverAliasEsteMedio() || thisDeviceId();
      const fila = filas.find((f) => f.id === yo);
      const syncId = neuronDeviceSyncId();
      rev = fila
        ? revisarIdentidadCompartida({
            idNeurona: fila.id,
            nombreNeurona: fila.name,
            capabilities: fila.capabilities,
            yoId: syncId || thisDeviceId(),
            ahora: Date.now(),
          })
        : null;
    } catch {
      rev = null; // sin red: queda la comprobación del aparato nuevo, que es local
    }
    setRevision(rev);
    setMotivo(
      decidirVentanaNeurona({
        revision: rev,
        revisionYaVista: revisionYaVista(rev),
        aparatoNuevo: Boolean(leerLocal(CLAVE_HUELLA_REVISION)),
        cerradaEnSesion: Boolean(leerSesion(CLAVE_VENTANA_NEURONA_CERRADA)),
      }),
    );
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void comprobar(), ESPERA_ARRANQUE_MS);
    // Una acción dentro de la ventana (crear, unir, seguir) cambia la neurona: se vuelve a mirar.
    const alCambiar = () => {
      if (motivoRef.current === "nuevo") escribirSesion(CLAVE_VENTANA_NEURONA_CERRADA);
      void comprobar();
    };
    window.addEventListener(NEURON_EVENT, alCambiar);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(NEURON_EVENT, alCambiar);
    };
  }, [comprobar]);

  // «Seguir en la misma» y «Más tarde» solo guardan su marca: mientras está abierta se vigila.
  useEffect(() => {
    if (motivo !== "compartida" || !revision) return;
    const id = window.setInterval(() => {
      if (revisionYaVista(revision)) {
        window.setTimeout(() => setMotivo(null), 1_500); // deja leer el mensaje de confirmación
        window.clearInterval(id);
      }
    }, 1_000);
    return () => window.clearInterval(id);
  }, [motivo, revision]);

  if (!motivo) return null;

  const cerrar = () => {
    escribirSesion(CLAVE_VENTANA_NEURONA_CERRADA);
    setMotivo(null);
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={motivo === "compartida" ? "Este aparato comparte neurona" : "Este aparato es nuevo"}
      data-testid="ventana-neurona-global"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={cerrar}
          className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground cursor-pointer"
          aria-label="Cerrar (vuelve en el próximo arranque; el aviso sigue en Ajustes › Neuronas)"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <AparatoNuevoDialogo revision={motivo === "compartida" && revision ? revision : undefined} version={OS_VERSION} />
      </div>
    </div>
  );
}
