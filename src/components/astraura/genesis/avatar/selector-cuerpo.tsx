"use client";

/**
 * selector-cuerpo.tsx — `<SelectorCuerpoSer ser={...} avatarFuente={...}
 * onElegir={...} />`: las TRES vías del cuerpo de un ser, en una sola
 * interfaz (punto 3 del encargo).
 * ----------------------------------------------------------------------------
 * QUÉ HACE Y QUÉ NO HACE:
 *   · Procedural: vista previa en vivo del ADN (el mismo `AvatarAutonomo` de
 *     siempre) + un botón para adoptarlo. Sin red, no puede fallar.
 *   · En línea: un buscador (precargado por `componerConsultaAvatar`, pero
 *     editable) Y un botón "buscar automáticamente" que compone la consulta,
 *     busca y elige un candidato SIN que nadie escriba nada (punto 2 del
 *     encargo, "cuando quieran") — pero el resultado se enseña como
 *     PROPUESTA con su propia tarjeta "Usar este"/deséchala: nunca se aplica
 *     solo. Cada candidato enseña proveedor, licencia y atribución — nunca
 *     escondidos (regla dura de Alex).
 *   · Subido: una URL que la persona ya aloja en algún sitio. No hay
 *     pipeline de subida binaria en este alcance (ningún endpoint para
 *     ello en el contrato) — está documentado en el informe de esta tanda,
 *     no es un olvido.
 *
 * Este componente NO PERSISTE NADA por su cuenta: `onElegir` es la única
 * salida, y quien lo monte decide qué hacer con la elección (un PATCH al
 * ser, por ejemplo — genesis-client.ts, que no es mío). Así este fichero
 * sigue siendo válido tanto si quien lo llama guarda de inmediato como si
 * antes pide confirmación otra vez — la "propuesta revisable, no hecho
 * consumado" del encargo se cumple en DOS capas: la propia búsqueda
 * automática (candidato vs. confirmado) y esta frontera (`onElegir` vs.
 * lo que el padre decida hacer con ella).
 *
 * "EN UN CLIC, SIEMPRE": el botón para volver al procedural vive en la
 * barra superior, visible sea cual sea la pestaña activa — no hace falta
 * ni cambiar de pestaña para usarlo.
 */

import { useCallback, useState } from "react";
import { AlertTriangle, Check, Globe, RotateCcw, Search, Sparkles, UploadCloud, Wand2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FuenteAvatar } from "@/lib/astraura/genesis-types";
// Dos niveles arriba: `avatar/` → `genesis/` → `astraura/`, donde vive `s158/`
// (hermana de `genesis/`, no hija). Mismo módulo compartido que usa
// `genesis-shared.tsx`/`ser-ficha.tsx` — solo cambia la profundidad relativa
// porque este fichero vive un nivel más adentro, en `genesis/avatar/`.
import {
  BTN, BTN_PRIMARY, Badge, BusyIcon, CARD, Field, INPUT, LABEL, SUB, useBusy,
} from "../../s158/shared";
import { adnDeSer, type SerAdnInput } from "../genesis-logic";
import { AvatarAutonomo } from "./avatar-autonomo";
import {
  avatarFuenteProcedural,
  avatarFuenteSubido,
  componerConsultaAvatar,
  confirmarEleccionAvatar,
  elegirCandidatoDeterminista,
  type SemillaBusquedaAvatar,
} from "./avatar-busqueda-logica";
import { buscarAvataresEnLinea } from "./avatar-busqueda-cliente";

type Via = FuenteAvatar["modo"];

const ETIQUETA_VIA: Record<Via, string> = {
  procedural: "Procedural",
  enlinea: "En línea",
  subido: "Subido",
};

const ICONO_VIA: Record<Via, LucideIcon> = {
  procedural: Sparkles,
  enlinea: Globe,
  subido: UploadCloud,
};

export interface SelectorCuerpoSerProps {
  /** Lo mínimo del ser para derivar su ADN y componer su búsqueda. */
  ser: SerAdnInput & {
    rol?: string | null;
    personalidades?: { nombre: string }[];
  };
  /** Ausente = procedural, como siempre. */
  avatarFuente?: FuenteAvatar | null;
  /** Se llama SOLO al confirmar una elección real — nunca en cada preview. */
  onElegir: (fuente: FuenteAvatar) => void | Promise<void>;
  /** Mientras esté `true`, se deshabilita toda acción que cambie la elección (p. ej. el padre ya está guardando). */
  guardando?: boolean;
  className?: string;
}

