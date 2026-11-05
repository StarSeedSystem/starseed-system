"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * (1105 · VER1105J) «Hay una versión nueva»: ventana emergente y aviso en Notificaciones.
 * Contrato: architecture/centro-versiones-1105.md §5.
 *
 * Solo en las apps instaladas que tienen número de versión propio (escritorio y Android). La web y la
 * PWA ya tienen su banner del service worker (`components/pwa/update-banner.tsx`) y en iOS la PWA se
 * actualiza sola, así que allí no se abre nada.
 * Al arrancar y cada 6 h compara la versión instalada con la última publicada (`/api/os/versiones`).
 * Abre la ventana UNA vez por versión (recordado en localStorage) y deja el aviso «update-app» en
 * Notificaciones. «Actualizar ahora»: escritorio → `actualizarEscritorio` (updater de Tauri, los datos
 * no se tocan) y luego «Reiniciar ahora»; Android → el .apk de la misma firma, que se instala encima.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { leerInstalada, type Medio } from "@/lib/actualizaciones/version-por-medio";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { decidirActualizacionAndroid } from "@/lib/nativa/actualizador-android";
import { anunciarVersionPublicada } from "@/lib/notifications/update-notifications";
import { textoEstadoActualizacion } from "@/lib/pwa/actualizacion-nativa-logica";
import { esVersionMasNueva } from "@/lib/version/os-release";
import type { VersionPublicada } from "@/lib/version/versiones-publicadas";

export const CLAVE_VISTAS = "starseed.aviso-actualizacion.vistas.v1";
export const INTERVALO_MS = 6 * 60 * 60 * 1000;
export const MEDIOS_CON_VENTANA: readonly Medio[] = ["escritorio", "android"];

/** PURA: la versión sin «v» ni espacios. */
export function limpiarVersion(v: string | null | undefined): string {
  return String(v ?? "").trim().replace(/^v/i, "");
}

/** PURA: ¿se abre la ventana en este medio para esta versión publicada? */
export function debeAvisar(
  medio: Medio,
  instalada: string | null | undefined,
  publicada: string | null | undefined,
  vistas: Record<string, unknown>,
): boolean {
  if (!MEDIOS_CON_VENTANA.includes(medio)) return false;
  const actual = limpiarVersion(instalada);
  const nueva = limpiarVersion(publicada);
  if (!actual || !nueva || vistas[nueva]) return false;
  return esVersionMasNueva(nueva, actual);
}

function leerVistas(): Record<string, unknown> {
  try {
    const crudo = window.localStorage.getItem(CLAVE_VISTAS);
    const datos: unknown = crudo ? JSON.parse(crudo) : null;
    return datos && typeof datos === "object" && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function marcarVista(version: string): void {
  try {
    window.localStorage.setItem(CLAVE_VISTAS, JSON.stringify({ ...leerVistas(), [version]: Date.now() }));
  } catch {
    /* modo privado o sin cuota: la ventana puede volver a salir, nada más */
  }
}

interface Aviso {
  medio: Medio;
  version: string;
  fecha: string;
  notas: string;
  apk: string | null;
}

type Estado = "" | "trabajando" | "lista" | "error";

export function AvisoActualizacion() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [estado, setEstado] = useState<Estado>("");
  const [mensaje, setMensaje] = useState("");
  const enMarcha = useRef(false);

  const comprobar = useCallback(async () => {
    if (enMarcha.current) return;
    enMarcha.current = true;
    try {
      const { medio, version: instalada } = await leerInstalada();
      if (!MEDIOS_CON_VENTANA.includes(medio)) return;
      const res = await fetch("/api/os/versiones", { cache: "no-store" });
      if (!res.ok) return;
      const datos = (await res.json()) as { versiones?: VersionPublicada[] };
      const ultima = Array.isArray(datos?.versiones) ? datos.versiones[0] : undefined;
      if (!ultima || !debeAvisar(medio, instalada, ultima.version, leerVistas())) return;
      const version = limpiarVersion(ultima.version);
      const apk =
        medio === "android"
          ? decidirActualizacionAndroid(instalada, {
              tag_name: ultima.version,
              assets: (ultima.archivos?.os?.android ?? []).map((a) => ({ name: a.nombre, browser_download_url: a.href })),
            }).href
          : null;
      anunciarVersionPublicada({ version, fecha: ultima.fecha, notas: ultima.notas });
      setEstado("");
      setMensaje("");
      setAviso({ medio, version, fecha: ultima.fecha ?? "", notas: ultima.notas ?? "", apk });
    } catch {
      /* sin red o sin datos: se vuelve a mirar en 6 h */
    } finally {
      enMarcha.current = false;
    }
  }, []);

  useEffect(() => {
    void comprobar();
    const id = setInterval(() => void comprobar(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [comprobar]);

  if (!aviso) return null;

  const cerrar = () => {
    marcarVista(aviso.version);
    setAviso(null);
  };

  const verEnLibreria = () => {
    marcarVista(aviso.version);
    setAviso(null);
    window.location.assign("/library");
  };

  const actualizar = async () => {
    if (aviso.medio === "android") {
      if (aviso.apk) {
        window.open(aviso.apk, "_blank", "noopener");
        setMensaje("Descargando el instalador de la misma firma: ábrelo y se instala encima, con tus datos donde están.");
      } else {
        setEstado("error");
        setMensaje("Esta versión aún no tiene instalador para Android. Mira la Librería más tarde.");
      }
      return;
    }
    if (estado === "lista") {
      const r = await reiniciarParaActualizar();
      if (!r.ok) {
        setEstado("error");
        setMensaje(r.motivo);
      }
      return;
    }
    setEstado("trabajando");
    setMensaje("Descargando e instalando la versión nueva…");
    const r = await actualizarEscritorio((e) => {
      const texto = textoEstadoActualizacion(e);
      if (texto) setMensaje(texto);
    });
    if (!r.ok) {
      setEstado("error");
      setMensaje(r.motivo);
      return;
    }
    if (r.valor.listaParaReiniciar) {
      setEstado("lista");
      setMensaje("Lista. Reinicia para usarla: tus datos y ajustes se quedan donde están.");
    } else {
      setEstado("");
      setMensaje(r.valor.mensaje || "Ya tienes la última versión.");
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hay una versión nueva</DialogTitle>
          <DialogDescription>
            StarSeed OS {aviso.version} está disponible{aviso.fecha ? ` desde el ${aviso.fecha}` : ""}.
          </DialogDescription>
        </DialogHeader>
        {aviso.notas && (
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {aviso.notas.slice(0, 1200)}
          </div>
        )}
        {mensaje && (
          <p role="status" aria-live="polite" className={estado === "error" ? "text-sm text-red-400" : "text-sm"}>
            {mensaje}
          </p>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={cerrar}>
            <X className="mr-1 h-4 w-4" aria-hidden />
            Más tarde
          </Button>
          <Button variant="secondary" size="sm" onClick={verEnLibreria}>
            <ExternalLink className="mr-1 h-4 w-4" aria-hidden />
            Ver en la Librería
          </Button>
          <Button size="sm" onClick={() => void actualizar()} disabled={estado === "trabajando"}>
            {estado === "lista" ? (
              <RotateCw className="mr-1 h-4 w-4" aria-hidden />
            ) : (
              <Download className="mr-1 h-4 w-4" aria-hidden />
            )}
            {estado === "lista" ? "Reiniciar ahora" : "Actualizar ahora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AvisoActualizacion;
