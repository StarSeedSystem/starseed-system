"use client";
/* Bots de un grupo o página en PoliGenesis (BOT1011J2 · contrato architecture/astraura-bots.md §3.2, §13): sus bots (`astraura_bots`
 * por dueno_tipo/dueno_id), el gobierno (`modoDe`) y CADA cambio por `decidirConfiguracion`: permitido → «bot.configurar»; votación →
 * «Proponer al grupo»; confirmación → «Pedir a un administrador» (propuesta que aprueba quien gestiona); nunca → el motivo. Pausar es
 * la salida de cualquier miembro y se confirma. Sin «bot.configurar» en Genesis (BOT1011J1) no se pinta ningún botón: «próximamente». */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot as IconoBot, ExternalLink, Loader2, Pause, Pencil, Vote } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { botPredeterminado } from "@/lib/astraura-bots/predeterminado";
import { decidirConfiguracion, DELEGACION_POR_DEFECTO_GRUPO, NIVEL_POR_DEFECTO, type CambioBot, type NivelBot } from "@/lib/astraura-bots/permisos";
import { acotar, esOrigen, esSentido, FORMAS_CUERPO, RASGOS, type Bot, type FormaCuerpo, type RolBot } from "@/lib/astraura-bots/tipos";
import { modoDe, proponer, propuestasDe } from "@/lib/genesis/entidades";
import { TIPOS_OPERACION, validarOperacion, type Ambito, type EntidadAmbito } from "@/lib/genesis/operaciones";
import { EditorBot } from "./editor-bot";
import { CuerpoBot } from "./cuerpo-bot";

type Delegado = "bajo" | "medio" | null;
export type ParcheBot = Partial<Pick<Bot, "nombre" | "personalidad" | "cuerpo" | "sentidosHabilitados" | "activo">> & { nivel?: NivelBot; delegado?: Delegado };
export interface OpBotConfigurar { tipo: "bot.configurar"; botId: string; cambio: CambioBot; valor: ParcheBot; motivo: string }
export type Respuesta = { ok: true } | { ok: false; motivo: string };
export interface ServiciosBots { listar: (e: EntidadAmbito) => Promise<Record<string, unknown>[]>; modo: (e: EntidadAmbito) => Promise<{ democratico: boolean }>;
  pendientes: (e: EntidadAmbito) => Promise<{ id: string; titulo: string }[]>; enviar: (e: EntidadAmbito, op: OpBotConfigurar, como: "aplicar" | "proponer") => Promise<Respuesta> }
export interface BotEntidad { bot: Bot; nivel: NivelBot; delegado: Delegado }

const OP_CONOCIDA = (TIPOS_OPERACION as readonly string[]).includes("bot.configurar");
const NIVELES: readonly string[] = ["nada", "proponer", "aplicar-bajo", "aplicar"];
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
const num = (x: unknown, defecto: number, min = 0, max = 1) => (typeof x === "number" ? acotar(x, min, max) : defecto);

/** Fila de `astraura_bots` → bot saneado (con la columna `datos` o sin ella). El gobierno es el de la entidad. */
export function botDeFila(f: Record<string, unknown>, e: EntidadAmbito, democratico: boolean): BotEntidad {
  const d = obj(f.datos), p = obj(d.personalidad), c = obj(d.cuerpo), cuentaId = String(f.cuenta_id ?? ""), base = botPredeterminado(e.id, cuentaId);
  const bot: Bot = { ...base, id: String(f.id), nombre: String(f.nombre ?? d.nombre ?? "Bot común").slice(0, 120), origen: esOrigen(d.origen) ? d.origen : "astraura",
    gobierno: democratico ? "democratico" : "jerarquico", dueno: { tipo: e.tipo, id: e.id, cuentaId }, activo: f.activo !== false,
    personalidad: Object.fromEntries(RASGOS.map((r) => [r, num(p[r], base.personalidad[r])])) as Bot["personalidad"],
    cuerpo: { forma: (FORMAS_CUERPO as readonly string[]).includes(String(c.forma)) ? (c.forma as FormaCuerpo) : base.cuerpo.forma, tono: num(c.tono, base.cuerpo.tono, 0, 360), escala: num(c.escala, base.cuerpo.escala, 0.5, 2), ...(typeof c.avatarRef === "string" ? { avatarRef: c.avatarRef } : {}) },
    sentidosHabilitados: Array.isArray(d.sentidosHabilitados) ? d.sentidosHabilitados.filter(esSentido) : base.sentidosHabilitados };
  return { bot, nivel: NIVELES.includes(String(d.nivel)) ? (d.nivel as NivelBot) : NIVEL_POR_DEFECTO, delegado: d.delegado === "bajo" || d.delegado === "medio" ? d.delegado : null };
}

