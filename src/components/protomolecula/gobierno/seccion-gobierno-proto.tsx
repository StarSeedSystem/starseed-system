"use client";

/**
 * «Protomolécula del grupo / de la comunidad / de la página» (Ola 1026P · P2): la sección de los ajustes de la entidad
 * donde se decide quién ve, abre y cambia su Protomolécula, y cómo se decide cada tipo de cambio.
 *
 * Cambiar estas reglas sigue SU PROPIA regla (por defecto, votación): según el veredicto de `decidirCambio` el botón
 * guarda (rol suficiente), propone (decide quien gestiona) o lleva el cambio a votación con el compositor de
 * propuestas de siempre. Nada de aquí permite quitar la transparencia ni que una IA apruebe sola.
 * SOP: `architecture/protomolecula-gobierno.md`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Globe, Lock, Save, ShieldCheck, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ProposalComposer from "@/components/governance/proposal-composer";
import { GlassCard } from "@/components/ui/glass-card";
import {
  borradorDeCambio, veredictoMasEstricto, veredictosPara, type EntornoGobierno, type VeredictoDetallado,
} from "@/lib/protomolecula/gobierno/decision";
import { SERVICIOS_POR_DEFECTO, type ServiciosGobierno } from "@/lib/protomolecula/gobierno/entorno";
import {
  AYUDA_MODO, AYUDA_TIPO, AYUDA_VISIBILIDAD, ARTICULO_ENTIDAD, ETIQUETA_MODO, ETIQUETA_NIVEL, ETIQUETA_TIPO, ETIQUETA_VISIBILIDAD, MODOS_CAMBIO, NIVELES_ACCESO,
  TIPOS_SIN_PROPUESTA, VISIBILIDADES, acotarAcceso, describirCambios, reglasPorDefecto, scopeDeEntidad, serializarReglas, tiposTocados, tipoEntidadDeKind, valorNivel,
  type ModoCambio, type NivelAcceso, type ReglasProtomolecula, type VisibilidadProto,
} from "@/lib/protomolecula/gobierno/reglas";
import { TIPOS_CAMBIO_PROTO, type ContextoProto, type TipoCambioProto } from "@/lib/protomolecula/peticion/contrato";
import { CLASE_BOTON, CLASE_CONTROL, COLOR_DECISION, ETIQUETA_DECISION, ICONO_DECISION, ICONO_TIPO } from "./etiquetas-gobierno";
import { PermisosDirectos } from "./permisos-directos";
import { RegistroUsos } from "./registro-usos";
import { useGobiernoProto } from "./use-gobierno-proto";

const ICONO_VISIBILIDAD: Record<VisibilidadProto, typeof Lock> = { privada: Lock, miembros: Users, publica: Globe };

export interface PropsSeccionGobiernoProto {
  /** El `kind` de la pantalla de entidad (comunidad, ef, partido, grupo, page…). */
  kind: string;
  /** Slug de la entidad: el mismo `scopeRef` del motor de gobernanza. */
  slug: string;
  name?: string;
  accent?: string;
  servicios?: Partial<ServiciosGobierno>;
  /** Reloj, para las pruebas. */
  ahora?: number;
}

type Estado = { tipo: "info" | "aviso" | "error"; texto: string } | null;

