"use client";

/**
 * Protomolécula · PANEL DE PARÁMETROS. Un control por parámetro, agrupados por
 * átomo. El deslizador da vista previa en vivo con `alGesto` (no queda en el
 * historial) y emite UNA `Operacion` al soltar; el campo numérico emite una
 * `exacta` al pulsar Enter o salir (una sola vez por valor tecleado).
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { Zap } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { formatearValor, valorActual } from "@/lib/protomolecula/parametros";
import { claveDeAtomo, atributosClave } from "@/lib/variaciones/claves-protomolecula";
import type {
  Autor,
  CandidatoParametro,
  EstadoValores,
  Operacion,
  ParametroRef,
  ValorParametro,
} from "@/lib/protomolecula/tipos";

export interface PanelParametrosProps {
  candidatos: CandidatoParametro[];
  valores: EstadoValores;
  autor: Autor;
  alOperar: (op: Operacion) => void;
  alGesto?: (ref: ParametroRef, valor: number) => void;
  soloLectura?: boolean;
  ahora?: () => number;
  nuevoId?: () => string;
}

type Ctx = Required<Pick<PanelParametrosProps, "candidatos" | "valores" | "autor" | "alOperar">> &
  Pick<PanelParametrosProps, "alGesto" | "soloLectura"> & { ahora: () => number; nuevoId: () => string };

const idSeguro = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** «1,2» y «1.2» se leen igual; vacío o no numérico devuelve null. */
const leerNumero = (texto: string): number | null => {
  const n = Number(texto.trim().replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(n) ? n : null;
};

function emitir(ctx: Ctx, ref: ParametroRef, valor: ValorParametro, tipo: "exacta" | "disparo") {
  ctx.alOperar({
    id: ctx.nuevoId(),
    objetivo: ref,
    accion: tipo === "disparo" ? { tipo: "disparo" } : { tipo: "exacta", valor },
    autor: ctx.autor,
    origen: "mano",
    t: ctx.ahora(),
  });
}

/** Campo de valor exacto: emite UNA vez por valor tecleado (Enter o salir), sin doble emisión. */
function CampoExacto({ c, ctx, valor }: { c: CandidatoParametro; ctx: Ctx; valor: number }) {
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  const emitidoRef = useRef<string | null>(null);
  useEffect(() => {
    const fijado = String(valor).replace(".", ",");
    setTexto(fijado);
    emitidoRef.current = fijado; // lo que ya está aplicado no se vuelve a emitir
  }, [valor]);
  const confirmar = () => {
    const n = leerNumero(texto);
    if (n === null || n === valor || emitidoRef.current === texto.trim()) return;
    emitidoRef.current = texto.trim();
    emitir(ctx, c.ref, n, "exacta");
  };
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={texto}
      disabled={ctx.soloLectura}
      aria-label={`Valor exacto de ${c.parametro.nombre}`}
      aria-valuetext={formatearValor(c.parametro, valor)}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") { confirmar(); e.currentTarget.blur(); } }}
      onBlur={confirmar}
      className="w-28 text-right tabular-nums"
    />
  );
}

/** Deslizador con borrador local: el pulgar se mueve al arrastrar aunque el padre aún no aplique. */
function ControlNumerico({ c, ctx }: { c: CandidatoParametro; ctx: Ctx }) {
  const valor = Number(valorActual(ctx.valores, c.ref, c.parametro));
  const [borrador, setBorrador] = useState<number | null>(null);
  const mostrado = borrador ?? valor;
  const rangoOk = c.parametro.min !== undefined && c.parametro.max !== undefined;
  return (
    <div className="flex items-center gap-3">
      {rangoOk && (
        <Slider
          value={[mostrado]}
          min={c.parametro.min}
          max={c.parametro.max}
          step={c.parametro.paso ?? (c.parametro.tipo === "entero" ? 1 : 0.01)}
          disabled={ctx.soloLectura}
          aria-label={c.parametro.nombre}
          getAriaValueText={(v) => formatearValor(c.parametro, v)}
          className="w-40 cursor-pointer transition-opacity duration-200 data-[disabled]:cursor-not-allowed"
          onValueChange={(v) => { setBorrador(v[0]); ctx.alGesto?.(c.ref, v[0]); }}
          onValueCommit={(v) => { setBorrador(null); if (v[0] !== valor) emitir(ctx, c.ref, v[0], "exacta"); }}
        />
      )}
      <CampoExacto c={c} ctx={ctx} valor={mostrado} />
      <span className="min-w-14 text-xs text-muted-foreground">{formatearValor(c.parametro, mostrado)}</span>
    </div>
  );
}

