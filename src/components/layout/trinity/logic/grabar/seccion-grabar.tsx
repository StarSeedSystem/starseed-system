"use client";

/**
 * «Grabar» · grabadora de pantalla del Centro de Control (inspirada en Cap, capsoftware/cap).
 * ─────────────────────────────────────────────────────────────────────────────
 *   · Pantalla, ventana o pestaña (getDisplayMedia), con cámara superpuesta, micrófono y sonido del
 *     sistema si el navegador lo da; o solo la cámara. MediaRecorder con el mejor formato soportado.
 *   · Cuenta atrás, pausa, parar, duración y tamaño en vivo, vista previa, descargar y guardar en la
 *     Biblioteca (hasta 50 MB), y captura de pantalla a PNG.
 *   · Honesto: si el navegador no puede (iPhone, Chrome de Android…), lo dice con su motivo y los pasos;
 *     los permisos se piden solo al pulsar «Grabar» o «Captura».
 *   · La grabación vive en `controladorGlobal()`: sigue si cambias de sección o cierras el panel.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CircleDot, Film, Video } from "lucide-react";
import type { Controlador } from "@/lib/grabacion/controlador";
import { OPCIONES_POR_DEFECTO, type OpcionesGrabacion } from "@/lib/grabacion/tipos";
import type { DepsGuardado } from "@/lib/grabacion/guardar";
import { BotonLogic } from "../boton-logic";
import { SeccionLogic } from "../seccion-logic";
import { useIrCerrando } from "../use-ir-cerrando";
import { useGrabadora } from "../use-grabadora";
import { AjustesGrabacion } from "./ajustes-grabacion";
import { AvisoSinPantalla } from "./aviso-sin-pantalla";
import { EnlaceCap } from "./enlace-cap";
import { PanelEnCurso } from "./panel-en-curso";
import { ResultadoGrabacionVista } from "./resultado-grabacion";

const CLAVE_PREFERENCIAS = "starseed.logic.grabar.v1";

/** Solo preferencias de comodidad de ESTE navegador (nunca viajan a la cuenta). */
function leerPreferencias(): OpcionesGrabacion {
  try {
    const crudo = window.localStorage.getItem(CLAVE_PREFERENCIAS);
    if (!crudo) return OPCIONES_POR_DEFECTO;
    const p = JSON.parse(crudo) as Partial<OpcionesGrabacion>;
    return {
      ...OPCIONES_POR_DEFECTO,
      ...(["pantalla", "camara"].includes(p.fuente as string) ? { fuente: p.fuente } : {}),
      ...(typeof p.microfono === "boolean" ? { microfono: p.microfono } : {}),
      ...(typeof p.sonidoSistema === "boolean" ? { sonidoSistema: p.sonidoSistema } : {}),
      ...(typeof p.camaraSuperpuesta === "boolean" ? { camaraSuperpuesta: p.camaraSuperpuesta } : {}),
      ...([0, 3, 5].includes(p.cuentaAtras as number) ? { cuentaAtras: p.cuentaAtras } : {}),
      ...(["ligera", "estandar", "alta"].includes(p.calidad as string) ? { calidad: p.calidad } : {}),
      ...(["auto", "mp4"].includes(p.formato as string) ? { formato: p.formato } : {}),
      ...(["abajo-derecha", "abajo-izquierda", "arriba-derecha", "arriba-izquierda"].includes(p.posicionCamara as string) ? { posicionCamara: p.posicionCamara } : {}),
      ...(["pequena", "mediana", "grande"].includes(p.tamanoCamara as string) ? { tamanoCamara: p.tamanoCamara } : {}),
    } as OpcionesGrabacion;
  } catch {
    return OPCIONES_POR_DEFECTO;
  }
}

interface Props {
  /** Solo pruebas: un controlador propio en vez del global. */
  controlador?: Controlador;
  /** Solo pruebas: cómo se guarda en la Biblioteca. */
  depsGuardado?: DepsGuardado;
}

