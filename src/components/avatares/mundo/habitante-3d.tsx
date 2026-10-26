"use client";

/**
 * Un habitante dentro de la escena 3D del mundo (Ola 1025U · U1).
 *
 * `AvatarVivo` es DOM (un `<div>` con imagen o visor), no un objeto de three: dentro del `<Canvas>`
 * hay que montarlo con `<Html>` de drei, que lo coloca en la pantalla donde está el punto 3D. Antes
 * se devolvía el `<div>` pelado dentro del lienzo y R3F lo rechazaba. Dentro de un visor (VR/AR) el DOM
 * no se ve, así que allí el habitante es un cuerpo 3D (una orbe con su color).
 *
 * Todo habitante lleva su nombre y la chapa «Bot de IA»: es una IA y se ve que lo es.
 */
import { memo, useMemo } from "react";
import { Html } from "@react-three/drei";
import { Bot } from "lucide-react";
import { AvatarVivo, type FuenteAvatar } from "../avatar-vivo";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import { ETIQUETA_BOT_IA } from "@/lib/avatares/mundo/habitantes";
import { posicionEnEscena } from "@/lib/avatares/mundo/zonas";
import type { HabitanteMundo } from "@/lib/avatares/mundo/simulacion";

export interface TarjetaHabitanteProps {
  nombre: string;
  fuente: FuenteAvatar;
  gesto: Gesto;
  resaltado: boolean;
  atenuado: boolean;
  /** Frase del origen para el lector de pantalla («Bot de una entidad»…). */
  origen: string;
  onElegir: () => void;
}

/** La parte DOM de un habitante: avatar + nombre + chapa. Es un botón (teclado y lector de pantalla). */
export function TarjetaHabitante({ nombre, fuente, gesto, resaltado, atenuado, origen, onElegir }: TarjetaHabitanteProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${nombre}. ${ETIQUETA_BOT_IA}. ${origen}. Abrir su ficha`}
      aria-pressed={resaltado}
      data-testid="habitante-mundo"
      data-habitante={nombre}
      onClick={(e) => {
        e.stopPropagation();
        onElegir();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onElegir();
        }
      }}
      className="flex min-h-11 min-w-11 cursor-pointer select-none flex-col items-center gap-1 rounded-2xl outline-none transition-opacity duration-200 focus-visible:ring-2 focus-visible:ring-[#007FFF]"
      style={{ opacity: atenuado ? 0.5 : 1 }}
    >
      <AvatarVivo
        fuente={fuente}
        gesto={gesto}
        tamano={resaltado ? 112 : 92}
        className="drop-shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
      />
      <span
        className="max-w-[9rem] truncate rounded-md border border-white/15 bg-[rgba(8,12,20,0.6)] px-2 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur-md"
        data-testid="nombre-habitante"
      >
        {nombre}
      </span>
      <span
        className="inline-flex items-center gap-1 rounded-full border border-[#39FF14]/40 bg-[rgba(16,185,129,0.18)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B8FFD0]"
        data-testid="chapa-bot-ia"
      >
        <Bot className="size-3" aria-hidden="true" />
        {ETIQUETA_BOT_IA}
      </span>
    </div>
  );
}

/** Matiz estable (0–360) de un texto, para dar color propio al cuerpo 3D de quien no tiene avatar. */
export function matizDe(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

export interface Habitante3DProps {
  habitante: HabitanteMundo;
  fuente: FuenteAvatar;
  gesto: Gesto;
  origen: string;
  resaltado: boolean;
  atenuado: boolean;
  /** `true` dentro de un visor VR/AR: sin DOM, con cuerpo 3D. */
  enXR: boolean;
  onElegir: (id: string) => void;
}

function Habitante3DBase({ habitante, fuente, gesto, origen, resaltado, atenuado, enXR, onElegir }: Habitante3DProps) {
  const posicion = useMemo(() => posicionEnEscena(habitante.posicion), [habitante.posicion]);
  const color = useMemo(() => `hsl(${matizDe(habitante.id)} 70% 60%)`, [habitante.id]);
  return (
    <group position={posicion}>
      {enXR ? (
        <group onClick={() => onElegir(habitante.id)}>
          <mesh>
            <sphereGeometry args={[resaltado ? 0.55 : 0.42, 24, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} roughness={0.35} transparent opacity={atenuado ? 0.5 : 1} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.62, 0.035, 8, 40]} />
            <meshBasicMaterial color="#39FF14" />
          </mesh>
        </group>
      ) : (
        <Html center distanceFactor={16} zIndexRange={[10, 0]}>
          <TarjetaHabitante
            nombre={habitante.nombre}
            fuente={fuente}
            gesto={gesto}
            resaltado={resaltado}
            atenuado={atenuado}
            origen={origen}
            onElegir={() => onElegir(habitante.id)}
          />
        </Html>
      )}
    </group>
  );
}

export const Habitante3D = memo(Habitante3DBase);
