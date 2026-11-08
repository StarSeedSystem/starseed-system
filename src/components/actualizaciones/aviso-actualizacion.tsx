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
 *
 * (ACT1108A · §9) Canal de pruebas: una app con versión «-prueba.» mira también la prerelease
 * `canal-pruebas` y la ventana lo dice («Canal de pruebas · 0.5.1-prueba.23»). En Android, «Actualizar
 * ahora» descarga el APK DENTRO de la app (SHA-256, paquete y firma comprobados) y abre el instalador
 * del sistema, que SIEMPRE pide confirmar; sin el actualizador interno (APK anterior) se ofrece el .apk.
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
import { guardarUltimaComprobacion, leerUltimaComprobacion } from "@/lib/actualizaciones/ultima-comprobacion";
import { describirError } from "@/lib/actualizaciones/errores";
import { EVENTO_ACTUALIZAR_VERSION, leerEstadoVivo, publicarEstadoVivo } from "@/lib/actualizaciones/estado-vivo";
import { buscarAlVolverLaRed, crearPlanificador, EVENTO_AUTOMATICA, leerAutomatica } from "@/lib/actualizaciones/planificador-auto";
import { actualizarEscritorio, reiniciarParaActualizar } from "@/lib/nativa/actualizador";
import { actualizarApkEnApp, instalarApkDescargado, leerEstadoApk, porcentajeApk, textoEstadoApk } from "@/lib/nativa/actualizador-apk";
import { canalDe, etiquetaCanal, type Canal } from "@/lib/actualizaciones/canal-pruebas";
import { EVENTO_BUSCAR_ACTUALIZACION, type DetalleBuscar } from "@/lib/neurons/pedir-actualizacion";
import { anunciarVersionPublicada } from "@/lib/notifications/update-notifications";
import { porcentajeDescarga, textoEstadoActualizacion } from "@/lib/pwa/actualizacion-nativa-logica";
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

/**
 * (ACT1108B) Tras una búsqueda: el estado en vivo pasa de «Buscando…» a lo que quedó dicho en la última
 * comprobación (al día / versión nueva / error con su motivo). Así nunca queda un «Buscando…» colgado ni un fallo mudo.
 */
export function resolverVivo(): void {
  if (leerEstadoVivo().fase !== "buscando") return;
  const u = leerUltimaComprobacion();
  if (!u) {
    publicarEstadoVivo({ fase: "inactivo", mensaje: "" });
  } else if (u.resultado === "error") {
    publicarEstadoVivo({ fase: "error", mensaje: u.texto, error: describirError(u.texto) });
  } else if (u.resultado === "nueva") {
    publicarEstadoVivo({ fase: "disponible", version: u.publicada, mensaje: u.texto });
  } else {
    publicarEstadoVivo({ fase: "al-dia", mensaje: u.texto });
  }
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
  /** (ACT1108A) Canal de la versión ofrecida. */
  canal: Canal;
}

/**
 * «instalador»: Android ya tiene el APK verificado (el instalador está abierto o se puede reabrir).
 * «sin-apk-interno»: la descarga dentro de la app falló; queda descargar el .apk a mano.
 */
type Estado = "" | "trabajando" | "lista" | "al-dia" | "error" | "instalador" | "sin-apk-interno";

/** PURA (ACT1108A). La línea del canal en la ventana: solo para el canal de pruebas. */
export function lineaCanal(canal: Canal, version: string): string | null {
  return canal === "pruebas" ? (etiquetaCanal(version) ?? `Canal de pruebas · ${version}`) : null;
}

