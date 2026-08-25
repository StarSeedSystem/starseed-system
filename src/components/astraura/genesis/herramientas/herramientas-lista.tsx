"use client";

/**
 * herramientas-lista.tsx — el catálogo real de `HerramientaDisponible[]`
 * (`GET /api/genesis/herramientas`, punto 3 del encargo de OLA 2).
 *
 * Cada herramienta dice si está disponible DE VERDAD y, si no, por qué. Este
 * fichero traduce eso a la interfaz con una regla sin excepciones: una
 * herramienta con `disponible !== true` se pinta como NO disponible, con su
 * `motivo` siempre visible al lado (nunca escondido, nunca en blanco) — no
 * se lista nunca como si funcionara. Agrupado por `fuente`, en el mismo
 * orden en que Alex las nombró: OS, usuario, dispositivo, web.
 *
 * Global, no por ser (el endpoint no lleva `{id}`), así que — igual que
 * `propuestas-bandeja.tsx` — este componente se planta con su propia tarjeta
 * y su propio título: se puede montar directamente, sin que un contenedor
 * externo tenga que envolverlo.
 *
 * CIERRE DE DEUDA — depósito de la biblioteca del usuario: "biblioteca del
 * usuario" salía siempre `disponible:false` porque vive en `localStorage`
 * del navegador y el backend en Python no podía leerla. Con `target`
 * presente, este panel la deposita de verdad al montarse (abrir el panel de
 * herramientas ES la señal de "ahora toca") y otra vez cuando la biblioteca
 * cambia mientras el panel sigue abierto (`subscribeLibrary`, con un
 * pequeño debounce para no disparar un POST por cada mutación de una
 * ráfaga). Sin `target` (montajes que aún no lo pasan) el panel se queda
 * exactamente como antes: de solo lectura. Nunca deposita en cada render:
 * el efecto está atado a `[target]`, y una huella de contenido
 * (`huellaPaquetes`) evita repetir el mismo depósito si el evento de
 * biblioteca disparó por un cambio ajeno a "mine" (instalar algo del
 * catálogo del OS también toca `starseed.library.*`).
 */
import { useEffect, useRef, useState } from "react";
import { Bot, Ban, CircleCheck, FolderHeart, HardDrive, Library, UploadCloud, Wrench, Globe as WebIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HerramientaDisponible } from "@/lib/astraura/genesis-types";
import { depositGenesisBibliotecaUsuario, type GenesisTarget } from "@/lib/astraura/genesis-client-ola2";
import { MINE_REPO_ID, listRepos, subscribeLibrary } from "@/lib/library/packages";
import { Badge, BusyIcon, CARD, Empty, SUB, SectionTitle } from "../../s158/shared";
import {
  agruparHerramientasPorFuente, describirDeposito, huellaPaquetes, motivoNoDisponible, paquetesDeLibreria, resumirHerramientas,
  type EstadoDeposito,
} from "./herramientas-logic";

/** Lee la biblioteca REAL del usuario ("mine", nunca la del OS) — el único punto de este fichero que toca `localStorage`; la traducción al cuerpo del backend es pura y vive (y se testea) en `herramientas-logic.ts`. */
function bibliotecaUsuarioActual() {
  const mia = listRepos().find((r) => r.id === MINE_REPO_ID);
  return paquetesDeLibreria(mia?.packages);
}

/** Icono + tono de la línea de estado del depósito — nunca solo color, la palabra de `describirDeposito` va siempre al lado. */
function DepositoBanner({ target, estado }: { target: GenesisTarget; estado: EstadoDeposito }) {
  const texto = describirDeposito(estado);
  if (!texto) return null; // "inactivo": todavía no hubo ni un primer intento
  const esError = estado.fase === "error";
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-[10px] leading-snug",
        esError ? "border-rose-400/40 bg-rose-500/[0.08] text-rose-200/90" : "border-white/10 bg-black/20 text-white/60",
      )}
      role={esError ? "alert" : "status"}
    >
      <BusyIcon busy={estado.fase === "depositando"} icon={esError ? Ban : UploadCloud} />
      <span>
        {texto} <span className="text-white/35">({target === "nube" ? "nube" : "esta neurona"})</span>
      </span>
    </div>
  );
}

const ICONO_FUENTE: Record<string, LucideIcon> = {
  "biblioteca-os": Library,
  "biblioteca-usuario": FolderHeart,
  dispositivo: HardDrive,
  web: WebIcon,
  nativa: Bot,
};

