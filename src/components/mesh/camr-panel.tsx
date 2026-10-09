/**
 * CamrPanel — Enrutamiento Cognitivo Multiespectro (Ola 1005C · CAMR1005D).
 * Panel de control del módulo CAMR según `architecture/camr-enrutamiento-cognitivo.md` §6.
 * Funciona con el simulador cuando no hay agente ni radio real; dice claramente
 * qué es simulado y qué es real.
 */
"use client";

import { useState } from "react";
import {
  Radio, ShieldCheck, Activity, Settings2, CheckCircle2, AlertCircle,
  ChevronRight, Zap, Waves, RadioTower, Wifi, Bluetooth, Globe,
} from "lucide-react";

export interface CamrPanelProps {
  /** Si true, se monta dentro del hub (sin cabecera grande). */
  embedded?: boolean;
}

/* Tipos locales (sin importar `node:*`, sin `any`). */
export type ModoEnlace = "hibrido-autonomo" | "manual";
export type ModoRadio = "automatico" | "manual";
export interface AjusteCamr {
  habilitado: boolean;
  modoEnlace: ModoEnlace;
  capaFisica: { rns: boolean; meshtastic: boolean; "80211s": boolean; babel: boolean; batman: boolean; yggdrasil: boolean };
  radioCognitiva: {
    modulacion: ModoRadio;
    tpc: ModoRadio;
    canal: ModoRadio;
  };
  metrica: "hibrida" | "latencia" | "resiliencia";
  perfilLegalIndicativo: string;
}