/** Tarjeta de un candidato — proveedor, licencia y atribución SIEMPRE
 *  visibles como texto (nunca solo un color), y su botón de "usar este". */
function CandidatoTarjeta({
  candidato, nombre, destacado, busy, disabled, onUsar,
}: {
  candidato: FuenteAvatar;
  nombre: string;
  destacado?: boolean;
  busy: boolean;
  disabled?: boolean;
  onUsar: () => void;
}) {
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 p-2", destacado && "border-cyan-400/50 bg-cyan-500/[0.05]")}>
      <div className="aspect-square w-full overflow-hidden rounded-md bg-black/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- host arbitrario
            del proveedor de búsqueda; ver avatar-con-fuente.tsx para el porqué de fondo. */}
        <img
          src={candidato.url ?? ""}
          alt={candidato.atribucion ? `Candidato de avatar para ${nombre}: ${candidato.atribucion}` : `Candidato de avatar para ${nombre}`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
      <p className="truncate text-[10px] text-white/70" title={candidato.proveedor ?? undefined}>
        {candidato.proveedor ?? "Proveedor desconocido"}
      </p>
      <Badge tone="border-emerald-400/40 bg-emerald-500/15 text-emerald-100" className="w-fit">
        {candidato.licencia ?? "Sin licencia"}
      </Badge>
      {candidato.atribucion && (
        <p className="truncate text-[9px] text-white/45" title={candidato.atribucion}>
          {candidato.atribucion}
        </p>
      )}
      <button type="button" className={cn(BTN_PRIMARY, "justify-center")} disabled={disabled} onClick={onUsar}>
        <BusyIcon busy={busy} icon={Check} /> Usar este
      </button>
    </div>
  );
}

