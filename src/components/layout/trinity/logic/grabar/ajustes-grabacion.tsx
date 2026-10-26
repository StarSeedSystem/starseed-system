"use client";

/**
 * Qué grabar y cómo: fuente (pantalla o cámara sola), micrófono, sonido del sistema, cámara superpuesta
 * (con su esquina y tamaño), calidad, cuenta atrás y formato. Solo se enseña lo que ESTE navegador puede:
 * lo que no, no aparece como interruptor muerto sino como una línea que explica por qué.
 */
import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, Camera, MonitorUp, Timer } from "lucide-react";
import { bytesPorMinuto, minutosHastaElLimite } from "@/lib/grabacion/formato";
import type { SoporteGrabacion } from "@/lib/grabacion/soporte";
import { formatearTamano } from "@/lib/grabacion/texto";
import {
  CALIDADES,
  LIMITE_BIBLIOTECA_BYTES,
  type CalidadGrabacion,
  type CuentaAtras,
  type OpcionesGrabacion,
  type PosicionCamara,
  type PreferenciaFormato,
  type TamanoCamara,
} from "@/lib/grabacion/tipos";
import { FilaInterruptor } from "../fila-interruptor";
import { Segmentado } from "../segmentado";

interface Props {
  opciones: OpcionesGrabacion;
  soporte: SoporteGrabacion;
  onCambio: (parche: Partial<OpcionesGrabacion>) => void;
}

export function AjustesGrabacion({ opciones: o, soporte, onCambio }: Props) {
  const deCamara = o.fuente === "camara";
  const ambasFuentes = soporte.pantalla && soporte.camara;
  const conAudio = o.microfono || (o.sonidoSistema && !deCamara);
  const porMinuto = bytesPorMinuto(o.calidad, conAudio);
  const minutos = minutosHastaElLimite(o.calidad, conAudio, LIMITE_BIBLIOTECA_BYTES);
  const ambosFormatos = soporte.formatos.webm && soporte.formatos.mp4;

  return (
    <div className="space-y-3" data-testid="ajustes-grabacion">
      {ambasFuentes && (
        <Segmentado<OpcionesGrabacion["fuente"]>
          etiqueta="Qué grabar"
          valor={o.fuente}
          onCambio={(fuente) => onCambio({ fuente })}
          opciones={[
            { id: "pantalla", rotulo: "Pantalla", icono: MonitorUp, sub: "o ventana o pestaña" },
            { id: "camara", rotulo: "Solo cámara", icono: Camera },
          ]}
        />
      )}

      <div className="space-y-2">
        <FilaInterruptor
          etiqueta="Micrófono"
          descripcion="Tu voz en la grabación. El navegador te pedirá permiso al pulsar Grabar."
          marcado={o.microfono}
          onCambio={(microfono) => onCambio({ microfono })}
        />
        {!deCamara && soporte.sonidoSistema === "probable" && (
          <FilaInterruptor
            etiqueta="Sonido del sistema"
            descripcion="El audio de lo que compartes. Al elegir qué compartir, marca «Compartir audio»."
            marcado={o.sonidoSistema}
            onCambio={(sonidoSistema) => onCambio({ sonidoSistema })}
          />
        )}
        {!deCamara && soporte.sonidoSistema === "improbable" && (
          <p className="px-1 text-[11px] leading-snug text-amber-100/55">El sonido del sistema solo lo ofrecen Chrome y Edge de escritorio.</p>
        )}
        {!deCamara && soporte.camara && (
          <FilaInterruptor
            etiqueta="Cámara superpuesta"
            descripcion="Tu cámara en un círculo sobre la pantalla (imagen en imagen)."
            marcado={o.camaraSuperpuesta}
            onCambio={(camaraSuperpuesta) => onCambio({ camaraSuperpuesta })}
          />
        )}
      </div>

      {!deCamara && o.camaraSuperpuesta && (
        <div className="grid gap-2.5 rounded-2xl border border-white/10 bg-black/20 p-2.5 min-[400px]:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/55">Esquina</p>
            <Segmentado<PosicionCamara>
              etiqueta="Esquina de la cámara"
              valor={o.posicionCamara}
              onCambio={(posicionCamara) => onCambio({ posicionCamara })}
              opciones={[
                { id: "arriba-izquierda", rotulo: "Arriba a la izquierda", icono: ArrowUpLeft, soloIcono: true },
                { id: "arriba-derecha", rotulo: "Arriba a la derecha", icono: ArrowUpRight, soloIcono: true },
                { id: "abajo-izquierda", rotulo: "Abajo a la izquierda", icono: ArrowDownLeft, soloIcono: true },
                { id: "abajo-derecha", rotulo: "Abajo a la derecha", icono: ArrowDownRight, soloIcono: true },
              ]}
            />
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/55">Tamaño</p>
            <Segmentado<TamanoCamara>
              etiqueta="Tamaño de la cámara"
              valor={o.tamanoCamara}
              onCambio={(tamanoCamara) => onCambio({ tamanoCamara })}
              opciones={[
                { id: "pequena", rotulo: "S", titulo: "Pequeña" },
                { id: "mediana", rotulo: "M", titulo: "Mediana" },
                { id: "grande", rotulo: "L", titulo: "Grande" },
              ]}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="px-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/55">Calidad</p>
        <Segmentado<CalidadGrabacion>
          etiqueta="Calidad de la grabación"
          valor={o.calidad}
          onCambio={(calidad) => onCambio({ calidad })}
          opciones={(Object.keys(CALIDADES) as CalidadGrabacion[]).map((id) => ({
            id,
            rotulo: CALIDADES[id].etiqueta,
            sub: `${CALIDADES[id].fps} fps`,
          }))}
        />
        <p className="px-1 text-[11px] leading-snug text-amber-100/60" data-testid="estimacion-tamano">
          Unos {formatearTamano(porMinuto)} por minuto: en los {formatearTamano(LIMITE_BIBLIOTECA_BYTES)} de la Biblioteca caben ≈ {String(minutos).replace(".", ",")} min.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="flex items-center gap-1.5 px-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/55">
          <Timer className="h-3 w-3" aria-hidden="true" /> Cuenta atrás
        </p>
        <Segmentado<`${CuentaAtras}`>
          etiqueta="Cuenta atrás antes de grabar"
          valor={`${o.cuentaAtras}`}
          onCambio={(v) => onCambio({ cuentaAtras: Number(v) as CuentaAtras })}
          opciones={[
            { id: "0", rotulo: "Sin" },
            { id: "3", rotulo: "3 s" },
            { id: "5", rotulo: "5 s" },
          ]}
        />
      </div>

      {ambosFormatos && (
        <div className="space-y-1.5">
          <p className="px-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100/55">Formato</p>
          <Segmentado<PreferenciaFormato>
            etiqueta="Formato del archivo"
            valor={o.formato}
            onCambio={(formato) => onCambio({ formato })}
            opciones={[
              { id: "auto", rotulo: "Automático", sub: "WebM, más ligero" },
              { id: "mp4", rotulo: "MP4", sub: "se abre en todas partes" },
            ]}
          />
        </div>
      )}
    </div>
  );
}
