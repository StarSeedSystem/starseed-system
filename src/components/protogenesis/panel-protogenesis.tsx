"use client";

// ProtoGenesis · panel del encargo (PG1013H): intención y criterios editables, plan por
// niveles con estado y agente, progreso, fallos de verificación y decisión según
// decidirResultado. La lógica vive en src/lib/protogenesis; aquí solo interfaz.
// Contrato: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
import { useState } from "react";
import { Gauge, Gavel, ListTree, ListPlus, ShieldAlert, Trash2 } from "lucide-react";

import { almacenNavegador, guardarEncargo, type AlmacenLocal, type EstadoPaso } from "@/lib/protogenesis/almacen-encargos";
import { decidirResultado, faltaDePlan } from "@/lib/protogenesis/decision";
import { TIPOS_CRITERIO, type Autor, type Criterio, type Encargo, type Plan } from "@/lib/protogenesis/encargo";
import { nivelesDe } from "@/lib/protogenesis/reparto";
import type { Ambito } from "@/lib/protomolecula/tipos";

const ETIQUETA_ESTADO: Record<EstadoPaso, string> = { pendiente: "pendiente", corriendo: "en curso", ok: "hecho", falla: "con fallo", omitido: "omitido" };
const ETIQUETA_TIPO: Record<Criterio["tipo"], string> = {
  formato: "formato", "duracion-max": "duración máxima", "tamano-max": "tamaño máximo",
  "sin-secretos": "sin secretos", "capas-presentes": "capas presentes", persona: "criterio de persona",
};
const ETIQUETA_DECISION: Record<string, string> = { aceptar: "Aceptar en mi molécula", "proponer-voto": "Proponer al grupo", "proponer-metagenesis": "Pedir a MetaGenesis" };
const SIN_CRITERIOS = "Sin criterios comprobables no hay encargo: añade al menos uno.";

export interface PanelProtoGenesisProps {
  moleculaId: string;
  ambito: Ambito;
  rol?: string | null;
  democratico?: boolean;
  esDueno?: boolean;
  /** Plan y su estado vivo: quien abrió el panel los trae; sin plan solo se encarga. */
  plan?: Plan | null;
  estados?: Record<string, EstadoPaso>;
  asignaciones?: { paso: string; agente: string }[];
  fallos?: string[];
  tocaFueraDeLaMolecula?: boolean;
  /** Almacén inyectable para las pruebas; por defecto el del navegador. */
  almacen?: AlmacenLocal | null;
  autor?: Autor;
}

