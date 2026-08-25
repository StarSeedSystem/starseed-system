"use client";

/**
 * vinculos-panel.tsx — pantalla de Vínculos (cierre de deuda: "genesis-
 * client.ts ya tiene el CRUD completo de vínculos y nunca se le hizo
 * pantalla").
 * ----------------------------------------------------------------------------
 * `Vinculo`/`TipoVinculo` son del contrato desde OLA 1: mentor, aprendiz,
 * pareja, rival, aliado, delegación, supervisión, hermandad — con fuerza
 * 0–1 y bidireccionalidad. `ser-ficha.tsx` lo dice explícitamente en su
 * propia cabecera: "vínculos tienen cliente completo pero NO tienen editor
 * aquí — se deja fuera a propósito". Este panel ES ese editor, en su
 * propio sitio: `GET /api/genesis/vinculos` no lleva `{id}` de ser (es
 * global, como `fetchGenesisComunidades`/`fetchGenesisEspacios`), así que
 * — igual que `HerramientasLista`/`BotsPredeterminadosPanel` — se planta
 * con su propia tarjeta y carga sus propios datos: se puede montar
 * directamente con solo `target`, sin que un contenedor externo tenga que
 * resolverle nada.
 *
 * Que se pueda ver quién está unido a quién y por qué, crear un vínculo y
 * deshacerlo. Los nombres de los seres se resuelven contra `fetchGenesisSeres`
 * con `nombrePorId` (de `../genesis-logic`, no reimplementado aquí); si esa
 * lista no carga, cada fila sigue enseñando el id crudo — nunca una fila en
 * blanco ni una excepción.
 *
 * Mismo idioma visual que `soberania-panel.tsx`/`cerebros-panel.tsx`:
 * tarjetas `SUB`, `Badge` con icono+palabra (nunca solo color), campos
 * `Field`/`INPUT`/`SELECT`/`TEXTAREA` de `s158/shared`, `Switch` para
 * bidireccional. El formulario de creación es controlado (`useState`,
 * como `ritual-creacion.tsx`) porque valida ANTES de enviar — a diferencia
 * de los paneles de edición de la ficha, que son de campo suelto con
 * `defaultValue`/`onBlur`.
 *
 * Deshacer un vínculo es una acción directa, sin diálogo de confirmación —
 * mismo criterio que `propuestas-bandeja.tsx` (aceptar/descartar) y que el
 * "Quitar" de `cerebros-panel.tsx`: `useConfirm()` se reserva para lo
 * irreversible de verdad (borrar un ser entero, en `ser-ficha.tsx`).
 */
import { useState } from "react";
import { Link2, Plus, RefreshCw, Unlink, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { SerListado, Vinculo } from "@/lib/astraura/genesis-types";
import {
  createGenesisVinculo, deleteGenesisVinculo, fetchGenesisSeres, fetchGenesisVinculos, type GenesisTarget,
} from "@/lib/astraura/genesis-client";
import { Switch } from "@/components/ui/switch";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, Field, SELECT, SUB, SectionTitle, TEXTAREA, fmtTs, useBusy, useS158Load,
} from "../../s158/shared";
import { nombrePorId } from "../genesis-logic";
import {
  FORMULARIO_VINCULO_VACIO, TIPOS_VINCULO, describirVinculo, etiquetaTipoVinculo, fuerzaPct, ordenarVinculosPorFecha,
  resumirVinculos, solicitudDesdeFormulario, tonoTipoVinculo, validarFormularioVinculo, vinculosDeSer, vinculosSeguros,
  type FormularioVinculo,
} from "./vinculos-logic";

/* ─────────────────────────────── Crear vínculo ─────────────────────────────── */

