"use client";

/**
 * Leyenda del mapa: cada canal visual y lo ÚNICO que significa. Una fila corta siempre visible
 * (solo con lo que hay ahora en el mapa) + la explicación completa plegable. Si cambia lo que el
 * mapa dibuja, este texto cambia con él (la altura sale del modo elegido y los enlaces, de los que
 * hay de verdad).
 */

import { Info } from "lucide-react";
import { ANTENNA_COLOR, ANTENNA_LABEL } from "@/ai/astraura/mesh/signals";
import { COLOR_ESTADO, TEXTO_ESTADO } from "@/lib/senales/aparatos";
import { ESTILO_ENLACE, ETIQUETA_CLASE } from "@/lib/senales/enlaces";
import {
  FAMILIAS, SECTOR_CORTO, leyendaAltura, type ModoAltura,
} from "@/lib/senales/mapa-3d";
import { NOMBRE_ICONO, type IconoId } from "@/lib/senales/iconos";
import type { ClaseEnlace } from "@/lib/senales/tipos-vivo";
import { GlifoIcono } from "./icono-2d";

const PUNTO = "inline-block size-2 rounded-full";

function Trazo({ clase }: { clase: ClaseEnlace }) {
  const e = ESTILO_ENLACE[clase];
  return (
    <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden className="shrink-0">
      <line x1="1" y1="3" x2="17" y2="3" stroke={e.color} strokeWidth={Math.max(1.2, e.ancho)} strokeOpacity={Math.max(0.6, e.opacidad)} strokeDasharray={e.discontinua ? "3 2" : undefined} strokeLinecap="round" />
    </svg>
  );
}

export interface LeyendaMapaProps {
  altura: ModoAltura;
  gpsAhora: number;
  /** Clases de enlace que hay ahora en el mapa (solo se explica lo que se ve). */
  clases: readonly ClaseEnlace[];
  hayAparatos: boolean;
  hayMedios: boolean;
  /** Iconos (tipos de señal) que hay ahora en el mapa: solo se explica lo que se ve. */
  iconos?: readonly IconoId[];
  compacto?: boolean;
}

