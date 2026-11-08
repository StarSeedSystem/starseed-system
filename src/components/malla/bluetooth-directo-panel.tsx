"use client";

/**
 * Bluetooth directo (BLE1108A) — estado, interruptor, permiso y vecinos con su señal. Solo en la app
 * nativa (en el navegador no se pinta: allí no hay Bluetooth directo). Contrato: architecture/bluetooth-directo.md.
 */

import { useState } from "react";
import { textoVelocidadBle } from "@/lib/malla/bluetooth-directo";
import { abrirEnlaceBluetooth, activarBluetooth, pedirPermisoBluetooth, useEstadoBluetooth } from "@/lib/malla/bluetooth-directo-estado";

const COLOR: Record<string, string> = {
  encendida: "#22c55e",
  arrancando: "#38bdf8",
  "sin-permiso": "#f59e0b",
  apagada: "#94a3b8",
  "no-disponible": "#64748b",
};

export default function BluetoothDirectoPanel() {
  const estado = useEstadoBluetooth();
  const [aviso, setAviso] = useState<string | null>(null);
  if (!estado) return null;
  const cambiar = async () => {
    const r = await activarBluetooth(!estado.activo);
    setAviso(r.ok ? null : r.motivo ?? "La app no respondió.");
  };
  return (
    <section className="mb-6 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="bluetooth-directo">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: COLOR[estado.radio] ?? "#64748b" }} aria-hidden />
        <h3 className="text-sm font-semibold text-white/85">Bluetooth directo</h3>
        {estado.disponible && (
          <button
            onClick={() => void cambiar()}
            className="ml-auto cursor-pointer rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-white/70 transition-colors hover:bg-white/10"
          >
            {estado.activo ? "Apagar" : "Encender"}
          </button>
        )}
      </div>
      <p className="mt-2 text-[12px] text-white/60">{estado.motivo}</p>
      <p className="mt-1 text-[11px] text-white/40">
        De antena a antena, sin router ni internet: mensajes y archivos de hasta 20 MB entre tus apps nativas cercanas.
        {estado.disponible && !estado.con_cuenta ? " Sin la clave de faro de tu cuenta, tus neuronas no se reconocen solas." : ""}
      </p>
      {estado.radio === "sin-permiso" && (
        <button
          onClick={() => void pedirPermisoBluetooth().then((r) => setAviso(r.ok ? null : r.motivo ?? null))}
          className="mt-2 cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[12px] font-medium text-amber-200 transition-colors hover:bg-amber-500/20"
        >
          Permitir Bluetooth cercano
        </button>
      )}
      {aviso && <p className="mt-2 text-[11px] text-amber-300">{aviso}</p>}
      {estado.vecinos.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Vecinos por Bluetooth">
          {estado.vecinos.map((v) => {
            const enlace = v.enlace ? estado.enlaces.find((e) => e.id === v.enlace) : null;
            return (
              <li key={v.id} className="flex items-center gap-2 text-[11px] text-white/60">
                <span className="font-medium text-white/80">{v.propia ? (v.neurona ? `Neurona ${v.neurona.slice(0, 8)}…` : "Neurona de tu cuenta") : "Neurona StarSeed (otra cuenta)"}</span>
                <span className="text-white/45">{v.rssi} dBm</span>
                {enlace ? (
                  <span className="text-emerald-300/80">
                    enlazada · {enlace.rtt_ms != null ? `${enlace.rtt_ms} ms` : "sin medir"} · {textoVelocidadBle(enlace.kbps)}
                  </span>
                ) : (
                  v.servidor && (
                    <button
                      onClick={() => void abrirEnlaceBluetooth(v.id).then((r) => setAviso(r.ok ? null : r.motivo ?? null))}
                      className="ml-auto cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/65 hover:bg-white/10"
                    >
                      Conectar
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
