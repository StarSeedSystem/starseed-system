"use client";
/**
 * Perfil del agente en la red (Ola 1025U · U3). La ficha del agente (U2) lo monta en su pestaña «Perfil y red».
 *
 * Cada agente de IA puede tener su propio perfil, como una persona: dispositivos virtuales sin límite fijo
 * (pantalla, móvil, tableta, VR o AR) con su propia disposición del OS, y una de dos visibilidades:
 *   · solo privado — no publica ni comenta en la red;
 *   · vinculado    — se vincula con la red SOLO en los grupos, comunidades y páginas reales que la persona elige.
 * Todo lo que publique o comente lleva siempre la etiqueta «Bot de IA» (no se puede quitar) y se le puede bloquear.
 *
 * Props del contrato intactas: `{ agente }`. `PerfilAgenteRedVista` es la misma pantalla con los servicios
 * (entidades reales, escritorios) inyectables para las pruebas.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Ban, Glasses, Globe, Headset, Link2, Lock, Monitor, Plus, ShieldCheck, Smartphone, Tablet, Trash2, Undo2, X,
  type LucideIcon,
} from "lucide-react";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { bloquearBot, desbloquearBot } from "@/lib/agentes-red/bloqueo-bots";
import { marcaDeAgente } from "@/lib/agentes-red/marca-bot";
import {
  ETIQUETA_DISPOSITIVO, TIPOS_DISPOSITIVO, TIPOS_ENTIDAD_RED, actualizarPerfilAgente, agregarDispositivo, claveEntidad,
  desvincular, fijarDisposicion, fijarVisibilidad, idDispositivoNuevo, quitarDispositivo, renombrarDispositivo, vincular,
  type EntidadRed, type TipoDispositivo, type TipoEntidadRed, type VisibilidadAgente,
} from "@/lib/agentes-red/perfil-agente";
import { useReglasBloqueoBots, usePerfilAgenteRed } from "@/lib/agentes-red/use-agentes-red";
import { cn } from "@/lib/utils";
import { EtiquetaBotIA } from "./etiqueta-bot-ia";

/* ── Servicios (entidades y escritorios reales) ──────────────────────────── */

export interface ServiciosPerfilRed {
  /** Grupos, comunidades y páginas que la persona tiene en el OS. */
  listarEntidades: () => Promise<EntidadRed[]>;
  /** Comprueba que existe de verdad (nunca se vincula un id inventado). */
  comprobarEntidad: (tipo: TipoEntidadRed, id: string) => Promise<EntidadRed | null>;
  /** Escritorios de la persona, que un dispositivo del agente puede usar como disposición de su OS. */
  listarEscritorios: () => Promise<{ id: string; nombre: string }[]>;
}

const ETIQUETA_ENTIDAD: Record<TipoEntidadRed, string> = { grupo: "Grupo", comunidad: "Comunidad", pagina: "Página" };

const SERVICIOS_REALES: ServiciosPerfilRed = {
  async listarEntidades() {
    const { fetchMyEntities } = await import("@/lib/os-social");
    const { entidadDeOs } = await import("@/lib/agentes-red/perfil-agente");
    const { pages, groups } = await fetchMyEntities();
    return [
      ...groups.map((g) => entidadDeOs("group", g.slug, undefined, g.name)),
      ...pages.map((p) => entidadDeOs("page", p.slug, p.kind, p.name)),
    ].filter((e): e is EntidadRed => e !== null);
  },
  async comprobarEntidad(tipo, id) {
    const { fetchGroupBySlug, fetchPageBySlug } = await import("@/lib/os-social");
    const { entidadDeOs } = await import("@/lib/agentes-red/perfil-agente");
    if (tipo === "grupo") {
      const g = await fetchGroupBySlug(id);
      return g ? entidadDeOs("group", g.slug, undefined, g.name) : null;
    }
    const p = await fetchPageBySlug(id);
    if (!p) return null;
    const real = entidadDeOs("page", p.slug, p.kind, p.name);
    return real && real.tipo === tipo ? real : null;
  },
  async listarEscritorios() {
    const { readDesktopsSnapshot } = await import("@/components/desktop/desktop-store");
    return readDesktopsSnapshot().desktops.map((d) => ({ id: d.id, nombre: d.name }));
  },
};

/* ── Piezas ──────────────────────────────────────────────────────────────── */

const ICONO_DISPOSITIVO: Record<TipoDispositivo, LucideIcon> = {
  pantalla: Monitor, movil: Smartphone, tableta: Tablet, vr: Headset, ar: Glasses,
};