const POR_DEFECTO: ServiciosBots = {
  listar: async (e) => { const r = await createClient().from("astraura_bots").select("*").eq("dueno_tipo", e.tipo).eq("dueno_id", e.id).limit(50); if (r.error) throw new Error(r.error.message); return (r.data ?? []) as Record<string, unknown>[]; },
  modo: modoDe,
  pendientes: async (e) => { const r = await propuestasDe(e); return r.ok ? r.lista.filter((p) => p.estado === "open" && String(p.op?.tipo) === "bot.configurar").map((p) => ({ id: p.id, titulo: p.titulo })) : []; },
  enviar: async (e, op, como) => {
    const ambito: Ambito = { tipo: "entidad", entidad: e }, v = validarOperacion(op, { ambito });
    if (!v.ok) return { ok: false, motivo: v.problemas.join(" ") };
    if (como === "proponer") { const r = await proponer(e, v.op); return r.ok ? { ok: true } : r; }
    const [{ aplicarOperacion }, { puertosDelOs }, { anotar }] = await Promise.all([import("@/lib/genesis/aplicar"), import("@/lib/genesis/puertos-os"), import("@/lib/genesis/historial")]);
    const r = await aplicarOperacion(v.op, ambito, puertosDelOs()); if (r.ok) await anotar(r.entrada); return r.ok ? { ok: true } : r;
  },
};
const ETIQUETA: Partial<Record<string, string>> = { nada: "Cambiar configuración", votacion: "Proponer al grupo", confirmacion: "Pedir a un administrador" };
const btn = "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/85 transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50", ico = "h-3.5 w-3.5";

