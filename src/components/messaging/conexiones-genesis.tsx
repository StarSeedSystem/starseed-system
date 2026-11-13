"use client";

/**
 * <ConexionesGenesis /> — las tres opciones de agentes de «Conexiones de chat» (GEN1113E, contrato
 * `architecture/astraura-chats-genesis.md` §2.2).
 *
 *   • Agentes de Genesis      — toda cuenta con sesión: el agente de Mi Genesis como interlocutor.
 *   • Agentes de PoliGenesis  — solo si la cuenta colabora (rango ≥ 2) en algún grupo o página.
 *   • Agentes de MetaGenesis  — solo con acceso (`miAccesoMetaGenesis().miembro`).
 *
 * Se guardan en `user_settings.prefs.chatsGenesis.conexiones` a través de la biblioteca
 * `@/lib/chats-genesis/vinculos` (parche atómico): nada va a `messaging_channels` (decisión D3).
 * Esconder una tarjeta es comodidad: quién puede qué lo decide el servidor (§4).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Dna, Users, Orbit, Loader2, ExternalLink, ShieldCheck, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrefsChatsGenesis } from "@/lib/chats-genesis/tipos";
import { conMetaGenesisInicial } from "@/lib/chats-genesis/vinculos";
import { misEntidades, type EntidadGestionable } from "@/lib/genesis/entidades";

export type FocoGenesis = "genesis" | "poligenesis" | "metagenesis";
export type AccesoMeta = { miembro: boolean; dueno: boolean } | null;

/** Cuántas entidades se ven antes de «Ver todas»: una lista larga se abre entera, nunca se corta. */
const ENTIDADES_VISIBLES = 4;

type Conexiones = PrefsChatsGenesis["conexiones"];

/**
 * GEN1114F · Una sola historia para el agente de Mi Genesis, la misma en Conexiones de chat y en la
 * pestaña Genesis (revisión del 13-11: una decía «aún no está activa» y la otra enseñaba «Usar mis
 * memorias» encendido, que parecía activo). Sin nada guardado, el agente está APAGADO y la memoria
 * vale lo que valdrá al activarlo (sí, por defecto). Puro.
 */
export function estadoAgenteGenesis(g: { activo: boolean; memoria: boolean } | undefined): {
  activo: boolean;
  memoria: boolean;
  texto: string;
} {
  const activo = g?.activo === true;
  const memoria = g ? g.memoria !== false : true;
  if (activo) {
    return {
      activo,
      memoria,
      texto: memoria
        ? "Activo: el agente de Mi Genesis entra en tus chats y usa tus memorias y contexto."
        : "Activo: el agente de Mi Genesis entra en tus chats, sin tus memorias ni tu contexto.",
    };
  }
  return {
    activo,
    memoria,
    texto: `Apagado: el agente de Mi Genesis no entra en tus chats. ${
      memoria ? "Cuando lo actives, usará tus memorias y contexto." : "Cuando lo actives, no usará tus memorias."
    }`,
  };
}

export interface ConexionesGenesisProps {
  foco?: FocoGenesis;
  /** `null` mientras se lee (el panel lo lee una vez para todas sus opciones). */
  prefs: PrefsChatsGenesis | null;
  /** Acceso a MetaGenesis; `null` = sin sesión, sin acceso comprobable o aún sin leer. */
  acceso: AccesoMeta;
  /** Guarda las preferencias completas (parche atómico); `false` si no se pudo. */
  onGuardar: (siguiente: PrefsChatsGenesis) => Promise<boolean>;
}