export function SelectorCuerpoSer({ ser, avatarFuente, onElegir, guardando = false, className }: SelectorCuerpoSerProps) {
  const [via, setVia] = useState<Via>(avatarFuente?.modo ?? "procedural");
  const [consulta, setConsulta] = useState(() =>
    componerConsultaAvatar(semillaBusquedaDesdeSer(ser)),
  );
  const [candidatos, setCandidatos] = useState<FuenteAvatar[]>([]);
  const [propuestaAutomatica, setPropuestaAutomatica] = useState<FuenteAvatar | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState<{ texto: string; sinConfigurar: boolean } | null>(null);
  const [huboBusqueda, setHuboBusqueda] = useState(false);
  const [urlSubida, setUrlSubida] = useState("");
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const { busy, wrap } = useBusy();

  const deshabilitado = guardando || busy !== "";
  const adn = adnDeSer(ser);

  const ejecutarBusqueda = useCallback(async (texto: string) => {
    setErrorBusqueda(null);
    setPropuestaAutomatica(null);
    const r = await buscarAvataresEnLinea(texto);
    setHuboBusqueda(true);
    if (!r.ok) {
      setCandidatos([]);
      setErrorBusqueda({ texto: r.error ?? "No se pudo buscar.", sinConfigurar: r.codigo === "no_configurado" });
      return [] as FuenteAvatar[];
    }
    setCandidatos(r.candidatos);
    return r.candidatos;
  }, []);

  const handleUsarProcedural = useCallback(async () => {
    await onElegir(avatarFuenteProcedural());
  }, [onElegir]);

  const handleBuscar = useCallback(async () => {
    await ejecutarBusqueda(consulta);
  }, [ejecutarBusqueda, consulta]);

  const handleBuscarAutomatico = useCallback(async () => {
    const compuesta = componerConsultaAvatar(semillaBusquedaDesdeSer(ser));
    setConsulta(compuesta);
    const resultado = await ejecutarBusqueda(compuesta);
    const elegido = elegirCandidatoDeterminista(resultado, ser.id);
    setPropuestaAutomatica(elegido);
  }, [ejecutarBusqueda, ser]);

  const handleUsarCandidato = useCallback(
    async (candidato: FuenteAvatar) => {
      await onElegir(confirmarEleccionAvatar(candidato));
    },
    [onElegir],
  );

  const handleUsarUrlSubida = useCallback(async () => {
    const fuente = avatarFuenteSubido(urlSubida);
    if (!fuente) {
      setErrorSubida("Esa URL no parece válida — pega un enlace http(s) completo a una imagen.");
      return;
    }
    setErrorSubida(null);
    await onElegir(fuente);
  }, [urlSubida, onElegir]);

  const IconoViaActual = ICONO_VIA[via];

  return (
    <div className={cn(CARD, "space-y-3 p-3", className)}>
      {/* Barra superior: estado actual + "volver al procedural en un clic, siempre". */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
        <p className="min-w-0 flex-1 text-[11px] text-white/70">
          Cuerpo actual: <strong className="text-white/90">{ETIQUETA_VIA[avatarFuente?.modo ?? "procedural"]}</strong>
          {avatarFuente?.modo === "enlinea" && (
            <span className="text-white/55"> · {avatarFuente.proveedor ?? "proveedor desconocido"} · {avatarFuente.licencia ?? "licencia no declarada"}</span>
          )}
        </p>
        {avatarFuente && avatarFuente.modo !== "procedural" && (
          <button
            type="button"
            className={BTN}
            disabled={deshabilitado}
            onClick={() => void wrap("volver-procedural", handleUsarProcedural)}
          >
            <BusyIcon busy={busy === "volver-procedural"} icon={RotateCcw} /> Volver al cuerpo procedural
          </button>
        )}
      </div>

      {/* Selector de vía. */}
      <div className="flex items-center gap-1.5" role="group" aria-label="Vía del cuerpo del ser">
        {(Object.keys(ETIQUETA_VIA) as Via[]).map((v) => {
          const Icono = ICONO_VIA[v];
          return (
            <button
              key={v}
              type="button"
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                v === via ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/25",
              )}
              aria-pressed={v === via}
              onClick={() => setVia(v)}
            >
              <Icono className="h-3.5 w-3.5" aria-hidden="true" />
              {ETIQUETA_VIA[v]}
            </button>
          );
        })}
      </div>

      {/* Pestaña: Procedural */}
      {via === "procedural" && (
        <div className="flex flex-col items-center gap-3 py-1 sm:flex-row">
          <AvatarAutonomo adn={adn} tamano={128} className="shrink-0" />
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <p className="text-[11px] leading-snug text-white/70">
              Vista previa en vivo del cuerpo derivado del ADN de {ser.nombre}: geometría, color y ritmo salen de
              quién es, sin red — así que nunca puede fallar.
            </p>
            <button
              type="button"
              className={BTN_PRIMARY}
              disabled={deshabilitado}
              onClick={() => void wrap("procedural", handleUsarProcedural)}
            >
              <BusyIcon busy={busy === "procedural"} icon={Sparkles} /> Usar cuerpo procedural
            </button>
          </div>
        </div>
      )}

      {/* Pestaña: En línea */}
      {via === "enlinea" && (
        <div className="space-y-3">
          <Field
            label="Qué buscar"
            hint="Se compone solo, a partir del nombre, la personalidad, el arquetipo y el rol del ser — edítalo si quieres afinarlo."
          >
            <div className="flex gap-1.5">
              <input
                className={cn(INPUT, "flex-1")}
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="p. ej. retrato geometría sagrada"
                disabled={deshabilitado}
              />
              <button
                type="button"
                className={BTN}
                disabled={deshabilitado || !consulta.trim()}
                onClick={() => void wrap("buscar", handleBuscar)}
              >
                <BusyIcon busy={busy === "buscar"} icon={Search} /> Buscar
              </button>
            </div>
          </Field>

          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={deshabilitado}
            onClick={() => void wrap("auto", handleBuscarAutomatico)}
          >
            <BusyIcon busy={busy === "auto"} icon={Wand2} /> Buscar automáticamente (sin escribir nada)
          </button>

          {errorBusqueda && (
            <div className={cn(SUB, "flex items-start gap-2 px-3 py-2")} role="alert">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
              <div className="min-w-0 space-y-1.5">
                <p className="text-[11px] leading-snug text-amber-100">{errorBusqueda.texto}</p>
                {errorBusqueda.sinConfigurar && (
                  <button
                    type="button"
                    className={BTN}
                    disabled={deshabilitado}
                    onClick={() => void wrap("procedural", handleUsarProcedural)}
                  >
                    <Sparkles className="h-3 w-3" aria-hidden="true" /> Usar el cuerpo procedural ahora
                  </button>
                )}
              </div>
            </div>
          )}

          {propuestaAutomatica && (
            <div className="space-y-1.5">
              <p className={LABEL}>Propuesta automática — revísala antes de usarla</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <CandidatoTarjeta
                  candidato={propuestaAutomatica}
                  nombre={ser.nombre}
                  destacado
                  busy={busy === "usar-auto"}
                  disabled={deshabilitado}
                  onUsar={() => void wrap("usar-auto", () => handleUsarCandidato(propuestaAutomatica))}
                />
              </div>
            </div>
          )}

          {candidatos.length > 0 && (
            <div className="space-y-1.5">
              {propuestaAutomatica && <p className={LABEL}>Todos los candidatos</p>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {candidatos.map((c, i) => (
                  <CandidatoTarjeta
                    key={`${c.url ?? "sin-url"}-${i}`}
                    candidato={c}
                    nombre={ser.nombre}
                    busy={busy === `usar-${i}`}
                    disabled={deshabilitado}
                    onUsar={() => void wrap(`usar-${i}`, () => handleUsarCandidato(c))}
                  />
                ))}
              </div>
            </div>
          )}

          {huboBusqueda && !errorBusqueda && candidatos.length === 0 && (
            <p className="text-[11px] text-white/55">
              Sin candidatos con licencia libre para esta búsqueda. Prueba otra descripción, o usa el cuerpo procedural.
            </p>
          )}
        </div>
      )}

      {/* Pestaña: Subido */}
      {via === "subido" && (
        <div className="space-y-2">
          <Field
            label="URL de una imagen que ya tengas"
            hint="Pega el enlace de una imagen que ya alojas en algún sitio (tu propia bóveda, otro host tuyo…). No sube ningún archivo nuevo, y por ser tuya no lleva una licencia que declarar."
          >
            <input
              className={INPUT}
              value={urlSubida}
              onChange={(e) => {
                setUrlSubida(e.target.value);
                setErrorSubida(null);
              }}
              placeholder="https://…"
              disabled={deshabilitado}
            />
          </Field>
          {errorSubida && (
            <p className="text-[11px] text-rose-200/85" role="alert">
              {errorSubida}
            </p>
          )}
          {urlSubida.trim() && !errorSubida && (
            <div className="h-14 w-14 overflow-hidden rounded-full bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element -- vista previa de una URL arbitraria que la persona acaba de pegar. */}
              <img
                src={urlSubida.trim()}
                alt={`Vista previa de la imagen para ${ser.nombre}`}
                className="h-full w-full object-cover"
                onError={() => setErrorSubida("Esa URL no cargó una imagen — revisa el enlace.")}
              />
            </div>
          )}
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={deshabilitado || !urlSubida.trim()}
            onClick={() => void wrap("subido", handleUsarUrlSubida)}
          >
            <BusyIcon busy={busy === "subido"} icon={IconoViaActual} /> Usar esta imagen
          </button>
        </div>
      )}
    </div>
  );
}

/** Adapta el `ser` que recibe este componente a `SemillaBusquedaAvatar` — la
 *  personalidad "dominante" es, a falta de más contrato, la primera
 *  asignada; el arquetipo no vive en `Ser` (ver `avatar-busqueda-logica.ts`),
 *  así que aquí SIEMPRE se pasa `solido` (ya derivado del ADN) como su
 *  sustituto real. */
function semillaBusquedaDesdeSer(ser: SelectorCuerpoSerProps["ser"]): SemillaBusquedaAvatar {
  return {
    nombre: ser.nombre,
    rol: ser.rol ?? null,
    personalidadNombre: ser.personalidades?.[0]?.nombre ?? null,
    arquetipo: null,
    solido: adnDeSer(ser).solido,
  };
}

export default SelectorCuerpoSer;
