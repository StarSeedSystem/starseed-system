"use client";

/**
 * Panel de alcance (INV1025P) · se monta en las propuestas `agente === "alcance"`
 * de la Imaginación en lugar de los botones de código.
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor de asunto y cuerpo (con contadores), remitente y medio a la vista,
 * botones Aprobar texto · Reimaginar · Rechazar (con «no volver a contactar») ·
 * Enviar —solo tras aprobar; la ventana muestra remitente, destinatario resuelto,
 * asunto, cuerpo y enlaces verificados, y pide escribir ENVIAR— y el estado de
 * seguimiento (mapeado desde `src/lib/mail/seguimiento-respuestas.ts`). El
 * texto se muestra sin HTML crudo. Todo va a `/api/mando/alcance` (solo local)
 * y, para rechazar/reimaginar, al `/api/mando/imaginacion` de siempre.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, ExternalLink, Loader2, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { NOMBRE_ESTADO } from "@/lib/mando/imaginacion-tipos";
import type { EnlaceVerificado, EstadoEnvio, EstadoSeguimiento, VistaAlcance } from "@/lib/alcance/alcance-tipos";

export const NOMBRE_ENVIO: Record<EstadoEnvio, string> = {
  pendiente: "Borrador", aprobada: "Texto aprobado", enviada: "Enviada",
  respondida: "Respondió", "sin-respuesta": "Sin respuesta", rebotada: "Rebotó", "no-contactar": "No volver a contactar",
};
const NOMBRE_SEGUIMIENTO: Record<EstadoSeguimiento, string> = { "por-responder": "Hay que responder", esperando: "Esperando respuesta", resuelto: "Resuelto" };

const CAMPO = "rounded-lg border border-white/15 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80";
const BOTON = "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 disabled:cursor-not-allowed disabled:opacity-50 motion-safe:transition-colors";
const CHIP = "rounded-full border px-2 py-0.5 text-[11px] leading-5";

type Resultado = { ok?: boolean; error?: string; motivos?: string[]; mailto?: string; abrir?: string; copiar?: string; vista?: VistaAlcance };
type RespEnvio = { status: number; datos: Resultado };

async function pedirAlcance(url: string, cuerpo?: Record<string, unknown>): Promise<RespEnvio> {
  try {
    const r = await fetch(url, cuerpo ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) } : { cache: "no-store" });
    const datos = (await r.json().catch(() => ({}))) as Resultado;
    return { status: r.status, datos: { ...datos, error: datos.error || (r.ok ? undefined : `No se pudo (HTTP ${r.status}).`) } };
  } catch {
    return { status: 0, datos: { error: "La consola local no respondió: no se cambió nada." } };
  }
}

/** El envío solo sale cuando la propuesta estuvo aprobada por una persona y no hay motivo en contra. PURA. */
export function puedeEnviar(v: VistaAlcance | null, modificado: boolean): boolean {
  return !!v && !modificado && v.estadoPropuesta === "aprobada" && v.aprobada && v.huellaAprobada !== "" && v.envio !== "enviada" && v.envio !== "no-contactar" && v.motivos.length === 0;
}

/** El real que llegó hace menos de 15 min con 2xx se habla en la confirmación; lo demás se dice. PURA. */
export function vivos(e: EnlaceVerificado[], ahora: Date): { url: string; ok: boolean }[] {
  return e.map((x) => ({
    url: x.url,
    ok: x.codigo >= 200 && x.codigo < 300 && ahora.getTime() - new Date(x.verificadoEn).getTime() < 15 * 60_000,
  }));
}

const dos = (n: number) => String(n).padStart(2, "0");
export function palabrasDe(t: string): number {
  return t.split(/\s+/).filter(Boolean).length;
}
/** Marca temporal corta para los enlaces: «hace 3 min» o la hora; "" si no. PURA. */
export function haceCuando(v: EnlaceVerificado, ahora: Date): string {
  if (!v.verificadoEn) return "";
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(v.verificadoEn).getTime()) / 60_000));
  return `hace ${min} min`;
}