export function ConexionesGenesis({ foco, prefs, acceso, onGuardar }: ConexionesGenesisProps) {
  const [entidades, setEntidades] = useState<EntidadGestionable[] | null>(null);
  const [motivoEntidades, setMotivoEntidades] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const refs = useRef<Partial<Record<FocoGenesis, HTMLDivElement | null>>>({});

  useEffect(() => {
    let vivo = true;
    void misEntidades()
      .catch(() => ({ ok: false as const, motivo: "Sin red." }))
      .then((e) => {
        if (!vivo) return;
        if (e.ok) setEntidades(e.lista.filter((x) => x.rango >= 2));
        else {
          setEntidades([]);
          setMotivoEntidades(e.motivo);
        }
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Foco desde el enlace (`?foco=genesis|poligenesis|metagenesis`): lleva la tarjeta a la vista.
  useEffect(() => {
    if (!foco || !prefs) return;
    refs.current[foco]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [foco, prefs, entidades, acceso]);

  const guardar = useCallback(
    async (cambio: Partial<Conexiones>) => {
      if (!prefs) return;
      setGuardando(true);
      try {
        await onGuardar({ ...prefs, conexiones: { ...prefs.conexiones, ...cambio } });
      } finally {
        setGuardando(false);
      }
    },
    [prefs, onGuardar],
  );

  if (!prefs) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando los agentes de Genesis…
      </div>
    );
  }

  const g = prefs.conexiones.genesis ?? { activo: false, memoria: true };
  const historia = estadoAgenteGenesis(prefs.conexiones.genesis);
  const pg = prefs.conexiones.poligenesis ?? { activo: false, entidades: [] };
  const mg = prefs.conexiones.metagenesis;
  const lista = entidades ?? [];
  const visibles = verTodas ? lista : lista.slice(0, ENTIDADES_VISIBLES);

  const alternarEntidad = (id: string, si: boolean) => {
    const set = new Set(pg.entidades);
    if (si) set.add(id);
    else set.delete(id);
    void guardar({ poligenesis: { ...pg, entidades: [...set] } });
  };

  return (
    <div className="space-y-3" data-testid="conexiones-genesis">
      {/* Agentes de Genesis — toda cuenta con sesión */}
      <div ref={(el) => { refs.current.genesis = el; }} className="scroll-mt-4">
        <Tarjeta
          titulo="Agentes de Genesis"
          icono={Dna}
          acento="border-emerald-500/30 bg-emerald-950/15"
          activo={g.activo}
          enfocada={foco === "genesis"}
          deshabilitado={guardando}
          onActivo={(v) => void guardar({ genesis: { ...g, activo: v } })}
        >
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            El agente de Mi Genesis entra en tus chats como interlocutor: propone cambios en tu cuenta como operaciones
            con vista previa, que tú confirmas y puedes deshacer. No ejecuta órdenes ni código.
          </p>
          <p
            data-testid="estado-agente-genesis"
            className={cn(
              "rounded-md border px-3 py-2 text-[11px] leading-relaxed",
              historia.activo ? "border-emerald-500/25 bg-emerald-950/20 text-emerald-100/90" : "border-white/10 bg-black/20 text-white/70",
            )}
          >
            {historia.texto}
          </p>
          <label className={cn("flex items-center justify-between gap-2 rounded-lg border border-fuchsia-500/15 bg-fuchsia-950/10 px-3 py-2 text-[11px] text-fuchsia-100/85", !g.activo && "opacity-75")}>
            <span>{g.activo ? "Usar mis memorias y contexto" : "Al activarlo, usar mis memorias y contexto"}</span>
            <Switch
              checked={g.memoria}
              disabled={guardando}
              onCheckedChange={(v) => void guardar({ genesis: { ...g, memoria: v } })}
              aria-label="Usar mis memorias y contexto con el agente de Genesis"
            />
          </label>
          <Enlace href="/genesis?nivel=mi">Abrir Mi Genesis</Enlace>
        </Tarjeta>
      </div>

      {/* Agentes de PoliGenesis — solo con algún grupo o página de rango ≥ 2 */}
      <div ref={(el) => { refs.current.poligenesis = el; }} className="scroll-mt-4">
        {entidades === null ? (
          <Nota><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando tus grupos y páginas…</Nota>
        ) : lista.length === 0 ? (
          <Nota>
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Agentes de PoliGenesis aparece cuando colaboras (rango 2 o más) en algún grupo o página.
              {motivoEntidades ? ` ${motivoEntidades}` : " Ahora mismo no tienes ninguno."}
            </span>
          </Nota>
        ) : (
          <Tarjeta
            titulo="Agentes de PoliGenesis"
            icono={Users}
            acento="border-amber-500/30 bg-amber-950/15"
            activo={pg.activo}
            enfocada={foco === "poligenesis"}
            deshabilitado={guardando}
            onActivo={(v) => void guardar({ poligenesis: { ...pg, activo: v } })}
          >
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Elige en qué grupos y páginas trabajan los agentes. En un grupo democrático cada cambio sale como propuesta
              para votar.
            </p>
            <ul className="space-y-1" aria-label="Grupos y páginas">
              {visibles.map((e) => {
                const marcada = pg.entidades.includes(e.id);
                return (
                  <li key={e.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-xs">
                    <input
                      type="checkbox"
                      id={`pg-${e.id}`}
                      checked={marcada}
                      disabled={guardando || !pg.activo}
                      onChange={(ev) => alternarEntidad(e.id, ev.target.checked)}
                      className="h-4 w-4 shrink-0 accent-amber-500"
                    />
                    <label htmlFor={`pg-${e.id}`} className="min-w-0 flex-1 break-words">
                      {e.nombre}
                      <span className="ml-1 text-[10px] text-white/40">· {e.tipo === "grupo" ? "grupo" : "página"} · {e.rol}</span>
                    </label>
                    <Link href={`/poligenesis?entidad=${encodeURIComponent(e.id)}`} className="shrink-0 text-amber-300/80 hover:text-amber-200" title={`Abrir ${e.nombre} en PoliGenesis`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {lista.length > ENTIDADES_VISIBLES && (
              <Button size="sm" variant="ghost" className="h-7 w-full text-[11px]" onClick={() => setVerTodas((v) => !v)}>
                {verTodas ? "Ver menos" : `Ver las ${lista.length}`}
              </Button>
            )}
          </Tarjeta>
        )}
      </div>

      {/* Agentes de MetaGenesis — solo cuentas con acceso */}
      {acceso?.miembro && (
        <div ref={(el) => { refs.current.metagenesis = el; }} className="scroll-mt-4">
          <Tarjeta
            titulo="Agentes de MetaGenesis"
            icono={Orbit}
            acento="border-violet-500/30 bg-violet-950/15"
            activo={conMetaGenesisInicial(prefs).conexiones.metagenesis?.activo === true}
            enfocada={foco === "metagenesis"}
            deshabilitado={guardando}
            onActivo={(v) => void guardar({ metagenesis: { activo: v } })}
            extra={
              <Badge variant="outline" className="gap-1 border-violet-400/40 text-[9px] text-violet-200">
                <ShieldCheck className="h-3 w-3" /> {acceso.dueno ? "Dueño" : "Desarrollador"}
              </Badge>
            }
          >
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Los chats de dirección de MetaGenesis y los tres puentes de Telegram, en la pestaña Genesis.
            </p>
            <p className="rounded-md border border-violet-500/20 bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-violet-100/85">
              {acceso.dueno
                ? "Como dueño puedes leer y escribir en la dirección, poner a trabajar a los directores y dar las órdenes de los puentes. La Mac y el A1 lo vuelven a comprobar contra su propia lista de cuentas."
                : "Como desarrollador puedes leer la dirección y escribir en su hilo; poner a trabajar a un agente y las órdenes de los puentes son solo para dueños."}
            </p>
            {mg === undefined && (
              <p className="text-[10px] text-violet-300/60">Se activa solo la primera vez que abres la pestaña Genesis; puedes apagarlo aquí.</p>
            )}
            <Enlace href="/agent?tab=chats-genesis">Abrir en Genesis</Enlace>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}

function Tarjeta(props: {
  titulo: string;
  icono: React.ComponentType<{ className?: string }>;
  acento: string;
  activo: boolean;
  enfocada?: boolean;
  deshabilitado?: boolean;
  onActivo: (v: boolean) => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Icono = props.icono;
  return (
    <Card
      data-enfocada={props.enfocada ? "si" : undefined}
      className={cn(
        "backdrop-blur-sm transition",
        props.activo ? props.acento : "border-white/5 bg-background/40",
        props.enfocada && "ring-2 ring-primary/50",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Icono className="h-4 w-4 shrink-0" />
            <span className="break-words">{props.titulo}</span>
          </CardTitle>
          <div className="mt-1 flex flex-wrap gap-1">
            {props.activo && <Badge variant="outline" className="text-[9px]">Activa</Badge>}
            {props.extra}
          </div>
        </div>
        <Switch
          checked={props.activo}
          disabled={props.deshabilitado}
          onCheckedChange={props.onActivo}
          aria-label={`Activar ${props.titulo}`}
        />
      </CardHeader>
      <CardContent className="space-y-3">{props.children}</CardContent>
    </Card>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}

function Enlace({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[11px] text-cyan-300 hover:text-cyan-200">
      <ExternalLink className="h-3 w-3" /> {children}
    </Link>
  );
}

export default ConexionesGenesis;
