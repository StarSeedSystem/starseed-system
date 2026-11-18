"use client";

/*
 * Ramas por proveedor (MOD1116 · MQC4): un bloque plegable por cada rama de `ramasPorProveedor` (MQC3),
 * con el proveedor, sus modelos de MÁS a MENOS capaz, la insignia de encaje («Cabe en esta neurona» /
 * «Justo» / «No cabe») y las marcas «Más capaz que cabe» y «Más ligero». En las ramas de API, el precio
 * por millón de tokens con su fecha de comprobación y el aviso «lo que envías llega a un tercero».
 * Presentacional: las ramas llegan ya calculadas del panel. Una rama de API sin filtros no se muestra
 * si el perfil de la cuenta no la permite (`sinFiltrosPermitido`).
 */

import { cn } from "@/lib/utils";
import { fechaCorta } from "@/lib/astraura/modelos/catalogo";
import type { ModeloApi } from "@/lib/astraura/modelos/modelos-api";
import type { ElementoRama, Rama } from "@/lib/astraura/modelos/ramas-proveedor";
import type { Veredicto } from "@/lib/astraura/modelos/tipos";
import { gbTxt } from "./modelos-ui";

const ETIQUETA_CABE: Record<Veredicto, string> = {
  recomendado: "Cabe en esta neurona",
  justo: "Justo",
  "no-cabe": "No cabe",
  "falta-disco": "Falta disco",
};

const COLOR_CABE: Record<Veredicto, string> = {
  recomendado: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  justo: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  "no-cabe": "border-rose-500/30 bg-rose-500/15 text-rose-300",
  "falta-disco": "border-sky-500/30 bg-sky-500/15 text-sky-300",
};

const usdTxt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ","));

/** Insignia de encaje del modelo en ESTA neurona, con las palabras de la página y el color de la vecina. */
function InsigniaCabeza({ x }: { x: ElementoRama }) {
  if (!x.veredicto) return null;
  const texto =
    x.veredicto === "falta-disco" && x.liberarGb !== null
      ? `Falta disco: libera ${gbTxt(x.liberarGb)}`
      : ETIQUETA_CABE[x.veredicto];
  return (
    <span data-cabe={x.veredicto} className={cn("whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px]", COLOR_CABE[x.veredicto])}>
      {texto}
    </span>
  );
}

/** Precio por millón de tokens y fecha de comprobación del modelo de API, con el aviso del tercero. */
function PrecioApi({ m }: { m: ModeloApi }) {
  return (
    <span className="text-white/45" data-precio-api={m.id}>
      entrada {usdTxt(m.precioEntradaUsd)} $/M · salida {usdTxt(m.precioSalidaUsd)} $/M · comprobado el {fechaCorta(m.comprobado)} · lo que envías llega a un tercero
    </span>
  );
}

function RamaBloque({ r, apis }: { r: Rama; apis: readonly ModeloApi[] }) {
  const apiDe = new Map(apis.map((a) => [a.id, a]));
  return (
    <li data-proveedor={r.proveedor} data-via={r.via} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-white/90">{r.proveedor}</span>
          <span className="text-[11px] text-white/45">{r.via === "local" ? "se ejecuta en esta neurona" : "proveedor externo de pago"}</span>
          <span className="text-[11px] text-white/35">{r.modelos.length === 1 ? "1 modelo" : `${r.modelos.length} modelos`}</span>
        </summary>
        {r.nota && <p className="text-[11px] text-amber-300" data-campo="nota">{r.nota}</p>}
        <ul className="mt-1 space-y-1">
          {r.modelos.map((x) => {
            const api = r.via === "api" ? apiDe.get(x.id) : undefined;
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
                <span className="font-mono">{x.etiqueta}</span>
                {r.mejorQueCabe === x.id && <span className="rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-cyan-100">Más capaz que cabe</span>}
                {r.masLigero === x.id && r.mejorQueCabe !== x.id && <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/60">Más ligero</span>}
                <InsigniaCabeza x={x} />
                {api && <PrecioApi m={api} />}
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

export function RamasProveedor({
  ramas,
  apis,
  sinFiltrosPermitido,
}: {
  ramas: readonly Rama[];
  apis: readonly ModeloApi[];
  sinFiltrosPermitido: boolean;
}) {
  // Ramas de API sin filtros: solo si el perfil de la cuenta lo permite. Las locales quedan como llegan.
  const visibles = ramas.filter((r) => r.via !== "api" || sinFiltrosPermitido);
  if (visibles.length === 0) return null;
  return (
    <section aria-label="Ramas por proveedor" className="space-y-2" data-seccion="ramas" data-testid="ramas-proveedor">
      <h3 className="text-[13px] font-semibold text-white/90">Ramas por proveedor</h3>
      <p className="text-[12px] text-white/55">
        Cada proveedor con sus modelos de más a menos capaz y qué cabe en esta neurona. En los de pago, el precio por millón de tokens: lo que envías llega a un tercero.
      </p>
      <ul className="space-y-2">{visibles.map((r) => <RamaBloque key={`${r.via}-${r.proveedor}`} r={r} apis={apis} />)}</ul>
    </section>
  );
}
