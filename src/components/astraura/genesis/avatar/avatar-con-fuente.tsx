"use client";

/**
 * avatar-con-fuente.tsx — `<AvatarConFuente ser={...} avatarFuente={...} />`:
 * el cuerpo REAL de un ser, sea cual sea su fuente, con la garantía del
 * punto 4 del encargo: QUE NUNCA SE ROMPA EL CUERPO.
 * ----------------------------------------------------------------------------
 * `AvatarAutonomo` (`avatar-autonomo.tsx`) ya resuelve "un ser suelto,
 * SIEMPRE procedural" — Canvas, respaldo SVG, cupo de contextos. Este
 * componente es la capa que decide POR ENCIMA de eso si hay que enseñar
 * ese cuerpo procedural o una imagen (en línea o subida) — y si la imagen
 * falla, caduca o la bloquea la CSP, cae al procedural sin que quien lo usa
 * tenga que saberlo. Es un envoltorio deliberadamente NUEVO en vez de
 * cambiar `AvatarAutonomoProps`: `ser-avatar-slot.tsx` (de otro subagente)
 * ya depende de esa forma tal cual es hoy, y no es mía para tocar.
 *
 * La decisión de qué modo pintar NO vive aquí — vive en
 * `decidirModoEfectivo` (`avatar-busqueda-logica.ts`), pura y ya probada
 * por sus propios tests; este componente solo la LLAMA y reacciona al
 * único evento que ella no puede conocer de antemano: el `onError` real del
 * `<img>` del navegador (URL caída, caducada, o bloqueada por CSP — desde
 * JS los tres se ven exactamente igual: la imagen no carga).
 *
 * ACCESIBILIDAD, a propósito DISTINTA de `AvatarAutonomo`: allí el visual es
 * `aria-hidden` porque una forma procedural abstracta no describe nada que
 * una persona con lector de pantalla pueda aprovechar (el nombre va aparte,
 * como texto). Aquí, en cambio, la imagen ES información real — un
 * retrato — así que lleva `alt` real y NO es decorativa. Y la procedencia
 * (proveedor + licencia) se muestra como TEXTO, nunca solo como color.
 */

import { useEffect, useState } from "react";
import { Globe, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FuenteAvatar } from "@/lib/astraura/genesis-types";
import { AvatarAutonomo } from "./avatar-autonomo";
import type { NivelDetalle } from "./geometria";
// `genesis-logic.ts` no es mío (vive en `genesis/`, no en `genesis/avatar/`),
// pero SÍ es de lectura pública para todo Génesis — `ser-avatar-slot.tsx` ya
// lo importa igual para derivar el ADN de respaldo. No hay import inverso
// (genesis-logic.ts no importa nada de `avatar/`), así que no hay ciclo.
import { adnDeSer, type SerAdnInput } from "../genesis-logic";
import { decidirModoEfectivo } from "./avatar-busqueda-logica";

export interface AvatarConFuenteProps {
  /** Lo mínimo para derivar el ADN de respaldo — la misma forma que ya usa `SerAvatarSlot`. */
  ser: SerAdnInput;
  /** Ausente = procedural, como siempre — sin huecos ni "undefined" visible. */
  avatarFuente?: FuenteAvatar | null;
  detalle?: NivelDetalle;
  /** Tamaño en px, cuadrado. */
  tamano?: number;
  mostrarNombre?: boolean;
  /** Procedencia (proveedor + licencia) junto al ser cuando el modo efectivo
   *  es "enlinea" — el encargo lo pide "siempre", así que por defecto va
   *  encendido. Apágalo solo si quien te use YA la muestra en otro sitio
   *  (p. ej. una ficha con su propia leyenda aparte). */
  mostrarProcedencia?: boolean;
  className?: string;
}

/**
 * `<AvatarConFuente ser={ser} avatarFuente={ser.avatarFuente} />` — pinta
 * procedural, en línea o subido según corresponda, y si la imagen falla,
 * vuelve sola al procedural.
 */
export function AvatarConFuente({
  ser,
  avatarFuente,
  detalle = "alto",
  tamano = 56,
  mostrarNombre = false,
  mostrarProcedencia = true,
  className,
}: AvatarConFuenteProps) {
  const adn = adnDeSer(ser);
  const [fallaCarga, setFallaCarga] = useState(false);

  // Cada URL nueva merece su propio intento: si el ser cambió de elección
  // (o el componente pasó a representar a otro ser, en una lista), un
  // fallo anterior no debe seguir pegado a una URL distinta.
  useEffect(() => {
    setFallaCarga(false);
  }, [avatarFuente?.url]);

  const modoEfectivo = decidirModoEfectivo(avatarFuente, fallaCarga);

  if (modoEfectivo !== "enlinea" && modoEfectivo !== "subido") {
    // Procedural — el único camino que no depende de la red y por tanto no puede fallar.
    return (
      <AvatarAutonomo
        adn={adn}
        detalle={detalle}
        tamano={tamano}
        nombre={mostrarNombre ? ser.nombre : undefined}
        className={className}
      />
    );
  }

  // `decidirModoEfectivo` solo devuelve "enlinea"/"subido" cuando `url` existe.
  const url = avatarFuente!.url as string;

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className="relative block shrink-0 overflow-hidden rounded-full bg-white/5"
        style={{ width: tamano, height: tamano }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- host arbitrario
            (lo decide el proveedor de búsqueda, o quien pega la URL de "subido");
            `next/image` exigiría registrarlo por adelantado en `images.remotePatterns`
            de `next.config.ts`, que no es mío tocar. Ver la cabecera de la ruta
            `/api/avatar-search` para el razonamiento completo sobre la CSP. */}
        <img
          src={url}
          alt={`Retrato de ${ser.nombre}${modoEfectivo === "enlinea" && avatarFuente?.proveedor ? ` — ${avatarFuente.proveedor}` : ""}`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFallaCarga(true)}
        />
      </span>
      {(mostrarNombre || (mostrarProcedencia && modoEfectivo === "enlinea") || (mostrarProcedencia && modoEfectivo === "subido")) && (
        <span className="inline-flex min-w-0 flex-col">
          {mostrarNombre ? <span className="text-sm font-medium leading-none text-white/90">{ser.nombre}</span> : null}
          {mostrarProcedencia && modoEfectivo === "enlinea" ? (
            <span className="mt-0.5 inline-flex min-w-0 items-center gap-1 text-[10px] leading-tight text-white/55">
              <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate" title={avatarFuente?.atribucion ?? undefined}>
                En línea · {avatarFuente?.proveedor ?? "proveedor desconocido"} · {avatarFuente?.licencia ?? "licencia no declarada"}
              </span>
            </span>
          ) : null}
          {mostrarProcedencia && modoEfectivo === "subido" ? (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] leading-tight text-white/55">
              <UploadCloud className="h-3 w-3 shrink-0" aria-hidden="true" />
              Imagen subida
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

export default AvatarConFuente;
