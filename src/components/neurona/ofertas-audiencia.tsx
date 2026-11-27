"use client";

/*
 * OfertasAudiencia — «Lo que ofrece esta neurona» en los ajustes, junto a «NFC y cercanía» (NFC1126Q,
 * contrato: architecture/nfc-neuronas.md §15). Componente controlado: guardar lo hace quien lo monta.
 * Los límites de seguridad los aplica `establecerOferta` (lo ajeno nunca recibe recursos en «sí»).
 */

import { useState } from "react";
import { Gift, ShieldCheck } from "lucide-react";
import {
  AUDIENCIAS, RECURSOS, establecerOferta, ofertasPorDefecto, sanearAudiencia,
  type Audiencia, type NivelEscaneo, type NivelOferta, type OfertasAudiencia, type PerfilAudiencia, type Recurso,
} from "@/lib/nfc/ofertas-audiencia";
import type { PerfilVisible } from "@/lib/nfc/preferencias";

export interface PropsOfertasAudiencia {
  ofertas: OfertasAudiencia;
  onCambiar: (o: OfertasAudiencia) => void;
}

const NOMBRE_AUD: Record<Audiencia, string> = {
  mis_neuronas: "Mis neuronas y nodos", contactos: "Contactos", cuentas_starseed: "Cuentas de StarSeed",
  otras_senales: "Otras señales y aparatos",
};
const NOMBRE_RECURSO: Record<Recurso, string> = {
  capacidades: "Capacidades", almacenamiento: "Almacenamiento", senales: "Señales", internet: "Internet",
};
const NIVELES: { v: NivelOferta; t: string }[] = [{ v: "no", t: "No" }, { v: "pedir", t: "Ofrecer" }, { v: "si", t: "Automático" }];
const ELIGE = "cursor-pointer rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-sm";
const BOTON = "min-h-9 cursor-pointer rounded-lg border px-3 text-sm transition-colors duration-200";

export function OfertasAudiencia({ ofertas, onCambiar }: PropsOfertasAudiencia) {
  const [aud, setAud] = useState<Audiencia>("mis_neuronas");
  const p = ofertas[aud];
  const propia = aud === "mis_neuronas";
  const cambiar = (c: Partial<PerfilAudiencia>) => onCambiar(establecerOferta(ofertas, aud, c));
  const nivel = (id: string, valor: NivelOferta, poner: (n: NivelOferta) => void, etiqueta: string, max: NivelOferta = "si") => (
    <li key={id} className="flex min-w-0 items-center justify-between gap-2 text-sm">
      <span className="min-w-0 truncate">{etiqueta}</span>
      <select aria-label={etiqueta} className={ELIGE} value={valor} onChange={(e) => poner(e.target.value as NivelOferta)}>
        {NIVELES.filter((n) => max === "si" || n.v !== "si").map((n) => <option key={n.v} value={n.v}>{n.t}</option>)}
      </select>
    </li>
  );
  const sanea = sanearAudiencia(aud, p);

  return (
    <section className="w-full max-w-full space-y-4 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl" aria-label="Lo que ofrece esta neurona">
      <header className="flex items-center gap-2"><Gift className="h-5 w-5 shrink-0" aria-hidden /><h2 className="text-base font-semibold">Lo que ofrece esta neurona</h2></header>
      <p className="break-words text-sm opacity-80">Vale igual por NFC, Bluetooth, Wi‑Fi, LoRa o cable.</p>
      <div className="flex flex-wrap gap-2" role="tablist">
        {AUDIENCIAS.map((a) => (
          <button key={a} role="tab" aria-selected={a === aud} onClick={() => setAud(a)}
            className={`${BOTON} ${a === aud ? "border-emerald-400/60 bg-emerald-400/15" : "border-white/15"}`}>{NOMBRE_AUD[a]}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Perfil visible
          <select className={ELIGE} value={sanea.perfil} onChange={(e) => cambiar({ perfil: e.target.value as PerfilVisible })}>
            <option value="mostrar">Mostrar</option><option value="pedir">Pedir permiso</option><option value="ocultar">No mostrar</option>
          </select></label>
        <label className="grid gap-1 text-sm">Nivel de escaneo
          <select className={ELIGE} value={sanea.escaneo} onChange={(e) => cambiar({ escaneo: e.target.value as NivelEscaneo })}>
            <option value="basico" disabled={aud !== "mis_neuronas"}>Básico</option>
            <option value="normal" disabled={aud === "otras_senales"}>Normal</option>
            <option value="estricto">Estricto</option>
          </select></label>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {aud !== "otras_senales" && nivel("tarjetas", sanea.tarjetas, (n) => cambiar({ tarjetas: n }), "Tarjetas", "pedir")}
        {RECURSOS.map((r) => nivel(r, sanea[r], (n) => cambiar({ [r]: n }), NOMBRE_RECURSO[r], propia ? "si" : "pedir"))}
        {aud !== "otras_senales" && nivel("sala", sanea.salaSonido, (n) => cambiar({ salaSonido: n }), "Sala de sonido", propia ? "si" : "pedir")}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span className="flex min-w-0 items-center gap-2 text-xs opacity-70"><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />Con lo ajeno nada corre solo sin tu permiso.</span>
        <button className={`${BOTON} shrink-0 border-white/15`} onClick={() => onCambiar(ofertasPorDefecto())}>Volver a lo seguro</button>
      </footer>
    </section>
  );
}