export function AvisoActualizacion({ inicioMs }: { /** Solo pruebas: la espera de la primera búsqueda automática (por defecto ~20 s). */ inicioMs?: number } = {}) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [estado, setEstado] = useState<Estado>("");
  const [mensaje, setMensaje] = useState("");
  /** (ACT1108A) ¿La app de Android trae el actualizador interno? (null = aún no se sabe). */
  const [apkInterno, setApkInterno] = useState<boolean | null>(null);
  const enMarcha = useRef(false);
  /** (ACT1108B) La versión nueva que se enseñó y se dejó para «Más tarde»: se vuelve a abrir desde Ajustes/Librería. */
  const pendiente = useRef<Aviso | null>(null);

  useEffect(() => {
    if (aviso?.medio !== "android") return;
    let vivo = true;
    void leerEstadoApk()
      .then((e) => vivo && setApkInterno(e !== null))
      .catch(() => vivo && setApkInterno(false));
    return () => {
      vivo = false;
    };
  }, [aviso?.medio]);

  const comprobar = useCallback(async (opciones: OpcionesComprobar & { pedidaPor?: string } = {}) => {
    if (enMarcha.current) return;
    enMarcha.current = true;
    const mostrar = (a: Aviso) => {
      pendiente.current = a;
      publicarEstadoVivo({ fase: "disponible", version: a.version, mensaje: `StarSeed OS ${a.version} está lista para instalar.` });
      setAviso(a);
    };
    // (ACT1108B) Ajustes, Esta neurona y la Librería ven «Buscando…» y, al acabar, el resultado (nunca en silencio).
    const previa = leerEstadoVivo();
    if (previa.fase !== "disponible" && previa.fase !== "lista" && previa.fase !== "instalador") {
      publicarEstadoVivo({ fase: "buscando", mensaje: "Buscando la versión nueva…" });
    }
    try {
      const r = await comprobarActualizacion({
        forzar: opciones.forzar,
        vistas: leerVistas(),
        aviso: (texto) => publicarEstadoVivo({ fase: "buscando", mensaje: texto }),
      });
      if (!r || r.decision.tipo !== "ventana" || !r.instalada) {
        // (ACT1108A) Android: la app ya bajó y verificó sola (cada 6 h) un APK más nuevo → se ofrece,
        // aunque la lista publicada no se haya podido leer.
        if (r?.medio !== "android" || !r.instalada) return;
        const instalada = r.instalada;
        const e = await leerEstadoApk();
        if (!e || e.fase !== "lista" || !e.version || !esVersionSemver(e.version) || !esVersionMasNueva(e.version, instalada)) return;
        if (!opciones.forzar && leerVistas()[e.version]) return;
        setEstado("");
        setMensaje("");
        mostrar({
          medio: "android",
          version: e.version,
          instalada,
          fecha: "",
          notas: e.notas ?? "",
          apk: null,
          pedidaPor: opciones.pedidaPor ?? null,
          canal: e.canal === "pruebas" ? "pruebas" : canalDe(e.version),
        });
        return;
      }
      const d = r.decision;
      anunciarVersionPublicada({ version: d.version, fecha: r.fecha, notas: r.notas });
      setEstado("");
      setMensaje("");
      mostrar({
        medio: r.medio,
        version: d.version,
        instalada: r.instalada,
        fecha: r.fecha,
        notas: r.notas,
        apk: d.apk,
        pedidaPor: opciones.pedidaPor ?? null,
        canal: r.canal ?? canalDe(d.version),
      });
    } catch (e) {
      // (ACT1108B) Antes: silencio. Ahora el error queda dicho en Ajustes › Versión y actualizaciones (con «Buscar ahora»).
      const d = describirError(e);
      guardarUltimaComprobacion({ resultado: "error", instalada: null, publicada: null, texto: d.texto });
    } finally {
      enMarcha.current = false;
      resolverVivo();
    }
  }, []);

  useEffect(() => {
    // (ACT1108B) Búsqueda automática: ~20 s tras arrancar y cada 6 h, si el interruptor de Ajustes está activo
    // (por defecto sí). Al volver la red, si la última falló por no haberla, se busca enseguida.
    const plan = crearPlanificador({
      buscar: () => comprobar(),
      activa: leerAutomatica,
      ultimaEn: () => leerUltimaComprobacion()?.en ?? null,
      inicioMs,
    });
    const alCambiarInterruptor = () => {
      plan.reprogramar(false);
      if (leerAutomatica()) void comprobar();
    };
    const alVolverLaRed = () => {
      if (leerAutomatica() && buscarAlVolverLaRed(leerUltimaComprobacion())) void comprobar({ forzar: true });
    };
    // Los otros sitios (Ajustes, Librería, Esta neurona) piden abrir/continuar la actualización por este evento.
    const alActualizar = () => {
      if (pendiente.current && leerEstadoVivo().fase !== "buscando") {
        setEstado("");
        setMensaje("");
        setAviso(pendiente.current);
      } else void comprobar({ forzar: true });
    };
    window.addEventListener(EVENTO_AUTOMATICA, alCambiarInterruptor);
    window.addEventListener("online", alVolverLaRed);
    window.addEventListener(EVENTO_ACTUALIZAR_VERSION, alActualizar);
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
      plan.parar();
      window.removeEventListener(EVENTO_AUTOMATICA, alCambiarInterruptor);
      window.removeEventListener("online", alVolverLaRed);
      window.removeEventListener(EVENTO_ACTUALIZAR_VERSION, alActualizar);
      window.removeEventListener(EVENTO_BUSCAR_ACTUALIZACION, alPedir);
      parar?.();
    };
  }, [comprobar, inicioMs]);

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
      const abrirApk = () => {
        if (aviso.apk) {
          window.open(aviso.apk, "_blank", "noopener");
          setEstado("");
          setMensaje("Descargando el instalador de la misma firma: ábrelo y se instala encima, con tus datos donde están.");
        } else {
          setEstado("error");
          setMensaje("Esta versión aún no tiene instalador para Android. Mira la Librería más tarde.");
        }
      };
      if (estado === "sin-apk-interno") {
        abrirApk();
        return;
      }
      if (estado === "instalador") {
        // El APK ya está verificado: se vuelve a abrir el instalador de Android.
        const r = await instalarApkDescargado();
        setMensaje(r.ok ? "Android te pide confirmar: pulsa «Instalar». Tus datos se quedan donde están." : r.motivo);
        return;
      }
      // (ACT1108A) Dentro de la app: descarga, SHA-256, paquete y firma, y el instalador del sistema.
      setEstado("trabajando");
      setMensaje("Buscando la versión nueva…");
      publicarEstadoVivo({ fase: "descargando", mensaje: "Buscando la versión nueva…", version: aviso.version });
      const r = await actualizarApkEnApp({
        onEstado: (e) => {
          const t = textoEstadoApk(e);
          setMensaje(t);
          publicarEstadoVivo({ fase: "descargando", mensaje: t, progreso: porcentajeApk(e), version: aviso.version });
        },
      });
      if (r.estado === "sin-actualizador") {
        abrirApk(); // APK anterior a ACT1108A: el .apk de siempre
        return;
      }
      if (r.estado === "error") {
        const d = describirError(r.motivo);
        const t = `${d.texto}${aviso.apk ? " Puedes descargar el .apk a mano." : ""}`;
        setEstado(aviso.apk ? "sin-apk-interno" : "error");
        setMensaje(t);
        publicarEstadoVivo({ fase: "error", mensaje: t, error: d });
        return;
      }
      const f = r.final;
      if (f.fase === "al-dia" && aviso.apk && aviso.canal !== "pruebas") {
        abrirApk(); // el canal oficial aún no publica el manifiesto del APK: el .apk del Release
        return;
      }
      const textoFinal = f.fase === "error" ? describirError(f.mensaje ?? "").texto : textoEstadoApk(f);
      setMensaje(textoFinal);
      if (f.fase === "error") {
        setEstado(aviso.apk ? "sin-apk-interno" : "error");
        publicarEstadoVivo({ fase: "error", mensaje: textoFinal, error: describirError(f.mensaje ?? "") });
      } else if (f.fase === "al-dia" || f.fase === "instalada") {
        marcarVista(aviso.version);
        pendiente.current = null;
        setEstado("al-dia");
        publicarEstadoVivo({ fase: "al-dia", mensaje: textoFinal });
      } else {
        setEstado("instalador");
        publicarEstadoVivo({ fase: "instalador", mensaje: textoFinal, version: aviso.version });
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
    publicarEstadoVivo({ fase: "descargando", mensaje: "Descargando e instalando la versión nueva…", version: aviso.version });
    const r = await actualizarEscritorio((e) => {
      const texto = e.mensaje && (e.fase === "buscando" || e.fase === "descargando") && e.descargado == null ? e.mensaje : textoEstadoActualizacion(e);
      if (texto) setMensaje(texto);
      publicarEstadoVivo({ fase: "descargando", mensaje: texto || "Descargando…", progreso: porcentajeDescarga(e), version: aviso.version });
    });
    if (!r.ok) {
      // (ACT1108B) «Could not fetch a valid release JSON from the remote» → «GitHub no respondió (504)…», con «Reintentar».
      const d = describirError(r.motivo);
      setEstado("error");
      setMensaje(d.texto);
      publicarEstadoVivo({ fase: "error", mensaje: d.texto, error: d });
      return;
    }
    if (r.valor.listaParaReiniciar) {
      setEstado("lista");
      setMensaje("Lista. Reinicia para usarla: tus datos y ajustes se quedan donde están.");
      publicarEstadoVivo({ fase: "lista", mensaje: "Lista. Reinicia para usarla: tus datos y ajustes se quedan donde están.", version: aviso.version });
    } else {
      // El updater de esta app no tiene nada más nuevo: esa versión queda vista y se dice lo que hay.
      marcarVista(aviso.version);
      const texto = textoAlDia(aviso.instalada, aviso.version);
      guardarUltimaComprobacion({ resultado: "al-dia", instalada: aviso.instalada, publicada: aviso.version, texto });
      setEstado("al-dia");
      setMensaje(texto);
      pendiente.current = null;
      publicarEstadoVivo({ fase: "al-dia", mensaje: texto });
    }
  };

  const canal = lineaCanal(aviso.canal, aviso.version);
  const textoBoton =
    estado === "lista"
      ? "Reiniciar ahora"
      : estado === "al-dia"
        ? "Entendido"
        : estado === "instalador"
          ? "Instalar"
          : estado === "sin-apk-interno"
            ? "Descargar el .apk"
            : estado === "error"
              ? "Reintentar"
              : "Actualizar ahora";

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Hay una versión nueva</DialogTitle>
          <DialogDescription>
            StarSeed OS {aviso.version} está disponible{aviso.fecha ? ` desde el ${aviso.fecha}` : ""}. Tienes la {aviso.instalada}.
            {aviso.pedidaPor ? ` Te lo pide «${aviso.pedidaPor}»: tú decides si se instala.` : ""}
          </DialogDescription>
          {canal && (
            <p className="text-xs font-medium text-amber-200" data-canal="pruebas">
              {canal}
            </p>
          )}
        </DialogHeader>
        {aviso.notas && (
          <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {aviso.notas.slice(0, 1200)}
          </div>
        )}
        {mensaje && (
          <p role="status" aria-live="polite" className={estado === "error" || estado === "sin-apk-interno" ? "text-sm text-red-400" : "text-sm"}>
            {mensaje}
          </p>
        )}
        {aviso.medio === "android" && (
          <p className="text-xs text-muted-foreground">
            {apkInterno
              ? "Se descarga dentro de la app y se comprueba antes de instalar. Android siempre te pide confirmar «Instalar» (y, la primera vez, permitir que StarSeed OS instale apps). Es la misma firma: tus datos se quedan donde están."
              : "Se descarga el .apk de la misma firma: ábrelo y Android te pide confirmar «Instalar». Tus datos se quedan donde están."}
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
            {textoBoton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AvisoActualizacion;
