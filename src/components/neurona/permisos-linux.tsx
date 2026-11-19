"use client";

/*
 * PermisosLinux — «Preparar este Linux» y el interruptor «Neurona nodo: no apagar pantalla ni bloquear»
 * (LNX1118WD, 2026-11-19). Lo que el guion del nodo hacía a mano, por defecto.
 *
 * La medida es del módulo puro `native/src-tauri/src/permisos_linux_logica.rs` (interpreta `id -Gn`,
 * `ls -l /dev/uinput` y `systemctl is-active bluetooth`). Aquí solo se pinta y se pide: el botón lanza
 * `permisos_linux_preparar`, que abre el diálogo del sistema con `pkexec`; nada se ejecuta como root sin
 * que la persona lo acepte. El interruptor está APAGADO por defecto y se aplica por el mismo camino.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, MonitorOff, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { puenteNativo } from "@/lib/nativa/puente";

export interface EstadoNodoLinux {
  grupos_faltan: string[];
  uinput: boolean;
  bluetooth: boolean;
  completo: boolean;
}

export interface FaltaNodo {
  clave: "grupos" | "uinput" | "bluetooth";
  titulo: string;
  detalle: string;
}

/** Preferencia del interruptor; ausente = apagado (lo que manda la tarea). */
export const CLAVE_SIN_REPOSO = "starseed.neurona.nodo-sin-reposo.v1";

const NOMBRE_GRUPO: Record<string, string> = {
  netdev: "red (netdev)",
  bluetooth: "Bluetooth",
  audio: "sonido (audio)",
  video: "vídeo (video)",
  render: "render",
  input: "entrada (input)",
  plugdev: "dispositivos (plugdev)",
  dialout: "serie (dialout)",
};

export function nombreGrupo(grupo: string): string {
  return NOMBRE_GRUPO[grupo] ?? grupo;
}

/** Lo que falta, ya en claro, para la lista. Pura. */
export function faltasDe(e: EstadoNodoLinux | null): FaltaNodo[] {
  if (!e) return [];
  const faltas: FaltaNodo[] = [];
  if (e.grupos_faltan.length) {
    faltas.push({ clave: "grupos", titulo: "Grupos del sistema", detalle: `Faltan: ${e.grupos_faltan.map(nombreGrupo).join(", ")}.` });
  }
  if (!e.uinput) {
    faltas.push({ clave: "uinput", titulo: "Mando virtual (/dev/uinput)", detalle: "Falta /dev/uinput para el grupo input: sin él no se controlan el ratón y el teclado." });
  }
  if (!e.bluetooth) {
    faltas.push({ clave: "bluetooth", titulo: "Bluetooth del sistema", detalle: "El servicio bluetooth no está encendido: las antenas no arrancan." });
  }
  return faltas;
}

/** Frase corta del estado del nodo. Pura. */
export function resumenNodo(e: EstadoNodoLinux | null): string {
  if (!e) return "Midiendo este Linux…";
  if (e.completo) return "Listo: este Linux ya puede ser nodo.";
  const n = faltasDe(e).length;
  return n === 1 ? "Falta 1 cosa para ser nodo." : `Faltan ${n} cosas para ser nodo.`;
}

function leerSinReposo(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_SIN_REPOSO) === "1";
  } catch {
    return false;
  }
}

function guardarSinReposo(valor: boolean): void {
  try {
    window.localStorage.setItem(CLAVE_SIN_REPOSO, valor ? "1" : "0");
  } catch {
    /* sin almacenamiento se queda apagado: es lo de la tarea */
  }
}