function HerramientaRow({ h }: { h: HerramientaDisponible }) {
  const disponible = h.disponible === true;
  return (
    <div className={cn(SUB, "flex items-start gap-2 px-3 py-2")}>
      {disponible ? (
        <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />
      ) : (
        <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[11px] font-medium text-white/90">{h.nombre || "(sin nombre)"}</p>
          <Badge tone={disponible ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}>
            {disponible ? "disponible" : "no disponible"}
          </Badge>
          {h.requierePermiso && <Badge tone="border-amber-400/30 bg-amber-500/10 text-amber-100">requiere: {h.requierePermiso}</Badge>}
        </div>
        {h.descripcion && <p className="mt-0.5 text-[10px] leading-snug text-white/55">{h.descripcion}</p>}
        {/* Nunca se lista como si funcionara: el motivo real (o uno honesto por defecto) va siempre visible aquí. */}
        {!disponible && <p className="mt-0.5 text-[10px] leading-snug text-rose-200/75">{motivoNoDisponible(h)}</p>}
      </div>
    </div>
  );
}

export interface HerramientasListaProps {
  lista: HerramientaDisponible[] | null | undefined;
  loading?: boolean;
  error?: string;
  /**
   * Con `target`, este panel deposita de verdad la biblioteca del usuario
   * al abrirse (y de nuevo si cambia mientras sigue abierto) — ver la nota
   * de cabecera del fichero. Opcional para no romper montajes que todavía
   * no lo pasan: sin él, el panel se queda de solo lectura, como siempre.
   */
  target?: GenesisTarget;
}

export function HerramientasLista({ lista, loading, error, target }: HerramientasListaProps) {
  const seguras = Array.isArray(lista) ? lista : [];
  const resumen = resumirHerramientas(seguras);
  const grupos = agruparHerramientasPorFuente(seguras);

  const [deposito, setDeposito] = useState<EstadoDeposito>({ fase: "inactivo" });
  // Última huella depositada CON ÉXITO — evita repetir el mismo POST cuando
  // `subscribeLibrary` dispara por un cambio de biblioteca ajeno a "mine".
  const ultimaHuella = useRef<string>("");

  useEffect(() => {
    if (!target) return; // sin destino no hay a quién depositarle nada: el panel se queda de solo lectura
    const destino: GenesisTarget = target; // capturado ya-narrowed: una función anidada no conserva el `if` de arriba
    let vivo = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    async function depositar() {
      const paquetes = bibliotecaUsuarioActual();
      const huella = huellaPaquetes(paquetes); // "[]" para la vacía — nunca coincide con el "" inicial del ref, así que el primer paso siempre se evalúa
      if (huella === ultimaHuella.current) return; // exactamente el mismo estado que el último depósito (vacía incluida): nada nuevo que decir
      // Vacía DESDE EL PRINCIPIO (nunca se depositó nada): no hay nada que
      // corregirle al backend, así que ni hace falta el POST. Distinto de
      // "estaba llena y ahora está vacía" — eso SÍ es una corrección real
      // (el usuario borró sus paquetes) y debe llegar al backend, no solo
      // quedarse local: si no, el backend seguiría creyendo que el usuario
      // tiene paquetes que ya borró.
      if (paquetes.length === 0 && ultimaHuella.current === "") {
        ultimaHuella.current = huella;
        if (vivo) setDeposito({ fase: "vacio" });
        return;
      }
      if (vivo) setDeposito({ fase: "depositando" });
      const r = await depositGenesisBibliotecaUsuario(destino, paquetes);
      if (!vivo) return;
      if (!r.ok) { setDeposito({ fase: "error", error: r.error, en: Date.now() }); return; } // si falla, se dice — nunca en silencio
      ultimaHuella.current = huella;
      setDeposito({ fase: "ok", recibidos: r.data.recibidos, descartados: r.data.descartados, en: Date.now() });
    }

    void depositar(); // al abrir el panel: lo mínimo que pide el encargo

    // Cuando la biblioteca cambia mientras el panel sigue abierto — vía
    // limpia (`subscribeLibrary`) en vez de sondear. Debounce corto: varias
    // mutaciones seguidas (p. ej. replicar y renombrar) deben acabar en UN
    // depósito, no en uno por cada una.
    const dejarDeEscuchar = subscribeLibrary(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { if (vivo) void depositar(); }, 800);
    });

    return () => { vivo = false; if (debounce) clearTimeout(debounce); dejarDeEscuchar(); };
  }, [target]);

  return (
    <div className={cn(CARD, "space-y-2 p-3")}>
      <SectionTitle
        icon={Wrench}
        title={`Herramientas (${resumen.disponibles} de ${resumen.total} disponibles)`}
        tone="text-amber-300"
        hint="Lo que el sistema realmente tiene, agrupado por de dónde viene. Una herramienta no disponible se ve como no disponible, con su razón."
      />

      {target && <DepositoBanner target={target} estado={deposito} />}

      {seguras.length === 0 && <Empty loading={loading} error={error} text="Sin herramientas todavía: si no hay ninguna, es que el backend no expone ninguna ahora mismo." />}

      {grupos.map((g) => {
        const Icon = ICONO_FUENTE[g.fuente] ?? Wrench;
        return (
          <div key={g.fuente} className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/50">
              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> {g.etiqueta} <span className="font-normal normal-case text-white/35">· {g.herramientas.length}</span>
            </p>
            <div className="space-y-1">
              {g.herramientas.map((h) => (
                <HerramientaRow key={h.id} h={h} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default HerramientasLista;