export function SeccionGobiernoProto({ kind, slug, name, accent, servicios, ahora }: PropsSeccionGobiernoProto) {
  const tipoEntidad = tipoEntidadDeKind(kind);
  const contexto = useMemo<ContextoProto>(
    () => ({ ruta: "", ambito: "grupo", gobernadaPor: { tipo: tipoEntidad, id: slug, ...(name ? { nombre: name } : {}) } }),
    [tipoEntidad, slug, name],
  );
  const g = useGobiernoProto(contexto, servicios);
  const svc = useMemo<ServiciosGobierno>(() => ({ ...SERVICIOS_POR_DEFECTO, ...servicios }), [servicios]);
  const reloj = ahora ?? Date.now();

  const base = useMemo<ReglasProtomolecula>(() => g.reglasGuardadas ?? reglasPorDefecto(tipoEntidad, g.modoGobierno), [g.reglasGuardadas, tipoEntidad, g.modoGobierno]);
  const [borrador, setBorrador] = useState<ReglasProtomolecula | null>(null);
  const actual = borrador ?? base;
  const [estado, setEstado] = useState<Estado>(null);
  const [ocupado, setOcupado] = useState(false);
  const [composer, setComposer] = useState<VeredictoDetallado | null>(null);

  // Si las reglas guardadas cambian por fuera (otra pestaña, una votación aprobada), el borrador sin tocar las sigue.
  useEffect(() => {
    setBorrador((b) => (b && tiposTocados(base, b).length === 0 ? null : b));
  }, [base]);

  const cambiar = (n: ReglasProtomolecula) => {
    setEstado(null);
    setBorrador(tiposTocados(base, n).length === 0 ? null : n);
  };

  const tocados = useMemo(() => tiposTocados(base, actual), [base, actual]);
  const sucio = tocados.length > 0;
  const cambios = useMemo(() => describirCambios(base, actual), [base, actual]);
  const valor = useMemo(() => serializarReglas(actual), [actual]);
  const resumen = cambios.join(" ");
  const cambioParaBorrador = useMemo<EntornoGobierno["cambio"]>(() => ({ resumen, valor }), [resumen, valor]);

  // El veredicto de guardar: el más estricto de los tipos que toca el cambio. Sin cambios, el de «reglas» para informar.
  const veredictos = tocados.map((t) => g.decidir(t, "humano", cambioParaBorrador));
  const regla = g.decidir("reglas", "humano", cambioParaBorrador);
  const veredicto = veredictoMasEstricto(veredictos) ?? regla;

  // Lo que pasaría con ESTAS reglas para ti (vista previa en la tabla).
  const paraTi = veredictosPara(contexto, g.actor("humano"), { ...g.entorno, reglas: actual, ahora: reloj });

  const miembroQuePuedeEditar = !g.cargando && g.persona?.sesion === true && regla.decision !== "denegar";
  const titulo = `Protomolécula ${ARTICULO_ENTIDAD[tipoEntidad]}`;
  const color = accent ?? "#10B981";

  const guardar = async () => {
    if (!g.entidad) return;
    setOcupado(true);
    setEstado(null);
    try {
      const r = await svc.guardar(g.entidad, actual, g.persona?.usuarioId ?? null);
      if (!r.ok) {
        if (r.bloqueado) {
          setEstado({ tipo: "aviso", texto: `${r.motivo} Puedes llevarlo a votación.` });
          setComposer({ ...regla, decision: "votar", propuesta: borradorDeCambio(g.entidad, "reglas", "votacion", { ...g.entorno, cambio: cambioParaBorrador }) });
        } else setEstado({ tipo: "error", texto: r.motivo });
        return;
      }
      setBorrador(null);
      setEstado(r.donde === "cuenta" ? { tipo: "info", texto: "Guardado en la cuenta de la entidad. Todas las personas lo ven." } : { tipo: "aviso", texto: r.aviso ?? "Guardado solo en este aparato." });
    } catch (e) {
      setEstado({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setOcupado(false);
    }
  };

  const accion = () => {
    if (!sucio) return;
    if (veredicto.decision === "aplicar") void guardar();
    else if (veredicto.decision === "proponer" || veredicto.decision === "votar") setComposer(veredicto);
  };

  const entidadActual = g.entidad;
  const personasDe = svc.personas;
  const cargarPersonas = useCallback(() => (entidadActual ? personasDe(entidadActual) : Promise.resolve([])), [entidadActual, personasDe]);

  const textoBoton =
    veredicto.decision === "aplicar" ? "Guardar cambios" : veredicto.decision === "proponer" ? "Proponer el cambio" : veredicto.decision === "votar" ? "Llevar a votación" : "Sin permiso para cambiarlo";

  if (!g.entidad) return null;
  const composerInicial = composer?.propuesta
    ? { title: composer.propuesta.title, description: composer.propuesta.description, command: { type: composer.propuesta.command.type, payload: { ...composer.propuesta.command.payload, ...composer.propuesta.payload } } }
    : undefined;

  return (
    <GlassCard className="space-y-4 p-[clamp(1rem,2.5vw,1.5rem)]" data-testid="seccion-gobierno-proto" aria-label={titulo}>
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 font-headline text-base font-semibold leading-tight" style={{ color }}>
          <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden /> {titulo}
        </h3>
        <p className="text-xs text-muted-foreground">
          Quién ve y abre la Protomolécula {ARTICULO_ENTIDAD[tipoEntidad]}, y cómo se decide cada cambio. Primero la democracia; y lo personal siempre es de su dueña o dueño.
        </p>
        <p className="text-[11px] text-white/55" data-testid="origen-reglas">
          {g.cargando
            ? "Leyendo las reglas de la entidad…"
            : g.origen === "cuenta"
              ? `Reglas guardadas en la cuenta de la entidad · gobierno ${g.modoGobierno === "hierarchical" ? "jerárquico" : "democrático"}.`
              : g.origen === "aparato"
                ? "Reglas guardadas SOLO en este aparato: las demás personas aún no las ven."
                : `Esta entidad aún no ha guardado reglas propias: rigen las del OS (democrático primero) · gobierno ${g.modoGobierno === "hierarchical" ? "jerárquico" : "democrático"}.`}
        </p>
      </header>

      {!g.cargando && !miembroQuePuedeEditar ? (
        <p className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-white/70" role="note" data-testid="solo-lectura">
          {g.persona?.sesion ? regla.motivo : "Inicia sesión para proponer cambios."} Aquí puedes ver cómo se decide cada cosa.
        </p>
      ) : null}

      {/* Visibilidad */}
      <section aria-label="Visibilidad" className="space-y-2">
        <h4 className="text-sm font-semibold text-white/90">Visibilidad</h4>
        <div role="radiogroup" aria-label="Visibilidad de la Protomolécula" className="grid gap-2 sm:grid-cols-3">
          {VISIBILIDADES.map((v) => {
            const Icono = ICONO_VISIBILIDAD[v];
            const puesta = actual.visibilidad === v;
            return (
              <button
                key={v} type="button" role="radio" aria-checked={puesta} disabled={!miembroQuePuedeEditar}
                onClick={() => cambiar({ ...actual, visibilidad: v, acceso: acotarAcceso(v, actual.acceso) })}
                className={`${CLASE_BOTON} h-auto flex-col items-start justify-start gap-0.5 py-2 text-left ${puesta ? "border-cyan-300/60 bg-cyan-500/10" : ""}`}
              >
                <span className="flex items-center gap-1.5 text-sm"><Icono className="h-4 w-4" aria-hidden /> {ETIQUETA_VISIBILIDAD[v]}</span>
                <span className="text-[11px] font-normal text-white/60">{AYUDA_VISIBILIDAD[v]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Acceso */}
      <section aria-label="Acceso" className="grid gap-2 sm:grid-cols-2">
        {(["abrir", "usar"] as const).map((que) => {
          const piso = que === "abrir" ? valorNivel(acotarAcceso(actual.visibilidad, { abrir: "cualquiera", usar: "cualquiera" }).abrir) : valorNivel(actual.acceso.abrir);
          const opciones = NIVELES_ACCESO.filter((n) => valorNivel(n) >= piso);
          return (
            <label key={que} className="space-y-1 text-xs text-white/70">
              {que === "abrir" ? "Quién puede abrirla" : "Quién puede usarla"}
              <select
                className={`${CLASE_CONTROL} w-full`} value={actual.acceso[que]} disabled={!miembroQuePuedeEditar}
                onChange={(e) => cambiar({ ...actual, acceso: acotarAcceso(actual.visibilidad, { ...actual.acceso, [que]: e.target.value as NivelAcceso }) })}
              >
                {opciones.map((n) => (
                  <option key={n} value={n}>{ETIQUETA_NIVEL[n]}</option>
                ))}
              </select>
            </label>
          );
        })}
      </section>

      {/* Tipos de cambio × modo */}
      <section aria-label="Cómo se decide cada cambio" className="space-y-2">
        <h4 className="text-sm font-semibold text-white/90">Cómo se decide cada cambio</h4>
        <ul className="space-y-2">
          {TIPOS_CAMBIO_PROTO.map((t: TipoCambioProto) => {
            const Icono = ICONO_TIPO[t];
            const modos = MODOS_CAMBIO.filter((m) => !(m === "propuesta" && (TIPOS_SIN_PROPUESTA as readonly string[]).includes(t)));
            const v = paraTi[t];
            const IconoDecision = ICONO_DECISION[v.decision];
            return (
              <li key={t} className="grid items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5 sm:grid-cols-[1fr_auto_auto]" data-testid={`fila-${t}`}>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm text-white/90"><Icono className="h-4 w-4 shrink-0 text-white/70" aria-hidden /> {ETIQUETA_TIPO[t]}</p>
                  <p className="text-[11px] text-white/55">{AYUDA_TIPO[t]}</p>
                </div>
                <select
                  aria-label={`Modo para ${ETIQUETA_TIPO[t].toLowerCase()}`} className={`${CLASE_CONTROL} w-full sm:w-40`}
                  value={actual.cambios[t]} disabled={!miembroQuePuedeEditar} title={AYUDA_MODO[actual.cambios[t]]}
                  onChange={(e) => cambiar({ ...actual, cambios: { ...actual.cambios, [t]: e.target.value as ModoCambio } })}
                >
                  {modos.map((m) => (
                    <option key={m} value={m}>{ETIQUETA_MODO[m]}</option>
                  ))}
                </select>
                <span
                  className={`inline-flex min-h-8 items-center gap-1 justify-self-start rounded-full border px-2.5 text-[11px] sm:justify-self-end ${COLOR_DECISION[v.decision]}`}
                  title={v.motivo} data-testid={`parati-${t}`}
                >
                  <IconoDecision className="h-3.5 w-3.5" aria-hidden /> {ETIQUETA_DECISION[v.decision]}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-white/50">
          Directo: lo aplica quien tenga rol suficiente. Propuesta: cualquiera propone y decide quien gestiona. Votación: en democracia, con el umbral y el quórum de la entidad. Las reglas y los permisos
          solo admiten directo o votación. «Para ti» dice qué pasaría con tu rol.
        </p>
      </section>

      <PermisosDirectos
        reglas={actual} onCambiar={cambiar} concedidoPor={g.persona?.usuarioId ?? null} editable={miembroQuePuedeEditar} ahora={reloj}
        cargarPersonas={cargarPersonas}
      />

      <RegistroUsos entidad={g.entidad} version={g.version} />

      {/* Guardar o llevar a votación: cambiar las reglas sigue su propia regla */}
      <section aria-label="Guardar los cambios" className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
        {sucio ? (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-white/75" data-testid="lista-cambios">
            {cambios.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-white/55">Sin cambios por guardar.</p>
        )}
        <p className="text-xs text-cyan-100/80" role="status" data-testid="regla-de-las-reglas">
          Cambiar estas reglas: {veredicto.motivo}
        </p>
        {estado ? (
          <p role={estado.tipo === "error" ? "alert" : "status"} className={`text-xs ${estado.tipo === "error" ? "text-red-300" : estado.tipo === "aviso" ? "text-amber-200" : "text-emerald-300"}`} data-testid="estado-guardado">
            {estado.texto}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`${CLASE_BOTON} border-cyan-300/40 bg-cyan-500/10`} disabled={!sucio || ocupado || veredicto.decision === "denegar" || !miembroQuePuedeEditar} onClick={accion}>
            {veredicto.decision === "aplicar" ? <Save className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} {textoBoton}
          </button>
          {sucio ? (
            <button type="button" className={CLASE_BOTON} disabled={ocupado} onClick={() => { setBorrador(null); setEstado(null); }}>
              Descartar
            </button>
          ) : null}
        </div>
      </section>

      {composer ? (
        <Dialog open onOpenChange={(o) => !o && setComposer(null)}>
          <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{composer?.decision === "proponer" ? "Proponer el cambio" : "Llevar a votación"}</DialogTitle>
              <DialogDescription>{composer?.propuesta?.title}</DialogDescription>
            </DialogHeader>
            {composerInicial ? (
              <ProposalComposer
                key={composerInicial.title} scope={scopeDeEntidad(g.entidad.tipo)} scopeRef={g.entidad.id} initial={composerInicial}
                onCreated={() => {
                  setComposer(null);
                  setBorrador(null);
                  setEstado({ tipo: "info", texto: "Propuesta creada: se decide en Decisiones. Cuando se apruebe, las reglas nuevas se aplican solas." });
                }}
              />
            ) : (
              <p className="text-sm text-white/70">No hay borrador para este cambio.</p>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </GlassCard>
  );
}

export default SeccionGobiernoProto;