export function LeyendaMapa({ altura, gpsAhora, clases, hayAparatos, hayMedios, iconos = [], compacto = false }: LeyendaMapaProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/60" aria-label="Leyenda corta">
        <span className="font-semibold uppercase tracking-wider text-white/40">Núcleo = calidad</span>
        <span className="inline-flex items-center gap-1"><span className={PUNTO} style={{ background: "#34d399" }} />fuerte</span>
        <span className="inline-flex items-center gap-1"><span className={PUNTO} style={{ background: "#fbbf24" }} />media</span>
        <span className="inline-flex items-center gap-1"><span className={PUNTO} style={{ background: "#fb7185" }} />débil</span>
        <span className="inline-flex items-center gap-1"><span className={PUNTO} style={{ background: "#8b8b9e" }} />sin métrica</span>
        {clases.length > 0 && !compacto && (
          <>
            <span aria-hidden className="text-white/20">|</span>
            <span className="font-semibold uppercase tracking-wider text-white/40">Línea = enlace</span>
            {clases.map((c) => (
              <span key={c} className="inline-flex items-center gap-1"><Trazo clase={c} />{ETIQUETA_CLASE[c].replace("P2P · ", "").replace("Radio LoRa · oído por tu radio", "radio LoRa")}</span>
            ))}
          </>
        )}
        {hayAparatos && !compacto && (
          <>
            <span aria-hidden className="text-white/20">|</span>
            <span className="font-semibold uppercase tracking-wider text-white/40">Punto = estado</span>
            {(["activa", "segundo-plano", "en-linea", "desconectada"] as const).map((e) => (
              <span key={e} className="inline-flex items-center gap-1"><span className={PUNTO} style={{ background: COLOR_ESTADO[e] }} />{TEXTO_ESTADO[e].replace("abierta en ", "")}</span>
            ))}
          </>
        )}
        {!compacto && (
          <>
            <span aria-hidden className="text-white/20">|</span>
            <span className="inline-flex items-center gap-1"><span className={`${PUNTO} bg-white`} />cuenta StarSeed</span>
            <span className="inline-flex items-center gap-1"><span className={`${PUNTO} border border-amber-300`} />simulador</span>
          </>
        )}
      </div>

      <details className="group rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-semibold text-white/70">
          <Info className="h-3.5 w-3.5 text-sky-300" />
          Cómo leer este mapa
          <span className="ml-auto text-[9px] font-normal text-white/35 group-open:hidden">pulsa para desplegar</span>
        </summary>
        <ul className="mt-1.5 space-y-1.5 text-[10px] leading-snug text-white/55">
          <li>
            <span className="font-semibold text-white/80">Tu neurona está en el centro</span>, con su nombre y la foto de tu perfil activo.{" "}
            Púlsala para ver tu aparato, los medios que tienes en él, tus antenas, tu radio y qué ven de ti las demás cuentas, y para editar su nombre y su privacidad. Cada marca es algo que
            esta neurona oye o ve de verdad: lo que no se mide se dice «sin métrica», «sin posición» o «no medido».
          </li>
          <li>
            <span className="font-semibold text-white/80">Icono = tipo de señal.</span> Sale de lo que la propia señal declara (la antena, o el tipo de aparato de su registro).
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1" aria-label="Iconos presentes">
              {iconos.length === 0 && <span className="text-white/40">Todavía no hay señales que dibujar.</span>}
              {iconos.map((i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  <GlifoIcono id={i} color="#cbd5e1" size={13} />
                  {NOMBRE_ICONO[i]}
                </span>
              ))}
            </span>
          </li>
          <li>
            <span className="font-semibold text-white/80">Familia de antena = color del aro + cuña del suelo.</span>
            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {FAMILIAS.map((f) => (
                <span key={f} className="inline-flex items-center gap-1" title={ANTENNA_LABEL[f]}>
                  <span className={PUNTO} style={{ background: ANTENNA_COLOR[f] }} />
                  {SECTOR_CORTO[f]}
                </span>
              ))}
            </span>
          </li>
          <li>
            <span className="font-semibold text-white/80">Tamaño y color del núcleo = calidad medida.</span>{" "}
            Cuanto más grande y más verde, mejor señal. Para una neurona de tu cuenta la calidad es su presencia o la latencia real de su canal; para un faro, lo reciente que es.
          </li>
          <li>
            <span className="font-semibold text-white/80">Altura:</span> {leyendaAltura(altura)} Cámbiala con el selector «Altura».
          </li>
          <li>
            <span className="font-semibold text-white/80">Halo del suelo = rango de precisión.</span>{" "}
            Anillo continuo y pequeño: posición GPS real de ambos extremos ({gpsAhora} ahora). Punteado medio: distancia estimada por
            radiofrecuencia con rumbo desconocido. Punteado grande: sin posición, la distancia al centro solo refleja la calidad.
          </li>
          <li>
            <span className="font-semibold text-white/80">Los anillos de distancia solo aparecen donde hay distancia.</span>{" "}
            Un círculo completo exige GPS de ambos extremos (rumbo real). Un arco «≈» es distancia estimada por radiofrecuencia y solo
            cubre el sector de su antena, porque el rumbo se desconoce. LoRa usa una regla larga (30 m–6 km); Bluetooth y Wi-Fi, una corta
            (1–300 m). Sin distancia no hay anillos, y el <em>ángulo</em> sin GPS no es un rumbo real.
          </li>
          {hayAparatos && (
            <li>
              <span className="font-semibold text-white/80">Aparatos de tu cuenta:</span> el radio al centro es su calidad, no una distancia en metros.
              La <span className="font-semibold text-white/80">línea hasta ti</span> es el camino real medido y su etiqueta, la latencia: P2P en tu red local, por internet,
              reenviado por TURN, directo sin internet, por el relé cifrado o ninguno (punteada, con su motivo en la ficha).
              El <span className="font-semibold text-white/80">punto</span> sobre la marca es su estado en vivo; un aparato desconectado se ve tenue.
            </li>
          )}
          {hayMedios && (
            <li>
              <span className="font-semibold text-white/80">Rombos pequeños = medios abiertos</span> (app nativa, Chrome en Vercel, Chrome en localhost…)
              orbitando a su aparato: verde si están a la vista, ámbar si están en segundo plano. No tienen posición propia.
            </li>
          )}
          <li>
            <span className="font-semibold text-white/80">Pulso</span> = oída hace menos de 30 s. Los{" "}
            <span className="font-semibold text-white/80">discos pequeños del centro</span> son las antenas de esta neurona: su cercanía solo indica si están en uso, listas o son informativas, nunca una distancia.
          </li>
          <li>
            <span className="font-semibold text-white/80">Fotos.</span> Tus aparatos llevan la foto de tu perfil. Otra cuenta solo muestra nombre, foto o tipo de aparato si ELLA eligió ser «visible» en el radar público y marcó compartirlo;
            si no, aparece como «Neurona de otra cuenta» y sin foto. Tú decides si ves esos datos públicos en los ajustes de tu neurona.
          </li>
        </ul>
      </details>
    </div>
  );
}

export default LeyendaMapa;