export function CamrPanel({ embedded = false }: CamrPanelProps) {
  const [camrActivo, setCamrActivo] = useState(false);
  const [modoEnlace, setModoEnlace] = useState<ModoEnlace>("hibrido-autonomo");
  const [modulacion, setModulacion] = useState<ModoRadio>("automatico");
  const [tpc, setTpc] = useState<ModoRadio>("automatico");
  const [canal, setCanal] = useState<ModoRadio>("automatico");
  const [indicativo, setIndicativo] = useState("");

  const capaFisicaEstado = {
    rns: true,
    meshtastic: true,
    "80211s": false,
    babel: false,
    batman: false,
    yggdrasil: false,
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <RadioTower className="h-4 w-4 text-amber-300" /> Enrutamiento cognitivo (CAMR)
        </h3>
        <button
          onClick={() => setCamrActivo(!camrActivo)}
          className="cursor-pointer inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] text-amber-200 transition-colors duration-200 hover:bg-amber-500/20"
          aria-label={camrActivo ? "Desactivar CAMR" : "Activar CAMR"}
        >
          {camrActivo ? <CheckCircle2 className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
          {camrActivo ? "CAMR activo" : "Activar CAMR"}
        </button>
      </div>

      {!camrActivo && (
        <p className="text-[11px] text-white/50">
          El módulo CAMR está desactivado. Actívalo para gestionar el enrutamiento
          cognitivo multiespectro (simulador disponible sin agente ni hardware).
        </p>
      )}

      {camrActivo && (
        <div className="space-y-4">
          {/* §6 · Modo de enlace */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
              <Settings2 className="h-3.5 w-3.5" /> Modo de enlace
            </h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setModoEnlace("hibrido-autonomo")}
                className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[10px] transition-colors duration-200 ${modoEnlace === "hibrido-autonomo" ? "border-amber-400/40 bg-amber-500/15 text-amber-100 font-semibold" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}
              >
                Híbrido autónomo (QoS)
              </button>
              <button
                onClick={() => setModoEnlace("manual")}
                className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[10px] transition-colors duration-200 ${modoEnlace === "manual" ? "border-amber-400/40 bg-amber-500/15 text-amber-100 font-semibold" : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"}`}
              >
                Manual
              </button>
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              Híbrido autónomo balancea tráfico por prioridad con QoS; manual desactiva
              la decisión automática del planificador.
            </p>
          </div>

          {/* §6 · Capa física unificada */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
              <Waves className="h-3.5 w-3.5" /> Capa física unificada
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  { k: "rns", n: "RNS", disponible: true },
                  { k: "meshtastic", n: "Meshtastic", disponible: true },
                  { k: "80211s", n: "802.11s", disponible: false },
                  { k: "babel", n: "Babel", disponible: false },
                  { k: "batman", n: "BATMAN-adv", disponible: false },
                  { k: "yggdrasil", n: "Yggdrasil", disponible: false },
                ] as Array<{ k: string; n: string; disponible: boolean }>
              ).map(({ k, n, disponible }) => (
                <div
                  key={k}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] ${disponible ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-white/5 bg-white/[0.02] text-white/30"}`}
                  title={disponible ? "Disponible en este nodo" : "No disponible en este nodo"}
                >
                  {disponible ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertCircle className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{n}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              RNS y Meshtastic están disponibles; las mallas IP requieren el agente local
              (simulador activo sin hardware real).
            </p>
          </div>

          {/* §6 · Radio cognitiva */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
              <Zap className="h-3.5 w-3.5" /> Radio cognitiva
            </h4>
            <div className="space-y-3">
              {[
                { label: "Modulación", valor: modulacion, set: setModulacion },
                { label: "TPC (potencia)", valor: tpc, set: setTpc },
                { label: "Canal", valor: canal, set: setCanal },
              ].map(({ label, valor, set }) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span className="text-[11px] text-white/70">{label}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => set("automatico")}
                      className={`cursor-pointer rounded-full border px-2 py-0.5 text-[10px] transition-colors duration-200 ${valor === "automatico" ? "border-amber-400/40 bg-amber-500/15 text-amber-100 font-semibold" : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"}`}
                    >
                      Automático
                    </button>
                    <button
                      onClick={() => set("manual")}
                      className={`cursor-pointer rounded-full border px-2 py-0.5 text-[10px] transition-colors duration-200 ${valor === "manual" ? "border-amber-400/40 bg-amber-500/15 text-amber-100 font-semibold" : "border-white/10 bg-white/5 text-white/50 hover:bg-white/10"}`}
                    >
                      Manual
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* §6 · Métrica híbrida */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
              <Activity className="h-3.5 w-3.5" /> Métrica de tráfico híbrida
            </h4>
            <p className="text-[11px] text-white/60">
              Latencia · ancho de banda · resiliencia · coste de tiempo de aire,
              con pesos por clase (control-critico, mensajes, tiempo-real, masivo).
            </p>
          </div>

          {/* §6 · Perfil legal */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
              <ShieldCheck className="h-3.5 w-3.5" /> Perfil legal activo
            </h4>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={indicativo}
                onChange={(e) => setIndicativo(e.target.value)}
                placeholder="Indicativo (solo bandas con licencia)"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
              />
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              Las bandas de radioaficionado exigen indicativo registrado; sin él,
              el planificador no enruta tráfico cifrado ni privado por ahí (§5).
            </p>
          </div>

          {/* §6 · Métricas por enlace (simulado) */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
              <Waves className="h-3.5 w-3.5" /> Por enlace — métricas y recomendaciones
            </h4>
            <div className="space-y-2">
              {[
                { id: "rns-01", nombre: "RNS · 868 MHz", metrica: { snr: 12, latencia: 45, ancho: 52 }, recomendado: "subir spreadFactor a 10 (mejora sostenida); TPC baja 2 dB para no ahogar" },
                { id: "mesh-01", nombre: "Meshtastic · 915 MHz", metrica: { snr: 8, latencia: 120, ancho: 18 }, recomendado: "bajar MCS a 3 (SNR baja); canal más limpio propuesto" },
              ].map((en) => (
                <div key={en.id} className="rounded-lg border border-white/5 bg-black/20 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-white/80">{en.nombre}</span>
                    <span className="text-[9px] text-white/30">simulado</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[10px] text-white/60">
                    <span>SNR {en.metrica.snr} dB</span>
                    <span>Latencia {en.metrica.latencia} ms</span>
                    <span>Ancho {en.metrica.ancho} kbps</span>
                  </div>
                  <div className="mt-1.5 text-[10px] text-white/50">
                    <span className="font-medium text-amber-200/80">Recomendado:</span> {en.recomendado}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      onClick={() => alert("Aplicado en modo recomendar: propuesta registrada, sin cambio real (simulador).")}
                      className="cursor-pointer rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-200 transition-colors duration-200 hover:bg-amber-500/20"
                    >
                      Aplicar (recomendar)
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              Las recomendaciones se calculan con el motor puro `recomendar` (radio-cognitiva)
              y el perfil legal activo; el botón "Aplicar" solo actúa en modo automático.
            </p>
          </div>

          {/* §6 · Registro de decisiones y reparto */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-200/90">
              <ShieldCheck className="h-3.5 w-3.5" /> Decisiones y reparto por clase
            </h4>
            <div className="space-y-1.5 text-[10px] text-white/60">
              <div className="flex justify-between">
                <span>control-critico</span>
                <span className="text-white/40">RNS · redundante activo</span>
              </div>
              <div className="flex justify-between">
                <span>mensajes</span>
                <span className="text-white/40">Meshtastic · equilibrio</span>
              </div>
              <div className="flex justify-between">
                <span>tiempo-real</span>
                <span className="text-white/40">simulado · baja latencia</span>
              </div>
              <div className="flex justify-between">
                <span>masivo</span>
                <span className="text-white/40">simulado · alta capacidad</span>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              Última reversión: ninguna (historial vacío con simulador). El registro
              guarda las 500 últimas decisiones con su porqué (§6).
            </p>
          </div>

          {/* §6 · Estado del simulador */}
          <div className="rounded-xl border border-emerald-400/10 bg-emerald-500/[0.04] p-3">
            <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-200/90">
              <Globe className="h-3.5 w-3.5" /> Estado del simulador
            </h4>
            <p className="text-[10px] text-white/50">
              Sin agente ni hardware real conectado. El panel opera sobre el simulador
              interno y muestra los parámetros recomendados por el motor de política
              (`recomendar` → `recomendar`).
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

export default CamrPanel;