export function PanelAlcance({ id, alMensaje }: { id: string; alMensaje?: (texto: string) => void }) {
  const [vista, setVista] = useState<VistaAlcance | null>(null);
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<"reimaginar" | "rechazar" | "enviar" | null>(null);
  const [confirma, setConfirma] = useState("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [noVolver, setNoVolver] = useState(false);
  const [notas, setNotas] = useState("");
  const [motivoRecha, setMotivoRecha] = useState("");
  const GIRO = "h-3.5 w-3.5 motion-safe:animate-spin";
  const idDom = `alcance-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  const cargar = useCallback(async () => {
    const r = await pedirAlcance(`/api/mando/alcance?id=${encodeURIComponent(id)}`);
    if (!r.datos.vista) { setError(r.datos.error || "No se pudo leer el estado del alcance."); return null; }
    setVista(r.datos.vista);
    setAsunto(r.datos.vista.asunto);
    setCuerpo(r.datos.vista.cuerpo);
    setError(null);
    return r.datos.vista;
  }, [id]);

  useEffect(() => {
    void cargar().finally(() => setCargando(false));
  }, [cargar]);

  const avisar = (texto: string, aplicada?: VistaAlcance) => {
    setMensaje(texto);
    if (aplicada) { setVista(aplicada); setAsunto(aplicada.asunto); setCuerpo(aplicada.cuerpo); }
    alMensaje?.(texto);
  };

  /** Acción contra /api/mando/alcance; recarga la vista y cuenta lo que pasó. */
  const accionAlcance = async (cuerpoPeticion: Record<string, unknown>, bien: string) => {
    setOcupado(String(cuerpoPeticion.accion ?? "post"));
    setError(null);
    const r = await pedirAlcance("/api/mando/alcance", { id, ...cuerpoPeticion });
    setOcupado(null);
    if (!r.datos.ok) { setError(r.datos.motivos?.length ? r.datos.motivos.join(" ") : r.datos.error ?? "No se pudo."); return r.datos; }
    const vistaNueva = await cargar();
    avisar(bien, vistaNueva ?? undefined);
    return r.datos;
  };

  /* ‑ Handlers de los botones ─────────────────────────────────────────── */
  const aprobar = async () => {
    // Si se editó algo, el texto nuevo se guarda primero y la aprobación vieja ya se anuló.
    if (modificado) {
      const guardado = await accionAlcance({ accion: "editar", asunto, cuerpo }, "Borrador guardado con el texto nuevo.");
      if (!guardado?.ok) return;
    }
    await accionAlcance({ accion: "aprobar-texto" }, "Texto aprobado: la ventana de envío ya puede revisar los enlaces.");
  };

  const reimaginar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado("reimaginar");
    setError(null);
    const r = await pedirAlcance("/api/mando/imaginacion", { accion: "reimaginar", id, notas: notas.trim() });
    setOcupado(null);
    if (!r.datos.ok) return setError(r.datos.error ?? "No se pudo pedir otra versión.");
    setAbierto(null);
    setNotas("");
    avisar("Pedida otra versión: el director la encarga a la flota en su próximo ciclo.");
  };

  const rechazar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado("rechazar");
    setError(null);
    const r = await pedirAlcance("/api/mando/imaginacion", { accion: "rechazar", id, motivo: motivoRecha.trim() });
    setOcupado(null);
    if (!r.datos.ok) return setError(r.datos.error ?? "No se pudo rechazar.");
    setAbierto(null);
    if (noVolver) {
      setNoVolver(false);
      await accionAlcance({ accion: "suprimir" }, "Rechazada y el destinatario pasará a la lista de supresión.");
    } else {
      avisar("Rechazada.");
    }
  };

  const confirmarEnvio = async (e: FormEvent) => {
    e.preventDefault();
    if (confirma.trim() !== "ENVIAR") return setError("Escribe ENVIAR para confirmar el envío (R2).");
    setOcupado("enviar");
    setError(null);
    const r = await pedirAlcance("/api/mando/alcance", { id, accion: "enviar", medio: vista?.medio ?? "", confirmacion: confirma.trim() });
    setOcupado(null);
    if (!r.datos.ok) return setError(r.datos.motivos?.length ? r.datos.motivos.join(" ") : r.datos.error ?? "No se pudo.");
    setAbierto(null);
    setConfirma("");
    // Aquí NO se guarda nada: la persona decide si abre el borrador, copia o deja que el OS salga.
    if (r.datos.mailto) window.location.href = r.datos.mailto;
    else if (r.datos.abrir) window.open(r.datos.abrir, "_blank", "noopener,noreferrer");
    else if (r.datos.copiar && navigator.clipboard) void navigator.clipboard.writeText(r.datos.copiar);
    const aplicada = await cargar();
    avisar("Envío registrado. Ahora toca seguir la respuesta: márcala abajo.", aplicada ?? undefined);
  };

  const marcar = async (estado: EstadoEnvio) => {
    await accionAlcance({ accion: "marcar", estado }, `Estado de seguimiento: ${NOMBRE_ENVIO[estado]}.`);
  };

  /* ‑ Lo que pinta ─────────────────────────────────────────────────────── */
  // Si cambió el texto (sin recortes: el servidor corta lo grande), la aprobación está anulada.
  const modificado = !!vista && (asunto.trim() !== vista.asunto.trim() || cuerpo.trim() !== vista.cuerpo.trim());
  const enlacesAhora = vista ? vivos(vista.enlaces, new Date()) : [];
  const ventanaAbierta = abierto === "enviar" && vista !== null;

  return (
    <div data-testid={`${idDom}-alcance`} className="mt-2 grid gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-3 text-left" aria-label={`Alcance de ${id}`}>
      <p className="text-[11px] leading-snug text-white/80">
        Mensaje de alcance · medio <b className="text-white">{vista?.medio ?? "…"}</b> · remitente <b className="text-white">{vista?.remitente ?? "…"}</b>
      </p>
      <p className="flex flex-wrap gap-1.5">
        {vista && vista.estadoPropuesta ? <span className={`${CHIP} border-white/15 text-white/80`}>{NOMBRE_ESTADO[vista.estadoPropuesta as keyof typeof NOMBRE_ESTADO] ?? vista.estadoPropuesta}</span> : null}
        {vista ? <span className={`${CHIP} ${vista.envio === "pendiente" ? "border-amber-300/40 bg-amber-400/10 text-amber-100" : vista.envio === "enviada" || vista.envio === "respondida" ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100" : "border-white/15 text-white/80"}`}>{NOMBRE_ENVIO[vista.envio]}</span> : null}
        {vista && vista.envio === "enviada" ? <span className={`${CHIP} border-white/15 text-white/85`}>{NOMBRE_SEGUIMIENTO[vista.seguimiento]}</span> : null}
        {vista?.suprimido ? <span className={`${CHIP} border-rose-300/40 bg-rose-400/10 text-rose-100`}>suprimido</span> : null}
      </p>
      {cargando ? (
        <p role="status" className="flex items-center gap-1.5 text-[11px] text-white/70">
          <Loader2 className={GIRO} aria-hidden /> Leyendo el estado del alcance…
        </p>
      ) : null}
      {error ? <p role="alert" className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-2 py-1.5 text-[11px] text-rose-100">{error}</p> : null}
      {mensaje ? <p role="status" className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2 py-1.5 text-[11px] text-emerald-100">{mensaje}</p> : null}
      {vista && !vista.destinatario ? (
        <p className="text-[11px] leading-snug text-amber-100">Sin canal publicado por la entidad: no hay destinatario honesto (R1) hasta que la ficha tenga uno.</p>
      ) : null}
      {vista ? (
        <>
          <div className="grid gap-1.5">
            <label htmlFor={`${idDom}-asunto`} className="text-[11px] font-medium text-white/85">
              Asunto
            </label>
            <input
              id={`${idDom}-asunto`}
              maxLength={300}
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              className={CAMPO}
            />
            <p className="text-right text-[10px] tabular-nums text-white/60">{asunto.length} / 300</p>
            <label htmlFor={`${idDom}-cuerpo`} className="text-[11px] font-medium text-white/85">
              Mensaje (texto plano, sin HTML crudo)
            </label>
            <textarea
              id={`${idDom}-cuerpo`}
              rows={6}
              maxLength={8000}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              className={`${CAMPO} min-h-[7rem]`}
            />
            <p className={`text-right text-[10px] tabular-nums ${palabrasDe(cuerpo) > 220 ? "text-rose-200" : "text-white/60"}`}>
              {palabrasDe(cuerpo)} palabras (tope 220) · {cuerpo.length} / 8000
            </p>
          </div>
          {ventanaAbierta && vista ? (
            <section data-testid={`${idDom}-ventana`} className="grid gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-400/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-100">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Última mirada antes de que el mensaje salga (R2)
              </p>
              {puedeEnviar(vista, modificado) ? (
                <>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                    <dt className="text-white/65">Remitente:</dt><dd className="text-white/85">{vista.remitente}</dd>
                    <dt className="text-white/65">Destinatario:</dt><dd className="break-words text-white/85">{vista.destinatario || "sin canal publicado (R1)"}</dd>
                    <dt className="text-white/65">Medio:</dt><dd className="text-white/85">{vista.medio}</dd>
                    <dt className="text-white/65">Asunto:</dt><dd className="text-white/85">{vista.asunto}</dd>
                  </dl>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/85">{vista.cuerpo}</p>
                  <ul className="grid gap-0.5 text-[11px]" aria-label="Enlaces verificados">
                    {enlacesAhora.length ? enlacesAhora.map((l) => (
                      <li key={l.url} className={l.ok ? "text-emerald-200" : "text-rose-200"}>
                        {l.ok ? "enlace vivo" : "sin respuesta"} · <span className="break-all font-mono">{l.url}</span>
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </li>
                    )) : <li className="text-white/70">Sin enlaces que verificar en el mensaje.</li>}
                  </ul>
                  <form onSubmit={confirmarEnvio} className="grid gap-1.5" data-testid={`${idDom}-confirmar`}>
                    <label htmlFor={`${idDom}-confirma`} className="text-[11px] font-medium text-emerald-100">
                      Escribe ENVIAR para confirmar que sale tal cual está (lo manda una persona, no un agente)
                    </label>
                    <input id={`${idDom}-confirma`} value={confirma} onChange={(e) => setConfirma(e.target.value)} className={CAMPO} autoComplete="off" />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => { setAbierto(null); setConfirma(""); }} className={`${BOTON} border-white/15 bg-white/5 text-white/85 hover:bg-white/10`}>
                        Cancelar
                      </button>
                      <button type="submit" disabled={confirma.trim() !== "ENVIAR" || ocupado !== null} className={`${BOTON} border-emerald-300/40 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25`}>
                        {ocupado === "enviar" ? <Loader2 className={GIRO} aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                        Confirmar el envío
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <p className="text-[11px] leading-snug text-amber-100">
                  {modificado
                    ? "Guarda el texto nuevo y apruébalo de nuevo: el texto cambió después de aprobarse."
                    : vista.motivos.length
                      ? vista.motivos.join(" ")
                      : "Cuando el texto esté aprobado y los enlaces vivos, aquí aparecerá la confirmación."}
                </p>
              )}
            </section>
          ) : null}
          {abierto === "reimaginar" ? (
            <form onSubmit={reimaginar} data-testid={`${idDom}-reimaginar`} className="grid gap-1.5 rounded-lg border border-violet-300/25 bg-violet-400/5 p-3">
              <label htmlFor={`${idDom}-notas`} className="text-[11px] font-medium text-white/85">
                Qué cambiar del mensaje
              </label>
              <textarea id={`${idDom}-notas`} rows={3} maxLength={2000} value={notas} onChange={(e) => setNotas(e.target.value)} className={`${CAMPO} min-h-[5rem]`} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAbierto(null)} className={`${BOTON} border-white/15 bg-white/5 text-white/85 hover:bg-white/10`}>Cancelar</button>
                <button type="submit" disabled={ocupado !== null} className={`${BOTON} border-violet-300/40 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20`}>
                  {ocupado === "reimaginar" ? <Loader2 className={GIRO} aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />} Pedir otra versión
                </button>
              </div>
            </form>
          ) : null}
          {abierto === "rechazar" ? (
            <form onSubmit={rechazar} data-testid={`${idDom}-rechazar`} className="grid gap-1.5 rounded-lg border border-rose-300/25 bg-rose-400/5 p-3">
              <label htmlFor={`${idDom}-motivo`} className="text-[11px] font-medium text-white/85">
                Motivo (opcional; el destinatario nunca lo ve)
              </label>
              <input id={`${idDom}-motivo`} maxLength={300} value={motivoRecha} onChange={(e) => setMotivoRecha(e.target.value)} className={CAMPO} />
              <label htmlFor={`${idDom}-no-volver`} className="flex min-h-11 cursor-pointer items-center gap-2 text-[11px] text-rose-100">
                <input id={`${idDom}-no-volver`} type="checkbox" checked={noVolver} onChange={(e) => setNoVolver(e.target.checked)} className="h-5 w-5 cursor-pointer accent-rose-300" />
                No volver a contactar (suprime al destinatario por su hash)
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAbierto(null)} className={`${BOTON} border-white/15 bg-white/5 text-white/85 hover:bg-white/10`}>Cancelar</button>
                <button type="submit" disabled={ocupado !== null} className={`${BOTON} border-rose-300/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20`}>
                  {ocupado === "rechazar" ? <Loader2 className={GIRO} aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />} Confirmar el rechazo
                </button>
              </div>
            </form>
          ) : null}
          {vista ? (
            <div className="flex flex-wrap items-end gap-1.5 border-t border-white/10 pt-2">
              <button
                type="button"
                onClick={() => void aprobar()}
                disabled={ocupado !== null || (!modificado && vista.aprobada && vista.huellaAprobada !== "")}
                className={`${BOTON} border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20`}
                data-testid={`${idDom}-aprobar`}
              >
                {ocupado === "aprobar-texto" || ocupado === "editar" ? <Loader2 className={GIRO} aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                Aprobar texto
              </button>
              <button type="button" onClick={() => setAbierto(abierto === "reimaginar" ? null : "reimaginar")} className={`${BOTON} border-violet-300/40 bg-violet-400/10 text-violet-100 hover:bg-violet-400/20`}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Reimaginar
              </button>
              <button type="button" onClick={() => setAbierto(abierto === "rechazar" ? null : "rechazar")} className={`${BOTON} border-rose-300/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20`}>
                <X className="h-3.5 w-3.5" aria-hidden /> Rechazar
              </button>
              <button
                type="button"
                onClick={() => setAbierto("enviar")}
                disabled={ocupado !== null || !puedeEnviar(vista, modificado)}
                className={`${BOTON} border-cyan-300/40 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/20`}
                data-testid={`${idDom}-enviar`}
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> Enviar
              </button>
            </div>
          ) : null}
          {vista && vista.envio === "enviada" ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Marcar el seguimiento">
              <span className="self-center text-[11px] text-white/75">Seguimiento:</span>
              {(["respondida", "sin-respuesta", "rebotada"] as EstadoEnvio[]).map((e) => (
                <button key={e} type="button" onClick={() => void marcar(e)} disabled={ocupado !== null} className={`${BOTON} border-white/15 bg-white/5 text-white/85 hover:bg-white/10`}>
                  {NOMBRE_ENVIO[e]}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