export function PanelProtoGenesis({
  moleculaId, ambito, rol = null, democratico = false, esDueno = true, plan = null,
  estados = {}, asignaciones = [], fallos = [], tocaFueraDeLaMolecula = false, almacen,
  autor = { tipo: "persona", id: "yo" },
}: PanelProtoGenesisProps) {
  const [intencion, setIntencion] = useState("");
  const [criterios, setCriterios] = useState<Criterio[]>([]);
  const [tipoNuevo, setTipoNuevo] = useState<(typeof TIPOS_CRITERIO)[number]>("formato");
  const [textoNuevo, setTextoNuevo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  /** Crea el encargo y lo deja en el almacén del panel (almacen-encargos). */
  function alEncargar() {
    if (criterios.length === 0) return;
    const creadoEn = Date.now();
    const encargo: Encargo = {
      id: `PG${creadoEn.toString(36)}`, moleculaId, ambito, intencion: intencion.trim(),
      criterios, autor, origen: "texto", creadoEn,
    };
    const destino = almacen ?? almacenNavegador();
    const ok = destino !== null && guardarEncargo(destino, { encargo, plan: null, estados: {}, asignaciones: [], actualizadoEn: creadoEn });
    setAviso(ok ? "Encargo guardado." : "No hay dónde guardar el encargo en este aparato.");
  }

  // Un átomo «próximamente» vive fuera de la molécula: lo decide MetaGenesis (§4).
  const sale = tocaFueraDeLaMolecula || faltaDePlan(plan) !== null;
  const decision = decidirResultado({ ambito, esDueno, rol, democratico, tocaFueraDeLaMolecula: sale });
  const textoDecision = ETIQUETA_DECISION[decision.modo] ?? null;
  const niveles = plan ? nivelesDe(plan) : [];
  const hechos = plan ? plan.pasos.filter((p) => estados[p.id] === "ok").length : 0;
  const agenteDe = (id: string) => {
    const a = asignaciones.find((asig) => asig.paso === id);
    return a ? `agente ${a.agente}` : "sin agente";
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/50 p-4">
      <header className="flex items-center gap-2">
        <h2 className="text-base font-semibold">Panel ProtoGenesis</h2>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{ambito}</span>
      </header>
      <textarea aria-label="Intención" value={intencion} onChange={(e) => setIntencion(e.target.value)} placeholder="¿Qué quieres crear?" className="min-h-16 w-full cursor-text rounded-lg border bg-background/60 p-2 text-sm" />
      <ul className="flex flex-col gap-1">
        {criterios.map((c, i) => (
          <li key={`${c.tipo}-${i}`} className="flex items-center gap-2 text-sm">
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{ETIQUETA_TIPO[c.tipo]}</span>
            <span className="flex-1 truncate">{c.texto}</span>
            <button type="button" aria-label={`Quitar criterio ${i + 1}`} onClick={() => setCriterios(criterios.filter((_, j) => j !== i))} className="cursor-pointer rounded-lg p-1 hover:bg-muted">
              <Trash2 aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Tipo de criterio" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value as (typeof TIPOS_CRITERIO)[number])} className="cursor-pointer rounded-lg border bg-background/60 p-1.5 text-sm">
          {TIPOS_CRITERIO.map((t) => (<option key={t} value={t}>{ETIQUETA_TIPO[t]}</option>))}
        </select>
        <input aria-label="Comprobación del criterio" value={textoNuevo} onChange={(e) => setTextoNuevo(e.target.value)} placeholder="Qué se comprueba, por ejemplo: formato glb" className="w-56 cursor-text rounded-lg border bg-background/60 p-1.5 text-sm" />
        <button
          type="button" aria-label="Añadir criterio" disabled={!textoNuevo.trim()}
          onClick={() => { setCriterios([...criterios, { tipo: tipoNuevo, texto: textoNuevo.trim() }]); setTextoNuevo(""); }}
          className="flex cursor-pointer items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ListPlus aria-hidden className="size-4" /> Añadir criterio
        </button>
      </div>
      {criterios.length === 0 && <p role="status" className="text-xs text-muted-foreground">{SIN_CRITERIOS}</p>}
      <button
        type="button" disabled={criterios.length === 0} onClick={alEncargar} title={criterios.length === 0 ? SIN_CRITERIOS : undefined}
        className="w-fit cursor-pointer rounded-lg border bg-background/60 px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        Encargar
      </button>
      {aviso && <p role="status" className="text-xs text-muted-foreground">{aviso}</p>}
      {plan && (
        <section className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><ListTree aria-hidden className="size-4" /> Plan · {hechos} de {plan.pasos.length} pasos hechos</h3>
          {niveles.map((nivel, i) => (
            <ol key={`nivel-${i}`} className="flex flex-col gap-1 rounded-lg border border-border/40 p-2">
              {nivel.map((id) => (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{plan.pasos.find((p) => p.id === id)?.titulo ?? id}</span>
                  <span className="text-xs text-muted-foreground">{ETIQUETA_ESTADO[estados[id] ?? "pendiente"]}</span>
                  <span className="text-xs">{agenteDe(id)}</span>
                </li>
              ))}
              <span className="text-xs text-muted-foreground">Nivel {i + 1}</span>
            </ol>
          ))}
        </section>
      )}
      {fallos.length > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive"><ShieldAlert aria-hidden className="size-4" /> Fallos de verificación</h3>
          {fallos.map((f, i) => (<p key={i} className="text-sm text-destructive">Fallo de verificación: {f}</p>))}
        </section>
      )}
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Decisión</h3>
        {textoDecision !== null ? (
          <button type="button" onClick={() => setAviso(`${textoDecision}: ${decision.motivo}`)} className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border bg-background/60 px-3 py-1.5 text-sm font-medium hover:bg-muted">
            <Gavel aria-hidden className="size-4" /> {textoDecision}
          </button>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">{decision.motivo}</p>
        )}
      </section>
    </div>
  );
}