export function BotsEntidad({ entidad, rol, servicios }: { entidad: EntidadAmbito; rol: RolBot; servicios?: Partial<ServiciosBots> }) {
  const [datos, setDatos] = useState<{ bots: BotEntidad[]; democratico: boolean; pendientes: { id: string; titulo: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<{ que: "editar" | "pausar"; b: BotEntidad } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const activa = OP_CONOCIDA || servicios?.enviar !== undefined;
  const cargar = useCallback(async () => {
    const s = { ...POR_DEFECTO, ...servicios };
    try { const [filas, modo, pendientes] = await Promise.all([s.listar(entidad), s.modo(entidad), s.pendientes(entidad)]); setDatos({ bots: filas.map((f) => botDeFila(f, entidad, modo.democratico)), democratico: modo.democratico, pendientes }); }
    catch (e) { setError(`No se pudieron leer los bots de «${entidad.nombre}»: ${e instanceof Error ? e.message : "sin red"}.`); }
  }, [entidad, servicios]);
  useEffect(() => { void cargar(); }, [cargar]);
  const enviar = async (b: BotEntidad, cambios: [CambioBot, ParcheBot][], motivo: string) => {
    const s = { ...POR_DEFECTO, ...servicios }, textos: string[] = []; setOcupado(true);
    try { for (const [cambio, valor] of cambios) {
      const d = decidirConfiguracion(b.bot, rol, cambio);
      if (d.requiere === "nunca") { textos.push(d.motivo); continue; }
      const como = d.permitido || cambio === "pausar" ? "aplicar" : "proponer"; // pausar: la confirmación ya se dio en el diálogo
      const r = await s.enviar(entidad, { tipo: "bot.configurar", botId: b.bot.id, cambio, valor, motivo }, como);
      textos.push(r.ok ? (como === "aplicar" ? `«${cambio}» aplicado y anotado en el registro.` : `«${cambio}» propuesto: se decide en Decisiones.`) : r.motivo);
    } } catch (e) { textos.push(`No se pudo enviar: ${e instanceof Error ? e.message : "sin red"}.`); } // nunca deja los botones bloqueados
    setAviso(textos.join(" ") || "No había nada que cambiar."); setOcupado(false); setAbierto(null); await cargar();
  };
  const guardar = (b: BotEntidad) => (nuevo: Bot, nivel: NivelBot) => {
    const j = JSON.stringify, cambios: [CambioBot, ParcheBot][] = [];
    if (nuevo.nombre !== b.bot.nombre || j(nuevo.personalidad) !== j(b.bot.personalidad)) cambios.push(["personalidad", { nombre: nuevo.nombre, personalidad: nuevo.personalidad }]);
    if (j(nuevo.cuerpo) !== j(b.bot.cuerpo)) cambios.push(["cuerpo", { cuerpo: nuevo.cuerpo }]);
    if (j([...nuevo.sentidosHabilitados].sort()) !== j([...b.bot.sentidosHabilitados].sort())) cambios.push(["sentidos", { sentidosHabilitados: nuevo.sentidosHabilitados }]);
    if (nivel !== b.nivel) cambios.push(["permisos", { nivel }]);
    void enviar(b, cambios, "Cambio de configuración pedido desde PoliGenesis.");
  };

  if (error) return <p className="rounded-xl border border-white/10 p-3 text-sm text-white/70">{error}</p>;
  if (!datos) return <p className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando los bots de «{entidad.nombre}»…</p>;
  const { bots, democratico, pendientes } = datos;
  return (
    <section aria-label="Bots de la entidad" className="space-y-2 rounded-2xl border border-violet-400/20 bg-violet-500/[0.04] p-3" data-testid="bots-entidad">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white/85"><IconoBot className="h-4 w-4 text-violet-300" aria-hidden /> Bots de {entidad.nombre}<span className="text-[11px] font-normal text-white/50">· gobierno {democratico ? "democrático: los cambios se votan" : "jerárquico: los aprueba quien gestiona"}</span></h3>
      {!activa ? <p className="text-[11px] text-amber-200/80">próximamente: cambiar o pausar un bot común llega con la operación «bot.configurar» de Genesis (BOT1011J1).</p> : null}
      {bots.length === 0 ? <p className="text-xs text-white/60" data-testid="bots-entidad-vacio">«{entidad.nombre}» todavía no tiene ningún bot común (o tu cuenta aún no puede leerlo). próximamente: crearlo desde aquí con la operación «bot.crear».</p> : null}
      <ul className="space-y-2">{bots.map((b) => {
        const d = decidirConfiguracion(b.bot, rol, "personalidad"), dem = b.bot.gobierno === "democratico";
        return (<li key={b.bot.id} className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-sm text-white/90">{b.bot.nombre} <span className="text-[11px] text-white/50">· {b.bot.activo ? "activo" : "en pausa (reanudarlo sigue el gobierno)"}{dem ? ` · ${b.delegado ? `delegado lo de riesgo ${b.delegado}` : "sin delegación: todo se vota"}` : ""}</span></p>
          {d.requiere === "nunca" ? <p className="text-[11px] text-white/55">{d.motivo}</p> : activa ? (<div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={ocupado} onClick={() => setAbierto({ que: "editar", b })}>{d.requiere === "votacion" ? <Vote className={ico} aria-hidden /> : <Pencil className={ico} aria-hidden />}{ETIQUETA[d.requiere] ?? d.motivo}</button>
            {dem && !b.delegado ? <button type="button" className={btn} disabled={ocupado} onClick={() => void enviar(b, [["permisos", { delegado: DELEGACION_POR_DEFECTO_GRUPO }]], "El grupo delega en su bot lo de riesgo bajo: organizar y mover sin votar cada vez.")}><Vote className={ico} aria-hidden />Delegar en el bot (riesgo bajo)</button> : null}
            {b.bot.activo ? <button type="button" className={btn} disabled={ocupado} onClick={() => setAbierto({ que: "pausar", b })}><Pause className={ico} aria-hidden />Pausar el bot común</button> : null}
          </div>) : null}
          {abierto?.que === "editar" && abierto.b.bot.id === b.bot.id ? <div role="dialog" aria-label={`Cambiar ${b.bot.nombre}`} className="rounded-lg border border-white/10 p-3"><EditorBot bot={b.bot} nivel={b.nivel} onGuardar={guardar(b)} onCerrar={() => setAbierto(null)} /></div> : null}
        </li>);
      })}</ul>
      {abierto?.que === "pausar" ? (<div role="alertdialog" aria-label="Confirmar pausa" className="space-y-2 rounded-lg border border-amber-400/30 p-3 text-xs text-white/80"><p>Pausar «{abierto.b.bot.nombre}» para todo el grupo: apaga sus sentidos y suelta lo pendiente. Queda en el registro.</p>
        <div className="flex justify-end gap-2"><button type="button" className={btn} onClick={() => setAbierto(null)}>Cancelar</button><button type="button" className={btn} disabled={ocupado} onClick={() => void enviar(abierto.b, [["pausar", { activo: false }]], "Pausa del bot común (salida siempre).")}>Pausar para todos</button></div>
      </div>) : null}
      {aviso ? <p role="status" className="text-[11px] text-cyan-200/90">{aviso}</p> : null}
      {pendientes.length ? (<div className="space-y-1"><h4 className="text-xs font-semibold text-white/70">Propuestas pendientes de los bots</h4>
        {pendientes.map((p) => <Link key={p.id} href={`/decisiones?p=${p.id}`} className="flex cursor-pointer items-center gap-1 text-[11px] text-cyan-200 hover:underline">{p.titulo} <ExternalLink className="h-3 w-3" aria-hidden /></Link>)}</div>) : null}
    </section>
  );
}