export function PermisosLinux() {
  const [estado, setEstado] = useState<EstadoNodoLinux | null>(null);
  const [sinReposo, setSinReposo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [midiendo, setMidiendo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setMidiendo(true);
    setError(null);
    const r = await puenteNativo().llamar<EstadoNodoLinux>("permisos_linux_nodo_estado");
    setMidiendo(false);
    if (!r.ok) {
      setError(r.motivo);
      return;
    }
    setEstado({
      grupos_faltan: Array.isArray(r.valor?.grupos_faltan) ? r.valor.grupos_faltan.filter((g): g is string => typeof g === "string") : [],
      uinput: r.valor?.uinput === true,
      bluetooth: r.valor?.bluetooth === true,
      completo: r.valor?.completo === true,
    });
  }, []);

  useEffect(() => {
    setSinReposo(leerSinReposo());
    void cargar();
  }, [cargar]);

  const ejecutar = useCallback(
    async (valor: boolean): Promise<boolean> => {
      setTrabajando(true);
      setError(null);
      setAviso(null);
      const r = await puenteNativo().llamar<string>("permisos_linux_preparar", { sinReposo: valor });
      setTrabajando(false);
      if (!r.ok) {
        setError(r.motivo);
        return false;
      }
      setAviso(typeof r.valor === "string" && r.valor ? r.valor : "Preparado. Cierra sesión y vuelve a entrar.");
      await cargar();
      return true;
    },
    [cargar],
  );

  async function cambiarSinReposo(valor: boolean) {
    setSinReposo(valor);
    guardarSinReposo(valor);
    if (!(await ejecutar(valor))) {
      setSinReposo(!valor);
      guardarSinReposo(!valor);
    }
  }

  const faltas = faltasDe(estado);

  return (
    <section
      data-testid="permisos-linux"
      aria-label="Preparar este Linux"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-white shadow-lg backdrop-blur"
    >
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#39FF14]/30 bg-[#39FF14]/10 text-[#39FF14]">
          <ShieldCheck className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Preparar este Linux</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-white/60" data-testid="resumen-nodo">
            {resumenNodo(estado)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void cargar()}
          disabled={midiendo || trabajando}
          aria-label="Volver a medir"
          className="cursor-pointer rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
        >
          <RefreshCw className={`size-4 ${midiendo ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </header>

      {midiendo && !estado ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-white/50">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Midiendo grupos, mando virtual y Bluetooth…
        </p>
      ) : estado?.completo ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">
          <Check className="size-4 shrink-0" aria-hidden /> No falta nada: este Linux ya puede ser nodo.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5" data-testid="faltas-nodo">
          {faltas.map((f) => (
            <li
              key={f.clave}
              data-testid={`falta-${f.clave}`}
              className="flex items-start gap-2.5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-xs"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
              <span className="min-w-0 flex-1 break-words">
                <span className="block font-medium text-white/90">{f.titulo}</span>
                <span className="block leading-relaxed text-white/55">{f.detalle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => void ejecutar(sinReposo)}
        disabled={trabajando || midiendo}
        data-testid="preparar-linux"
        className="mt-3 flex min-h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-[#39FF14]/40 bg-[#39FF14]/10 px-3 py-1.5 text-xs font-medium text-[#39FF14] hover:bg-[#39FF14]/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {trabajando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
        {estado?.completo ? "Volver a preparar" : "Preparar este Linux"}
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
        Pide el diálogo del sistema (pkexec). Al terminar hay que cerrar sesión y volver a entrar.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
        <MonitorOff className="mt-0.5 size-4 shrink-0 text-white/60" aria-hidden />
        <span className="min-w-0 flex-1 basis-48 text-xs">
          <span className="block font-medium text-white/90">Neurona nodo: no apagar pantalla ni bloquear</span>
          <span className="block leading-relaxed text-white/50">Apagado por defecto. Al encenderlo, el diálogo del sistema lo aplica a tu sesión.</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={sinReposo}
          aria-label="Neurona nodo: no apagar pantalla ni bloquear"
          disabled={trabajando}
          onClick={() => void cambiarSinReposo(!sinReposo)}
          data-testid="interruptor-sin-reposo"
          className={`relative ml-auto h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            sinReposo ? "border-[#39FF14]/50 bg-[#39FF14]/30" : "border-white/15 bg-white/10"
          }`}
        >
          <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-all ${sinReposo ? "left-[1.375rem]" : "left-0.5"}`} aria-hidden />
        </button>
      </div>

      {error && (
        <p role="alert" data-testid="error-preparar" className="mt-2 text-xs leading-relaxed text-amber-300/90">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" data-testid="aviso-preparar" className="mt-2 text-xs leading-relaxed text-[#39FF14]/90">
          {aviso}
        </p>
      )}
    </section>
  );
}