function Control({ c, ctx }: { c: CandidatoParametro; ctx: Ctx }) {
  const p = c.parametro;
  const valor = valorActual(ctx.valores, c.ref, p);
  if (p.tipo === "numero" || p.tipo === "entero") return <ControlNumerico c={c} ctx={ctx} />;
  if (p.tipo === "booleano") {
    return (
      <Switch
        checked={Boolean(valor)}
        disabled={ctx.soloLectura}
        aria-label={p.nombre}
        aria-valuetext={formatearValor(p, valor)}
        onCheckedChange={(b) => emitir(ctx, c.ref, b, "exacta")}
      />
    );
  }
  if (p.tipo === "opcion") {
    return (
      <Select value={String(valor)} disabled={ctx.soloLectura} onValueChange={(s) => emitir(ctx, c.ref, s, "exacta")}>
        <SelectTrigger className="w-44 cursor-pointer" aria-label={p.nombre}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(p.opciones ?? []).map((o) => <SelectItem key={o} value={o} className="cursor-pointer">{o}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  return (
    <button
      type="button"
      disabled={ctx.soloLectura}
      aria-valuetext={formatearValor(p, valor)}
      className="inline-flex cursor-pointer items-center rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground transition-opacity duration-200 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => emitir(ctx, c.ref, true, "disparo")}
    >
      <Zap className="mr-1 h-4 w-4" />{p.nombre}
    </button>
  );
}

export function PanelParametros({
  candidatos,
  valores,
  autor,
  alOperar,
  alGesto,
  soloLectura = false,
  ahora = Date.now,
  nuevoId = idSeguro,
}: PanelParametrosProps) {
  const ctx: Ctx = { candidatos, valores, autor, alOperar, alGesto, soloLectura, ahora, nuevoId };
  if (candidatos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Esta molécula aún no tiene herramientas. Añade una desde «Añadir herramienta».
      </p>
    );
  }
  const grupos = new Map<string, CandidatoParametro[]>();
  for (const c of candidatos) {
    const clave = c.atomo ?? c.ref.atomoId;
    grupos.set(clave, [...(grupos.get(clave) ?? []), c]);
  }
  return (
    <div className="flex w-full max-w-2xl flex-col gap-5" aria-label="Panel de parámetros">
      {[...grupos.entries()].map(([nombreGrupo, cs]) => {
        // Generate data-ss-elemento attribute for atom sections
         const elementoAttrs = useMemo(() => {
          let clave = null;
          // For atom sections, use claveDeAtomo with the atom ID
          if (nombreGrupo) {
            clave = claveDeAtomo(nombreGrupo);
          }
          return clave ? atributosClave(clave) : {};
        }, [nombreGrupo]);

        return (
          <section 
            key={nombreGrupo} 
            aria-label={nombreGrupo} 
            className="flex flex-col gap-3"
            {...elementoAttrs}
          >
            <h3 className="text-sm font-medium text-muted-foreground">{nombreGrupo}</h3>
            {cs.map((c) => (
              <div key={`${c.ref.atomoId}::${c.ref.parametroId}`} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm">{c.parametro.nombre}</span>
                <Control c={c} ctx={ctx} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

export default PanelParametros;
