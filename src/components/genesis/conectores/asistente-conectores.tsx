"use client";

/** Asistente «Conectar Genesis» (Ola 1019G · GCA1019M · architecture/genesis-conectores-abiertos.md §2–§4).
 * Tres pasos para cuenta, grupo o página: lo local con interruptores; lo gratis por vincular (enlace oficial
 * en pestaña nueva y clave que se envía a la API y se borra); resumen por papel con la cadena y su motivo.
 * Todo inyectable (sin red, disco ni reloj); jamás muestra, registra ni guarda una clave. */
import { useState } from "react";
import type { Gratis, Papel, Privacidad } from "@/lib/genesis/conectores/catalogo-opciones";
import type { GrupoSugerencias } from "@/lib/genesis/conectores/sugerir";

export type OrigenLocal = "neurona" | "cerebro" | "astraura";
export interface OfertaLocal {
  id: string; nombre: string; origen: OrigenLocal; papel: Papel[];
  /** Capa de Astraura que cabe; `null` cuando no consta (nunca se inventa). */
  capa: string | null; activa: boolean;
}
export interface ResumenPapel { papel: Papel; cadena: { id: string; nombre: string; motivo: string }[]; }
export interface PropsAsistenteConectores {
  tituloAmbito: string; ofertas: OfertaLocal[]; grupos: GrupoSugerencias[]; resumenes: ResumenPapel[];
  alternarLocal: (id: string, activa: boolean) => void;
  enviarClave: (id: string, clave: string) => Promise<void>;
  abrirEnlace?: (url: string) => void;
}

const ORIGEN: Record<OrigenLocal, string> = { neurona: "neurona", cerebro: "servidor del cerebro", astraura: "capa de Astraura" };
const PRIVACIDAD: Record<Privacidad, string> = { local: "Local", "nube-sin-retencion": "Nube, sin retención", "nube-con-retencion": "Nube, con retención", desconocida: "Privacidad desconocida" };
const TARJETA = "rounded-2xl border border-white/10 bg-black/20 p-3";
const PILDA = "rounded-full border border-white/15 px-2 py-0.5";
const PILDA_PASO = "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors duration-150";
const PASO_ACTIVO = "border-emerald-300/50 bg-emerald-500/10 text-emerald-100";
const PASO_INACTIVO = "border-white/15 text-white/60 hover:border-emerald-300/40 hover:text-white";
const SIN_VERIFICAR = "Límite gratuito sin verificar";

/** El límite tal cual consta en el catálogo, en palabras; nunca un límite inventado. */
const textoLimite = (g: Gratis): string =>
  [g.rpm !== null && `${g.rpm} por minuto`, g.porDia !== null && `${g.porDia} al día`, g.horasMes !== null && `${g.horasMes} horas al mes`,
    g.almacenamientoGb !== null && `${g.almacenamientoGb} GB`, g.nota].filter(Boolean).join(" · ") || SIN_VERIFICAR;
