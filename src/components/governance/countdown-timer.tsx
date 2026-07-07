"use client";

// StarSeed · Ontocracia — Cuenta regresiva EN VIVO para el cierre de una
// votación (requisito: "tiempo de votación ... con cuenta regresiva visible").
// Puramente visual: recibe `endsAt` (ISO) y se actualiza cada segundo. El
// color se intensifica a medida que se acerca el cierre (coherente con la
// urgencia). Aditivo — no depende de ningún cambio al motor.

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

function segments(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { d, h, m, s };
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function CountdownTimer({
  endsAt,
  startedAt,
  className,
}: {
  /** ISO de cierre de la votación. */
  endsAt?: string | null;
  /** ISO de inicio (opcional, para calcular el % transcurrido). */
  startedAt?: string | null;
  className?: string;
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!endsAt) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-white/40", className)}>
        <Timer className="h-3 w-3" /> sin plazo definido
      </span>
    );
  }

  const end = new Date(endsAt).getTime();
  const remaining = end - now;
  const closed = remaining <= 0;

  let pct = 0;
  if (startedAt) {
    const start = new Date(startedAt).getTime();
    const total = Math.max(1, end - start);
    pct = Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)));
  }

  const urgent = !closed && remaining < 24 * 60 * 60_000;
  const critical = !closed && remaining < 60 * 60_000;

  if (closed) {
    return (
      <span className={cn("inline-flex items-center gap-1 font-medium text-white/50", className)}>
        <Timer className="h-3 w-3" /> Votación cerrada
      </span>
    );
  }

  const { d, h, m, s } = segments(remaining);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono tabular-nums",
        critical ? "text-red-300" : urgent ? "text-amber-300" : "text-emerald-300",
        className,
      )}
      title={`Cierra el ${new Date(endsAt).toLocaleString("es-ES")}`}
    >
      <Timer className={cn("h-3 w-3", critical && "animate-pulse")} />
      {d > 0 && <span>{d}d </span>}
      <span>
        {pad(h)}:{pad(m)}:{pad(s)}
      </span>
      {startedAt && <span className="text-[10px] text-white/35">· {pct}% transcurrido</span>}
    </span>
  );
}

export default CountdownTimer;
