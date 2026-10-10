"use client";

/**
 * Foto redonda de un perfil con respaldo a las iniciales. La dirección ya pasó el filtro de seguridad
 * (`avatarUrlSegura`); aun así la imagen se pide sin enviar la página de origen (`no-referrer`) y, si no
 * carga, se dibujan las iniciales: nunca un icono roto ni una foto de adorno.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function FotoPerfil({ url, iniciales, size = 36, color = "#38bdf8", className, titulo }: {
  url: string | null;
  iniciales: string;
  size?: number;
  color?: string;
  className?: string;
  titulo?: string;
}) {
  const [fallo, setFallo] = useState(false);
  useEffect(() => { setFallo(false); }, [url]);
  const conFoto = !!url && !fallo;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, border: `2px solid ${color}`, background: conFoto ? "#0b1220" : `${color}33`, fontSize: Math.max(8, Math.round(size * 0.36)) }}
      title={titulo}
      data-testid="foto-perfil"
      data-modo={conFoto ? "foto" : "iniciales"}
    >
      {conFoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url!} alt="" width={size} height={size} className="h-full w-full object-cover" referrerPolicy="no-referrer" loading="lazy" decoding="async" draggable={false} onError={() => setFallo(true)} />
      ) : (
        <span aria-hidden>{iniciales}</span>
      )}
    </span>
  );
}

export default FotoPerfil;