export function SeccionGrabar({ controlador: inyectado, depsGuardado }: Props) {
  const { controlador, estado } = useGrabadora(inyectado);
  const ir = useIrCerrando();
  const soporte = useMemo(() => controlador.soporte(), [controlador]);
  const [opciones, setOpciones] = useState<OpcionesGrabacion>(OPCIONES_POR_DEFECTO);
  const [avisoCaptura, setAvisoCaptura] = useState<string | null>(null);

  // Preferencias de este navegador (tras montar: nada de leer localStorage en el servidor).
  useEffect(() => {
    setOpciones(leerPreferencias());
  }, []);

  // Si solo hay cámara (móviles) o solo pantalla, la fuente se ajusta a lo posible.
  const fuenteEfectiva = soporte.pantalla && soporte.camara ? opciones.fuente : soporte.pantalla ? "pantalla" : "camara";
  const efectivas: OpcionesGrabacion = { ...opciones, fuente: fuenteEfectiva };

  const cambiar = useCallback((parche: Partial<OpcionesGrabacion>) => {
    setOpciones((previas) => {
      const siguientes = { ...previas, ...parche };
      try {
        window.localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(siguientes));
      } catch {
        /* modo privado o cuota: se sigue sin recordar */
      }
      return siguientes;
    });
  }, []);

  const hayAlgoQueGrabar = soporte.pantalla || soporte.camara;
  const enCurso = estado.fase === "preparando" || estado.fase === "cuenta-atras" || estado.fase === "grabando" || estado.fase === "pausada" || estado.fase === "procesando";

  const grabar = () => {
    // Directo desde el clic: el navegador exige el gesto reciente para compartir la pantalla.
    setAvisoCaptura(null);
    void controlador.iniciar(efectivas);
  };
  const capturar = async () => {
    const r = await controlador.capturarImagen();
    setAvisoCaptura(r.ok ? null : r.mensaje);
  };

  return (
    <div data-testid="seccion-grabar" className="space-y-5">
      <header className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-300/40 bg-amber-400/15 text-amber-200 shadow-[0_0_20px_-6px_rgba(255,191,0,0.55)]">
          <Video className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="font-headline text-lg font-light uppercase tracking-widest text-amber-50">Grabadora</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-amber-100/65">
            Graba tu pantalla, una ventana o una pestaña, con tu voz y tu cámara. El archivo queda en tu aparato; tú decides si lo subes a tu Biblioteca.
          </p>
        </div>
      </header>

      {!soporte.pantalla && soporte.motivoSinPantalla && (
        <AvisoSinPantalla motivo={soporte.motivoSinPantalla} puedeCamara={soporte.camara} onAbrirCamara={() => ir("/camara")} />
      )}

      {estado.captura && (
        <ResultadoGrabacionVista
          resultado={estado.captura}
          onDescartar={() => controlador.descartarCaptura()}
          onVerEnGaleria={() => ir("/galeria")}
          depsGuardado={depsGuardado}
        />
      )}

      {enCurso && <PanelEnCurso estado={estado} controlador={controlador} puedeCapturar={soporte.pantalla && estado.superficie !== "camara"} avisoCaptura={avisoCaptura} onCapturar={capturar} />}

      {!enCurso && estado.resultado && (
        <ResultadoGrabacionVista
          resultado={estado.resultado}
          onDescartar={() => controlador.descartar()}
          onVerEnGaleria={() => ir("/galeria")}
          depsGuardado={depsGuardado}
        />
      )}

      {!enCurso && estado.fase === "error" && estado.error && (
        <p role="alert" data-testid="grabar-error" className="rounded-2xl border border-red-400/40 bg-red-500/10 px-3.5 py-3 text-[12px] leading-snug text-red-100">
          {estado.error}
        </p>
      )}

      {!enCurso && estado.fase === "inactiva" && estado.avisos.length > 0 && (
        <p role="status" data-testid="grabar-aviso" className="rounded-2xl border border-amber-300/30 bg-amber-400/[0.08] px-3.5 py-3 text-[12px] leading-snug text-amber-50">
          {estado.avisos[0]}
        </p>
      )}

      {!enCurso && hayAlgoQueGrabar && (
        <>
          <SeccionLogic titulo="Qué y cómo grabar" icono={Film} testId="grabar-ajustes">
            <AjustesGrabacion opciones={efectivas} soporte={soporte} onCambio={cambiar} />
          </SeccionLogic>

          <div className="grid gap-2" data-testid="grabar-acciones">
            <BotonLogic variante="peligro" icono={CircleDot} onClick={grabar} className="min-h-[52px] text-sm" bloque>
              {estado.resultado ? "Grabar de nuevo" : "Grabar"}
            </BotonLogic>
            {estado.resultado && (
              <p className="px-1 text-center text-[11px] leading-snug text-amber-100/55">Al grabar de nuevo se reemplaza la grabación de arriba.</p>
            )}
            {soporte.pantalla && (
              <BotonLogic icono={Camera} onClick={capturar} bloque>
                Captura de pantalla
              </BotonLogic>
            )}
            {avisoCaptura && (
              <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-[11px] leading-snug text-red-100">
                {avisoCaptura}
              </p>
            )}
          </div>
        </>
      )}

      <EnlaceCap />
    </div>
  );
}
