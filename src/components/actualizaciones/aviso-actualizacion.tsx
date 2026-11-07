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
import { leerInstalada, type Medio } from "@/lib/actualizaciones/version-por-medio";
import {
  decidirAviso,
  limpiarVersion,
  MEDIOS_CON_VENTANA,
  textoAlDia,
  type RespuestaUpdater,
} from "@/lib/actualizaciones/decision-aviso";
import { guardarUltimaComprobacion } from "@/lib/actualizaciones/ultima-comprobacion";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { decidirActualizacionAndroid } from "@/lib/nativa/actualizador-android";
import { buscarActualizacionNativa } from "@/lib/nativa/info-neurona";
import { anunciarVersionPublicada } from "@/lib/notifications/update-notifications";
import { textoEstadoActualizacion } from "@/lib/pwa/actualizacion-nativa-logica";
import { esVersionMasNueva, esVersionSemver } from "@/lib/version/os-release";
import type { VersionPublicada } from "@/lib/version/versiones-publicadas";

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
}

type Estado = "" | "trabajando" | "lista" | "al-dia" | "error";

export interface OpcionesComprobar {
  /** Lo pide la persona (o una neurona suya): se mira aunque esa versión ya se enseñara. */
  forzar?: boolean;
}

export function AvisoActualizacion() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [estado, setEstado] = useState<Estado>("");
  const [mensaje, setMensaje] = useState("");
  const enMarcha = useRef(false);

  const comprobar = useCallback(async (opciones: OpcionesComprobar = {}) => {
    if (enMarcha.current) return;
    enMarcha.current = true;
    try {
      const { medio, version } = await leerInstalada();
      if (!MEDIOS_CON_VENTANA.includes(medio)) return;
      const instalada = esVersionSemver(version) ? limpiarVersion(version) : null;
      if (!instalada) {
        guardarUltimaComprobacion({ resultado: "desconocida", instalada: null, publicada: null, texto: "Esta app no dice su versión: no se compara nada." });
        return;
      }
      const res = await fetch("/api/os/versiones", { cache: "no-store" });
      if (!res.ok) return;
      const datos = (await res.json()) as { versiones?: VersionPublicada[] };
      const ultima = Array.isArray(datos?.versiones) ? datos.versiones[0] : undefined;
      const publicada = ultima ? limpiarVersion(ultima.version) : null;
      const vistas = opciones.forzar ? {} : leerVistas();
      if (!ultima || !publicada || !debeAvisar(medio, instalada, publicada, vistas)) {
        const nueva = !!publicada && esVersionSemver(publicada) && esVersionMasNueva(publicada, instalada);
        guardarUltimaComprobacion({
          resultado: nueva ? "nueva" : "al-dia",
          instalada,
          publicada,
          texto: nueva ? `La ${publicada} ya se te enseñó; la tienes en la Librería.` : `Al día: tienes la ${instalada}.`,
        });
        return;
      }

      let updater: RespuestaUpdater | null = null;
      let notasUpdater: string | null = null;
      let fechaUpdater: string | null = null;
      let apk: string | null = null;
      if (medio === "escritorio") {
        const b = await buscarActualizacionNativa();
        if (b.estado === "ok") {
          updater = { estado: "ok", disponible: b.busqueda.disponible };
          notasUpdater = b.busqueda.notas;
          fechaUpdater = b.busqueda.fecha;
        } else updater = b.estado === "sin-comando" ? { estado: "sin-comando" } : { estado: "error", motivo: b.motivo };
      } else {
        apk = decidirActualizacionAndroid(instalada, {
          tag_name: ultima.version,
          assets: (ultima.archivos?.os?.android ?? []).map((a) => ({ name: a.nombre, browser_download_url: a.href })),
        }).href;
      }

      const d = decidirAviso({ medio, instalada, publicada, vistas, updater, apk, forzar: opciones.forzar });
      if (d.tipo === "nada") {
        guardarUltimaComprobacion({ resultado: "error", instalada, publicada, texto: d.motivo });
        return;
      }
      if (d.tipo === "preparando") {
        guardarUltimaComprobacion({ resultado: "preparando", instalada, publicada, texto: d.texto });
        return;
      }
      const deLaLista = d.version === publicada;
      const fecha = (deLaLista ? ultima.fecha : fechaUpdater?.slice(0, 10)) ?? "";
      const notas = (deLaLista ? ultima.notas : notasUpdater) ?? "";
      guardarUltimaComprobacion({ resultado: "nueva", instalada, publicada: d.version, texto: `StarSeed OS ${d.version} está lista para instalar.` });
      anunciarVersionPublicada({ version: d.version, fecha, notas });
      setEstado("");
      setMensaje("");
      setAviso({ medio, version: d.version, instalada, fecha, notas, apk: d.apk });
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