const caja = "rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-xl sm:p-4";
const campo =
  "h-11 min-w-0 rounded-xl border border-white/15 bg-black/30 px-3 text-base text-white placeholder:text-white/35 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70";
const boton =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 px-3 text-sm font-medium " +
  "text-white/85 transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70";

function Seccion({ titulo, icono: Icono, children }: { titulo: string; icono: LucideIcon; children: React.ReactNode }) {
  return (
    <section className={caja}>
      <h3 className="mb-2 flex items-center gap-2 font-headline text-base font-semibold text-white">
        <Icono className="size-4 text-sky-300" aria-hidden="true" /> {titulo}
      </h3>
      {children}
    </section>
  );
}

const VISIBILIDADES_UI: { valor: VisibilidadAgente; titulo: string; detalle: string; icono: LucideIcon }[] = [
  { valor: "privado", titulo: "Solo privado", detalle: "Se queda en espacios privados: no publica ni comenta en la red.", icono: Lock },
  { valor: "vinculado", titulo: "Vinculado a la red", detalle: "Publica y comenta solo en los grupos, comunidades y páginas que elijas abajo.", icono: Globe },
];

/* ── Pantalla ────────────────────────────────────────────────────────────── */

export function PerfilAgenteRedVista({
  agente, servicios = SERVICIOS_REALES,
}: { agente: AgenteMundoRef; servicios?: ServiciosPerfilRed }) {
  const perfil = usePerfilAgenteRed(agente.id);
  const reglas = useReglasBloqueoBots();
  const marca = marcaDeAgente(agente);
  const bloqueado = Boolean(reglas.bots[marca.agenteId]);
  const editar = useCallback(
    (cambiar: Parameters<typeof actualizarPerfilAgente>[1]) => { actualizarPerfilAgente(agente, cambiar); },
    [agente],
  );

  /* Escritorios reales para la disposición del OS. */
  const [escritorios, setEscritorios] = useState<{ id: string; nombre: string }[] | null>(null);
  useEffect(() => {
    let vivo = true;
    servicios.listarEscritorios().then((l) => vivo && setEscritorios(l)).catch(() => vivo && setEscritorios([]));
    return () => { vivo = false; };
  }, [servicios]);

  /* Entidades reales para vincular. */
  const [candidatas, setCandidatas] = useState<EntidadRed[] | null>(null);
  const [errorEntidades, setErrorEntidades] = useState<string | null>(null);
  const [cargandoEntidades, setCargandoEntidades] = useState(false);
  const [tipoPorId, setTipoPorId] = useState<TipoEntidadRed>("grupo");
  const [idManual, setIdManual] = useState("");
  const [avisoVinculo, setAvisoVinculo] = useState<string | null>(null);

  const cargarEntidades = async () => {
    setCargandoEntidades(true);
    setErrorEntidades(null);
    try {
      setCandidatas(await servicios.listarEntidades());
    } catch {
      setCandidatas([]);
      setErrorEntidades("No pude leer tus grupos, comunidades y páginas (sin sesión o sin red).");
    } finally {
      setCargandoEntidades(false);
    }
  };

  const vincularPorId = async () => {
    const id = idManual.trim();
    if (!id) return;
    setAvisoVinculo(null);
    try {
      const real = await servicios.comprobarEntidad(tipoPorId, id);
      if (!real) {
        setAvisoVinculo(`No existe ${tipoPorId === "grupo" ? "un grupo" : tipoPorId === "comunidad" ? "una comunidad" : "una página"} con el id «${id}».`);
        return;
      }
      editar((p, ahora) => vincular(p, real, ahora));
      setIdManual("");
      setAvisoVinculo(`Vinculado a «${real.nombre ?? real.id}».`);
    } catch {
      setAvisoVinculo("No pude comprobarlo (sin sesión o sin red). No se vinculó nada.");
    }
  };

  /* Dispositivo nuevo. */
  const [tipoNuevo, setTipoNuevo] = useState<TipoDispositivo>("pantalla");
  const [nombreNuevo, setNombreNuevo] = useState("");

  const sinVincular = (candidatas ?? []).filter((c) => !perfil.vinculos.some((v) => claveEntidad(v) === claveEntidad(c)));

  return (
    <section aria-label={`Perfil en la red de ${agente.nombre}`} data-testid="perfil-agente-red" className="space-y-3 text-white/85">
      {/* Cabecera: la etiqueta de bot no es opcional. */}
      <header className={caja}>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate font-headline text-lg font-semibold text-white">{agente.nombre}</h2>
          <EtiquetaBotIA tamano="md" />
        </div>
        <p className="mt-1 text-xs text-white/60">
          Es un agente de IA con perfil propio. Todo lo que publique o comente en la red llevará siempre la etiqueta
          «Bot de IA» y cualquier persona podrá bloquearlo.
        </p>
      </header>

      <Seccion titulo="Visibilidad" icono={ShieldCheck}>
        <div role="radiogroup" aria-label="Visibilidad del perfil del agente" className="grid gap-2 sm:grid-cols-2">
          {VISIBILIDADES_UI.map((v) => {
            const activa = perfil.visibilidad === v.valor;
            return (
              <button
                key={v.valor}
                type="button"
                role="radio"
                aria-checked={activa}
                onClick={() => editar((p, ahora) => fijarVisibilidad(p, v.valor, ahora))}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-200",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70",
                  activa ? "border-[#007FFF]/60 bg-[#007FFF]/15" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]",
                )}
              >
                <v.icono className="mt-0.5 size-4 shrink-0 text-sky-300" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-white">{v.titulo}</span>
                  <span className="block text-xs text-white/60">{v.detalle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Seccion>

      <Seccion titulo="Dónde está vinculado" icono={Link2}>
        {perfil.visibilidad !== "vinculado" && (
          <p className="mb-2 text-xs text-white/60" data-testid="aviso-privado">
            Mientras sea solo privado no publica ni comenta en ningún sitio, aunque haya vínculos guardados.
          </p>
        )}
        {perfil.vinculos.length === 0 ? (
          <p className="mb-2 text-xs text-white/55">Aún no está vinculado a ningún grupo, comunidad ni página.</p>
        ) : (
          <ul className="mb-3 space-y-1.5" aria-label="Vínculos del agente">
            {perfil.vinculos.map((v) => (
              <li key={claveEntidad(v)} className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1">
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">{ETIQUETA_ENTIDAD[v.tipo]}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{v.nombre ?? v.id}</span>
                <button
                  type="button"
                  aria-label={`Quitar el vínculo con ${v.nombre ?? v.id}`}
                  onClick={() => editar((p, ahora) => desvincular(p, v, ahora))}
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/55 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className={boton} onClick={() => void cargarEntidades()} disabled={cargandoEntidades}>
          <Plus className="size-4" aria-hidden="true" />
          {cargandoEntidades ? "Leyendo tus entidades…" : "Elegir de mis grupos, comunidades y páginas"}
        </button>
        {errorEntidades && <p role="alert" className="mt-2 text-xs text-amber-300">{errorEntidades}</p>}
        {candidatas && !errorEntidades && (
          sinVincular.length === 0 ? (
            <p className="mt-2 text-xs text-white/55">
              {candidatas.length === 0 ? "No tienes grupos, comunidades ni páginas propias todavía." : "Ya está vinculado a todas las tuyas."}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5" aria-label="Entidades que puedes vincular">
              {sinVincular.map((c) => (
                <li key={claveEntidad(c)}>
                  <button
                    type="button"
                    className={cn(boton, "w-full justify-start")}
                    aria-label={`Vincular con ${c.nombre ?? c.id}`}
                    onClick={() => editar((p, ahora) => vincular(p, c, ahora))}
                  >
                    <Plus className="size-4 shrink-0" aria-hidden="true" />
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{ETIQUETA_ENTIDAD[c.tipo]}</span>
                    <span className="min-w-0 truncate">{c.nombre ?? c.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}

        <div className="mt-3 border-t border-white/10 pt-3">
          <p className="mb-2 text-xs text-white/60">O vincúlalo por id, si ya existe (se comprueba antes de guardarlo).</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select aria-label="Tipo de entidad" value={tipoPorId} onChange={(e) => setTipoPorId(e.target.value as TipoEntidadRed)} className={cn(campo, "sm:w-40")}>
              {TIPOS_ENTIDAD_RED.map((t) => <option key={t} value={t}>{ETIQUETA_ENTIDAD[t]}</option>)}
            </select>
            <input
              aria-label="Id de la entidad"
              value={idManual}
              onChange={(e) => setIdManual(e.target.value)}
              placeholder="id (por ejemplo, el de su dirección)"
              className={cn(campo, "flex-1")}
            />
            <button type="button" className={boton} onClick={() => void vincularPorId()} disabled={!idManual.trim()}>
              Comprobar y vincular
            </button>
          </div>
          {avisoVinculo && <p role="status" className="mt-2 text-xs text-white/70">{avisoVinculo}</p>}
        </div>
      </Seccion>

      <Seccion titulo={`Dispositivos virtuales (${perfil.dispositivos.length})`} icono={Monitor}>
        <p className="mb-2 text-xs text-white/60">
          Puede tener los que quiera, como cualquier persona. La disposición de su OS es una referencia a uno de tus
          escritorios: no se copia nada.
        </p>
        {perfil.dispositivos.length === 0 ? (
          <p className="mb-2 text-xs text-white/55">Aún no tiene dispositivos virtuales.</p>
        ) : (
          <ul className="mb-3 space-y-2" aria-label="Dispositivos virtuales">
            {perfil.dispositivos.map((d) => {
              const Icono = ICONO_DISPOSITIVO[d.tipo];
              const falta = d.disposicion && !(escritorios ?? []).some((e) => e.id === d.disposicion!.ref);
              return (
                <li key={d.id} className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-2" data-testid="dispositivo-virtual">
                  <div className="flex items-center gap-2">
                    <Icono className="size-4 shrink-0 text-sky-300" aria-label={ETIQUETA_DISPOSITIVO[d.tipo]} role="img" />
                    <input
                      aria-label={`Nombre del dispositivo ${d.nombre}`}
                      defaultValue={d.nombre}
                      key={d.nombre}
                      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== d.nombre) editar((p, ahora) => renombrarDispositivo(p, d.id, e.target.value, ahora)); }}
                      className={cn(campo, "flex-1")}
                    />
                    <button
                      type="button"
                      aria-label={`Quitar el dispositivo ${d.nombre}`}
                      onClick={() => editar((p, ahora) => quitarDispositivo(p, d.id, ahora))}
                      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/55 transition-colors duration-200 hover:bg-white/10 hover:text-[#DC143C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <label className="block text-xs text-white/60">
                    Disposición del OS
                    <select
                      aria-label={`Disposición del OS de ${d.nombre}`}
                      value={d.disposicion?.ref ?? ""}
                      disabled={escritorios === null || (escritorios.length === 0 && !d.disposicion)}
                      onChange={(e) => {
                        const ref = e.target.value;
                        const esc = (escritorios ?? []).find((x) => x.id === ref);
                        editar((p, ahora) => fijarDisposicion(p, d.id, esc ? { tipo: "escritorio", ref: esc.id, nombre: esc.nombre } : null, ahora));
                      }}
                      className={cn(campo, "mt-1 w-full")}
                    >
                      <option value="">Sin asignar (OS por defecto)</option>
                      {falta && d.disposicion && <option value={d.disposicion.ref}>{d.disposicion.nombre ?? d.disposicion.ref} (ya no existe)</option>}
                      {(escritorios ?? []).map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </label>
                  {escritorios !== null && escritorios.length === 0 && !d.disposicion && (
                    <p className="text-[11px] text-white/45">Aún no tienes escritorios a los que apuntar.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          <select aria-label="Tipo de dispositivo" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as TipoDispositivo)} className={cn(campo, "sm:w-52")}>
            {TIPOS_DISPOSITIVO.map((t) => <option key={t} value={t}>{ETIQUETA_DISPOSITIVO[t]}</option>)}
          </select>
          <input aria-label="Nombre del dispositivo nuevo" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} placeholder="Nombre (opcional)" className={cn(campo, "flex-1")} />
          <button
            type="button"
            className={boton}
            onClick={() => {
              editar((p, ahora) => agregarDispositivo(p, { tipo: tipoNuevo, nombre: nombreNuevo }, idDispositivoNuevo(), ahora));
              setNombreNuevo("");
            }}
          >
            <Plus className="size-4" aria-hidden="true" /> Añadir dispositivo
          </button>
        </div>
      </Seccion>

      <Seccion titulo="Bloqueo" icono={Ban}>
        <p className="mb-2 text-xs text-white/60">
          Bloquear a este agente es solo tuyo: dejas de ver lo que publica o comenta, y los demás lo siguen viendo.
        </p>
        {bloqueado ? (
          <button type="button" className={boton} onClick={() => desbloquearBot(marca.agenteId)}>
            <Undo2 className="size-4" aria-hidden="true" /> Desbloquear a {agente.nombre}
          </button>
        ) : (
          <button type="button" className={boton} onClick={() => bloquearBot(marca)}>
            <Ban className="size-4 text-[#DC143C]" aria-hidden="true" /> Bloquear a {agente.nombre}
          </button>
        )}
      </Seccion>
    </section>
  );
}

export interface PerfilAgenteRedProps {
  agente: AgenteMundoRef;
}

export function PerfilAgenteRed({ agente }: PerfilAgenteRedProps) {
  return <PerfilAgenteRedVista agente={agente} />;
}
