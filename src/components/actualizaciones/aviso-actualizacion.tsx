"use client";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * (1105 · VER1105J) «Hay una versión nueva»: ventana emergente y aviso en Notificaciones.
 * Contrato: architecture/centro-versiones-1105.md §5 y §8 (VER1107B).
 *
 * Solo en las apps instaladas que tienen número de versión propio (escritorio y Android). La web y la
 * PWA ya tienen su banner del service worker (`components/pwa/update-banner.tsx`) y en iOS la PWA se
 * actualiza sola, así que allí no se abre nada.
 * Al arrancar y cada 6 h compara la versión instalada con la última publicada (`/api/os/versiones`).
 *
 * (VER1107B) Arreglo de «Hay una versión nueva» → «Ya estás en la última versión»:
 *   · la versión instalada se lee del objeto global de Tauri (`lib/nativa/info-neurona.ts`), nunca del
 *     build de la web; si no se sabe, no se abre nada;
 *   · en escritorio, antes de abrir, se pregunta al canal del updater de ESTA app sin instalar nada
 *     (`buscar_actualizacion`); si aún no ofrece la versión publicada, «se está preparando» y no se abre
 *     (queda dicho en Ajustes › Esta neurona). Una app anterior sin ese comando decide con la lista;
 *   · si al pulsar «Actualizar ahora» el updater dice que no hay nada: la versión queda vista y se dice
 *     «Ya tienes la X.Y.Z».
 * Abre la ventana UNA vez por versión (recordado en localStorage) y deja el aviso «update-app» en
 * Notificaciones. «Actualizar ahora»: escritorio → `actualizarEscritorio` (updater de Tauri, los datos
 * no se tocan) y luego «Reiniciar ahora»; Android → el .apk de la misma firma, que se instala encima.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, ExternalLink, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Medio } from "@/lib/actualizaciones/version-por-medio";
import { limpiarVersion, MEDIOS_CON_VENTANA, textoAlDia } from "@/lib/actualizaciones/decision-aviso";
import { comprobarActualizacion, type OpcionesComprobar } from "@/lib/actualizaciones/comprobar";
import { guardarUltimaComprobacion } from "@/lib/actualizaciones/ultima-comprobacion";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { EVENTO_BUSCAR_ACTUALIZACION, type DetalleBuscar } from "@/lib/neurons/pedir-actualizacion";
import { anunciarVersionPublicada } from "@/lib/notifications/update-notifications";
import { textoEstadoActualizacion } from "@/lib/pwa/actualizacion-nativa-logica";
import { esVersionMasNueva, esVersionSemver } from "@/lib/version/os-release";

export { limpiarVersion, MEDIOS_CON_VENTANA };

export const CLAVE_VISTAS = "starseed.aviso-actualizacion.vistas.v1";
export const INTERVALO_MS = 6 * 60 * 60 * 1000;

/**
 * PURA: ¿la lista publicada justifica mirar más (escritorio: preguntar al updater; Android: el .apk)?
 * (VER1107B) Con una versión que no sea semver a cualquiera de los dos lados, NUNCA.
 */
export function debeAvisar(
  medio: Medio,
  instalada: string | null | undefined,
  publicada: string | null | undefined,
  vistas: Record<string, unknown>,
): boolean {
  if (!MEDIOS_CON_VENTANA.includes(medio)) return false;
  const actual = limpiarVersion(instalada);
  const nueva = limpiarVersion(publicada);
  if (!esVersionSemver(actual) || !esVersionSemver(nueva) || vistas[nueva]) return false;
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
  instalada: string;
  fecha: string;
  notas: string;
  apk: string | null;
  /** Otra neurona de la cuenta lo pidió («Pedir actualización»). */
  pedidaPor: string | null;
}

type Estado = "" | "trabajando" | "lista" | "al-dia" | "error";

export function AvisoActualizacion() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [estado, setEstado] = useState<Estado>("");
  const [mensaje, setMensaje] = useState("");
  const enMarcha = useRef(false);

  const comprobar = useCallback(async (opciones: OpcionesComprobar & { pedidaPor?: string } = {}) => {
    if (enMarcha.current) return;
    enMarcha.current = true;
    try {
      const r = await comprobarActualizacion({ forzar: opciones.forzar, vistas: leerVistas() });
      if (!r || r.decision.tipo !== "ventana" || !r.instalada) return;
      const d = r.decision;
      anunciarVersionPublicada({ version: d.version, fecha: r.fecha, notas: r.notas });
      setEstado("");
      setMensaje("");
      setAviso({ medio: r.medio, version: d.version, instalada: r.instalada, fecha: r.fecha, notas: r.notas, apk: d.apk, pedidaPor: opciones.pedidaPor ?? null });
    } catch {
      /* sin red o sin datos: se vuelve a mirar en 6 h */
    } finally {
      enMarcha.current = false;
    }
  }, []);

  useEffect(() => {
    void comprobar();
    const id = setInterval(() => void comprobar(), INTERVALO_MS);
    // (VER1107B) «Buscar actualizaciones» en esta neurona, o un pedido FIRMADO de otra neurona de la
    // cuenta («Pedir actualización»): se mira ya, aunque esa versión ya se enseñara. Nunca se instala sola.
    const alPedir = (e: Event) => {
      const detalle = (e as CustomEvent<DetalleBuscar | undefined>).detail;
      void comprobar({ forzar: true, pedidaPor: detalle?.pedidaPor });
    };
    window.addEventListener(EVENTO_BUSCAR_ACTUALIZACION, alPedir);
    let parar: (() => void) | null = null;
    let vivo = true;
    void import("@/lib/neurons/pedir-actualizacion")
      .then((m) => {
        if (vivo) parar = m.iniciarEscuchaPedidos();
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
      clearInterval(id);
      window.removeEventListener(EVENTO_BUSCAR_ACTUALIZACION, alPedir);
      parar?.();
    };
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
    if (estado === "al-dia") {
      cerrar();
      return;
    }
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
      // El updater de esta app no tiene nada más nuevo: esa versión queda vista y se dice lo que hay.
      marcarVista(aviso.version);
      const texto = textoAlDia(aviso.instalada, aviso.version);
      guardarUltimaComprobacion({ resultado: "al-dia", instalada: aviso.instalada, publicada: aviso.version, texto });
      setEstado("al-dia");
      setMensaje(texto);
    }
  };

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hay una versión nueva</DialogTitle>
          <DialogDescription>
            StarSeed OS {aviso.version} está disponible{aviso.fecha ? ` desde el ${aviso.fecha}` : ""}. Tienes la {aviso.instalada}.
            {aviso.pedidaPor ? ` Te lo pide «${aviso.pedidaPor}»: tú decides si se instala.` : ""}
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
            ) : estado === "al-dia" ? (
              <Check className="mr-1 h-4 w-4" aria-hidden />
            ) : (
              <Download className="mr-1 h-4 w-4" aria-hidden />
            )}
            {estado === "lista" ? "Reiniciar ahora" : estado === "al-dia" ? "Entendido" : "Actualizar ahora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AvisoActualizacion;
