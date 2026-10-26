"use client";

/**
 * Los avisos honestos del mundo (Ola 1025U · U1): qué es real y qué es juego, cuánta gente queda fuera de la
 * vista, qué fuente no se pudo leer y si no se pudo guardar. Nada se calla y nada se inventa.
 */
import { AlertTriangle, Info, Users } from "lucide-react";
import { ETIQUETA_BOT_IA } from "@/lib/avatares/mundo/habitantes";

export interface AvisosMundoProps {
  /** Cuántos habitantes reales hay en total para este escenario (antes de recortar a los visibles). */
  total: number;
  /** Cuántos se dibujan. */
  visibles: number;
  /** Cuántos quedan fuera de la vista por el tope. */
  ocultos: number;
  /** Se están leyendo las fuentes de la cuenta. */
  cargando: boolean;
  /** Fuentes que no respondieron, ya redactadas. */
  avisosFuentes: readonly string[];
  /** `false` = no se pudo guardar en este aparato. */
  guardado: boolean;
  /** Hay sesión abierta (para decir qué falta si no hay habitantes). */
  sinSesion: boolean;
}

export function AvisosMundo({ total, visibles, ocultos, cargando, avisosFuentes, guardado, sinSesion }: AvisosMundoProps) {
  const avisos: Array<{ clave: string; texto: string; tipo: "info" | "alerta" | "gente" }> = [];

  if (cargando) {
    avisos.push({ clave: "cargando", texto: "Leyendo los agentes de tu cuenta…", tipo: "info" });
  } else if (total === 0) {
    avisos.push({
      clave: "vacio",
      texto: sinSesion
        ? "Este mundo está vacío. No hay personalidades en este aparato ni sesión para traer los bots de tus grupos y páginas. No se inventa a nadie: cuando haya agentes reales, vivirán aquí."
        : "Este mundo está vacío. Aún no hay personalidades en tu cuenta ni bots activos en tus grupos y páginas. No se inventa actividad: cuando los crees, vivirán aquí.",
      tipo: "info",
    });
  } else {
    avisos.push({
      clave: "juego",
      texto: `Los ${visibles} habitantes son agentes reales y llevan la chapa «${ETIQUETA_BOT_IA}». Sus paseos, encuentros y obras son una simulación de juego, no actividad real.`,
      tipo: "info",
    });
  }

  if (ocultos > 0) {
    avisos.push({
      clave: "tope",
      texto: `Se ven ${visibles} de ${total} habitantes para que el mundo vaya fluido. ${ocultos === 1 ? "Queda 1 fuera" : `Quedan ${ocultos} fuera`} de la vista.`,
      tipo: "gente",
    });
  }
  for (const f of avisosFuentes) avisos.push({ clave: `fuente-${f}`, texto: f, tipo: "alerta" });
  if (!guardado) {
    avisos.push({ clave: "guardado", texto: "No se pudo guardar el mundo en este aparato (sin espacio o almacenamiento bloqueado). Se pierde al cerrar.", tipo: "alerta" });
  }

  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite" data-testid="avisos-mundo">
      {avisos.map((a) => {
        const Icono = a.tipo === "alerta" ? AlertTriangle : a.tipo === "gente" ? Users : Info;
        return (
          <p
            key={a.clave}
            data-testid={`aviso-mundo-${a.clave.startsWith("fuente-") ? "fuente" : a.clave}`}
            className={
              "flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug backdrop-blur-xl " +
              (a.tipo === "alerta" ? "border-amber-300/30 bg-amber-400/10 text-amber-50" : "border-white/12 bg-[rgba(8,12,24,0.6)] text-white/75")
            }
          >
            <Icono className={"mt-0.5 size-3.5 shrink-0 " + (a.tipo === "alerta" ? "text-amber-300" : "text-cyan-300")} aria-hidden="true" />
            <span className="min-w-0">{a.texto}</span>
          </p>
        );
      })}
    </div>
  );
}