export function AsistenteConectores({ tituloAmbito, ofertas, grupos, resumenes, alternarLocal, enviarClave, abrirEnlace }: PropsAsistenteConectores) {
  const abrir = abrirEnlace ?? ((url: string) => window.open(url, "_blank", "noopener,noreferrer"));
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [activas, setActivas] = useState<Record<string, boolean>>(() => Object.fromEntries(ofertas.map((o) => [o.id, o.activa])));
  const [claves, setClaves] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const gratis = grupos.flatMap((g) => (g.clave === "gratis-por-vincular" ? g.opciones : []));
  const alternar = (id: string) => { const activa = !activas[id]; setActivas((a) => ({ ...a, [id]: activa })); alternarLocal(id, activa); };
  const enviar = async (id: string) => {
    const clave = claves[id] ?? "";
    if (!clave || enviando !== null) return;
    setEnviando(id); setAviso(null);
    try {
      await enviarClave(id, clave); setClaves((c) => ({ ...c, [id]: "" })); setAviso("Clave enviada a la API y borrada del campo; no se muestra ni se guarda aquí.");
    } catch { setAviso("La API no aceptó la clave; inténtalo de nuevo."); }
    finally { setEnviando(null); }
  };

  return (
    <section className="space-y-3" aria-label={`Asistente Conectar Genesis · ${tituloAmbito}`}>
      <nav className="flex flex-wrap gap-1.5" aria-label="Pasos del asistente">
        {([1, 2, 3] as const).map((n) => (
          <button key={n} type="button" data-testid={`paso-${n}`} onClick={() => setPaso(n)} aria-current={paso === n ? "step" : undefined}
            className={`${PILDA_PASO} ${paso === n ? PASO_ACTIVO : PASO_INACTIVO}`}>
            {n === 1 ? "Lo local" : n === 2 ? "Gratis por vincular" : "Resumen por papel"}
          </button>
        ))}
      </nav>
      {aviso ? <p data-testid="aviso-clave" className="text-[11px] text-emerald-100">{aviso}</p> : null}
      {paso === 1 ? (<ul className="space-y-2" data-testid="lo-local">
          {ofertas.map((o) => (
            <li key={o.id} className={`flex flex-wrap items-center justify-between gap-2 ${TARJETA}`}>
              <div>
                <p className="text-sm text-white/90">{o.nombre}</p>
                <p className="text-[11px] text-white/50">{ORIGEN[o.origen]} · {o.capa ? `capa ${o.capa}` : "capa sin validar"}{o.papel.length ? ` · ${o.papel.join(", ")}` : ""}</p>
              </div>
              <button type="button" role="switch" aria-checked={Boolean(activas[o.id])} data-testid={`interruptor-${o.id}`} onClick={() => alternar(o.id)}
                className={`${PILDA_PASO} border-white/15 text-white/80 hover:border-emerald-300/50`}>{activas[o.id] ? "Activa" : "Apagada"}</button>
            </li>
          ))}
        </ul>
      ) : null}
      {paso === 2 ? (<ul className="space-y-2" data-testid="gratis-por-vincular">          {gratis.map((s) => (
            <li key={s.id} className={TARJETA}>
              <p className="text-sm text-white/90">{s.nombre}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-white/55">
                {s.papeles.map((p) => <span key={p} className={PILDA}>{p}</span>)}
                <span className={PILDA}>{PRIVACIDAD[s.privacidad]}</span>
                <span>{s.limite ? textoLimite(s.limite) : SIN_VERIFICAR}</span>
                {s.variables.length ? <span>variables: {s.variables.join(", ")}</span> : null}
              </p>
              <p className="mt-1 text-[11px] text-white/45">{s.motivo}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" disabled={!s.enlaceClave && !s.enlaceAlta} data-testid={`vincular-${s.id}`} onClick={() => abrir(s.enlaceClave ?? s.enlaceAlta ?? "")}
                  className={`${PILDA_PASO} border-emerald-300/40 text-emerald-100 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40`}>Vincular</button>
                <form className="flex items-center gap-1.5" onSubmit={(ev) => { ev.preventDefault(); void enviar(s.id); }}>
                  <label htmlFor={`clave-${s.id}`} className="sr-only">Clave de {s.nombre}</label>
                  <input id={`clave-${s.id}`} type="password" autoComplete="off" value={claves[s.id] ?? ""} data-testid={`clave-${s.id}`} placeholder="Pega tu clave…"
                    onChange={(e) => setClaves((c) => ({ ...c, [s.id]: e.target.value }))} className="w-44 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-xs text-white/90" />
                  <button type="submit" disabled={!claves[s.id] || enviando === s.id} data-testid={`enviar-clave-${s.id}`}
                    className={`${PILDA_PASO} border-white/15 text-white/80 hover:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-40`}>{enviando === s.id ? "Enviando…" : "Enviar"}</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {paso === 3 ? (<ul className="space-y-2" data-testid="resumen-papeles">
          {resumenes.map((r) => (
            <li key={r.papel} className={TARJETA}>
              <span className={`${PILDA} border-emerald-300/40 text-[11px] text-emerald-100`}>{r.papel}</span>
              <ol className="mt-1.5 space-y-1">
                {r.cadena.length === 0
                  ? <li className="text-[11px] text-white/50">Sin cadena todavía: activa lo local o vincula una opción gratis en los pasos de arriba.</li>
                  : r.cadena.map((c, i) => <li key={c.id} className="text-[11px] text-white/60">{i + 1}. <span className="text-white/85">{c.nombre}</span> — {c.motivo}</li>)}
              </ol>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