function CrearVinculoForm({
  target,
  seres,
  seresLoading,
  seresError,
  disabled,
  onCreado,
}: {
  target: GenesisTarget;
  seres: SerListado[];
  seresLoading?: boolean;
  seresError?: string;
  disabled?: boolean;
  onCreado: (v: Vinculo) => void;
}) {
  const { busy, wrap } = useBusy();
  const [form, setForm] = useState<FormularioVinculo>(FORMULARIO_VINCULO_VACIO);
  const [errorLocal, setErrorLocal] = useState("");
  const ocupado = busy !== "" || Boolean(disabled);

  function crear() {
    const invalido = validarFormularioVinculo(form);
    if (invalido) { setErrorLocal(invalido); return; }
    setErrorLocal("");
    void wrap("crear", async () => {
      const r = await createGenesisVinculo(target, solicitudDesdeFormulario(form));
      if (!r.ok) { toast.error("No se pudo crear el vínculo", { description: r.error }); return; }
      toast.success("Vínculo creado", { description: describirVinculo(r.data, nombrePorId(r.data.origenId, seres), nombrePorId(r.data.destinoId, seres)) });
      setForm(FORMULARIO_VINCULO_VACIO);
      onCreado(r.data);
    });
  }

  return (
    <div className={cn(SUB, "space-y-2 p-3")}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white/85">
        <Plus className="h-3.5 w-3.5 text-rose-300" aria-hidden="true" /> Nuevo vínculo
      </p>

      {seresLoading && seres.length === 0 && <p className="text-[10px] text-white/45">Cargando seres…</p>}
      {!seresLoading && seresError && seres.length === 0 && (
        <p className="text-[10px] text-amber-200/85">No se pudo cargar la lista de seres: {seresError}. Sin ella no se puede elegir a quién unir.</p>
      )}
      {!seresLoading && !seresError && seres.length < 2 && (
        <p className="text-[10px] text-white/45">Hacen falta al menos dos seres para crear un vínculo entre ellos.</p>
      )}

      {seres.length >= 2 && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Origen">
              <select
                className={SELECT}
                value={form.origenId}
                disabled={ocupado}
                aria-label="Ser que origina el vínculo"
                onChange={(e) => setForm((v) => ({ ...v, origenId: e.target.value }))}
              >
                <option value="">— elige —</option>
                {seres.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Field>
            <Field label="Destino">
              <select
                className={SELECT}
                value={form.destinoId}
                disabled={ocupado}
                aria-label="Ser al que se dirige el vínculo"
                onChange={(e) => setForm((v) => ({ ...v, destinoId: e.target.value }))}
              >
                <option value="">— elige —</option>
                {seres.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </Field>
            <Field label="Tipo">
              <select
                className={SELECT}
                value={form.tipo}
                disabled={ocupado}
                aria-label="Tipo de vínculo"
                onChange={(e) => setForm((v) => ({ ...v, tipo: e.target.value }))}
              >
                <option value="">— elige —</option>
                {TIPOS_VINCULO.map((t) => <option key={t} value={t}>{etiquetaTipoVinculo(t)}</option>)}
              </select>
            </Field>
            <Field label={`Fuerza — ${fuerzaPct(form.fuerza)}%`} hint="0 a 1: cuánto pesa este vínculo al orquestar.">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="h-2 w-full cursor-pointer accent-rose-400 disabled:cursor-not-allowed"
                value={form.fuerza}
                disabled={ocupado}
                aria-label="Fuerza del vínculo"
                aria-valuetext={`${fuerzaPct(form.fuerza)} por ciento`}
                onChange={(e) => setForm((v) => ({ ...v, fuerza: Number(e.target.value) }))}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-[11px] text-white/80">
            <Switch
              checked={form.bidireccional}
              disabled={ocupado}
              aria-label="El vínculo es bidireccional"
              onCheckedChange={(v) => setForm((f) => ({ ...f, bidireccional: v }))}
            />
            Bidireccional — pesa igual en los dos sentidos
          </label>

          <Field label="Motivo — por qué existe" hint="Opcional, pero es lo que responde a «por qué».">
            <textarea
              className={cn(TEXTAREA, "min-h-[52px]")}
              value={form.motivo}
              disabled={ocupado}
              placeholder="p. ej. le enseña astrofísica desde que nació"
              aria-label="Motivo del vínculo"
              onChange={(e) => setForm((v) => ({ ...v, motivo: e.target.value }))}
            />
          </Field>

          {errorLocal && <p className="text-[11px] text-rose-300" role="alert">{errorLocal}</p>}

          <button type="button" className={BTN_PRIMARY} disabled={ocupado} onClick={crear} aria-label="Crear el vínculo">
            <BusyIcon busy={busy === "crear"} icon={Link2} /> Crear vínculo
          </button>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── Fila de vínculo ─────────────────────────────── */

function VinculoRow({
  v,
  nombreOrigen,
  nombreDestino,
  disabled,
  quitando,
  onQuitar,
}: {
  v: Vinculo;
  nombreOrigen: string;
  nombreDestino: string;
  disabled?: boolean;
  quitando?: boolean;
  onQuitar: () => void;
}) {
  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90" title={describirVinculo(v, nombreOrigen, nombreDestino)}>
          {nombreOrigen} <span className="text-white/40" aria-hidden="true">{v.bidireccional ? "↔" : "→"}</span> {nombreDestino}
        </p>
        <Badge tone={tonoTipoVinculo(v.tipo)}>{etiquetaTipoVinculo(v.tipo)}</Badge>
        <Badge tone="border-white/15 bg-white/[0.04] text-white/70">fuerza {fuerzaPct(v.fuerza)}%</Badge>
        {/* Bidireccional también se dice con palabra, no solo con la flecha — la flecha es decoración (aria-hidden arriba). */}
        {v.bidireccional && <Badge tone="border-violet-400/25 bg-violet-500/10 text-violet-100/90">bidireccional</Badge>}
        <button
          type="button"
          className={cn(BTN_DANGER, "ml-auto px-1.5 py-0.5")}
          disabled={disabled}
          onClick={onQuitar}
          aria-label={`Deshacer el vínculo entre ${nombreOrigen} y ${nombreDestino}`}
        >
          <BusyIcon busy={Boolean(quitando)} icon={Unlink} />
        </button>
      </div>
      {/* El "por qué" — nunca escondido detrás de un tooltip. */}
      {v.motivo && <p className="text-[10px] leading-snug text-white/60">{v.motivo}</p>}
      <p className="text-[10px] text-white/35">Creado {fmtTs(v.creadoEn) || "en fecha desconocida"}.</p>
    </div>
  );
}

/* ─────────────────────────────── Panel ─────────────────────────────── */

export interface VinculosPanelProps {
  target: GenesisTarget;
}

export function VinculosPanel({ target }: VinculosPanelProps) {
  const seresQ = useS158Load(fetchGenesisSeres, target, 30_000);
  const vinculosQ = useS158Load(fetchGenesisVinculos, target, 20_000);
  const { busy, wrap } = useBusy();
  const [filtroSerId, setFiltroSerId] = useState("");

  const seres = seresQ.data ?? [];
  const vinculos = ordenarVinculosPorFecha(vinculosSeguros(vinculosQ.data));
  const visibles = filtroSerId ? vinculosDeSer(vinculos, filtroSerId) : vinculos;
  const resumen = resumirVinculos(vinculos);

  function quitar(v: Vinculo) {
    void wrap(`quitar:${v.id}`, async () => {
      const r = await deleteGenesisVinculo(target, v.id);
      if (!r.ok) { toast.error("No se pudo deshacer el vínculo", { description: r.error }); return; } // si falla, se queda visible: nunca un "deshecho" que el backend no confirmó
      toast.success("Vínculo deshecho");
      void vinculosQ.reload(true);
    });
  }

  return (
    <div className={cn(CARD, "space-y-3 p-3")}>
      <SectionTitle
        icon={Link2}
        title={`Vínculos (${resumen.total})`}
        tone="text-rose-300"
        hint="Quién está unido a quién y por qué: mentor, aprendiz, pareja, rival, aliado, delegación, supervisión o hermandad — con una fuerza de 0 a 1, y en los dos sentidos cuando es bidireccional."
        right={
          <>
            {seres.length > 1 && vinculos.length > 0 && (
              <label className="flex items-center gap-1.5 text-[10px] text-white/55">
                <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
                <select
                  className={cn(SELECT, "py-0.5 text-[10px]")}
                  value={filtroSerId}
                  aria-label="Filtrar vínculos por ser"
                  onChange={(e) => setFiltroSerId(e.target.value)}
                >
                  <option value="">todos</option>
                  {seres.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
            )}
            <button
              type="button"
              className={BTN}
              onClick={() => { void seresQ.reload(); void vinculosQ.reload(); }}
              aria-label="Recargar vínculos y seres"
            >
              <RefreshCw className={cn("h-3 w-3", (seresQ.loading || vinculosQ.loading) && "animate-spin")} aria-hidden="true" />
            </button>
          </>
        }
      />

      <CrearVinculoForm
        target={target}
        seres={seres}
        seresLoading={seresQ.loading}
        seresError={seresQ.error}
        disabled={busy !== ""}
        onCreado={() => void vinculosQ.reload(true)}
      />

      {vinculosQ.data === null && <Empty loading={vinculosQ.loading} error={vinculosQ.error} text="El backend no expone vínculos todavía." />}

      {vinculosQ.data !== null && visibles.length === 0 && (
        <p className="text-[11px] text-white/55">
          {filtroSerId ? `${nombrePorId(filtroSerId, seres)} no tiene vínculos todavía.` : "Todavía no hay ningún vínculo."}
        </p>
      )}

      {visibles.length > 0 && (
        <div className="space-y-1.5">
          {visibles.map((v) => (
            <VinculoRow
              key={v.id}
              v={v}
              nombreOrigen={nombrePorId(v.origenId, seres)}
              nombreDestino={nombrePorId(v.destinoId, seres)}
              disabled={busy !== ""}
              quitando={busy === `quitar:${v.id}`}
              onQuitar={() => quitar(v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default VinculosPanel;
