"use client";

/**
 * Bluetooth directo (BLE1108A) — estado, interruptor, permiso y vecinos con su señal. Solo en la app
 * nativa (en el navegador no se pinta: allí no hay Bluetooth directo). Contrato: architecture/bluetooth-directo.md.
 */

import { useEffect, useState } from "react";
import { COMANDO_REGISTRO_BLE, textoCanalBle, textoVelocidadBle } from "@/lib/malla/bluetooth-directo";
import { unirRegistros, type RegistroNativoBle } from "@/lib/malla/registro-enlace-ble";
import { CLAVE_DEFECTOS_ANTENAS, leerMarca, marcarExplicito, serializarMarca } from "@/lib/malla/defectos-antenas";
import { abrirEnlaceBluetooth, activarBluetooth, pedirPermisoBluetooth, useEstadoBluetooth } from "@/lib/malla/bluetooth-directo-estado";

const COLOR: Record<string, string> = {
  encendida: "#22c55e",
  arrancando: "#38bdf8",
  "sin-permiso": "#f59e0b",
  apagada: "#94a3b8",
  "no-disponible": "#64748b",
};

/**
 * (BLE1108B) «Registro del enlace»: los últimos eventos del Bluetooth directo (web + app nativa) para leer
 * por qué se cayó un enlace. «Copiar» o «Guardar» lo exportan; en escritorio también queda en
 * `~/Library/Logs/app.starseed.os/enlaces.log`.
 */
function RegistroDelEnlace() {
  const [abierto, setAbierto] = useState(false);
  const [lineas, setLineas] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    const leer = async () => {
      try {
        const bd = await import("@/lib/malla/bluetooth-directo-motor");
        const web = bd.bluetoothDirectoActivo()?.registro().lista() ?? [];
        let nativos: RegistroNativoBle[] = [];
        try {
          const { puenteNativo } = await import("@/lib/nativa/puente");
          const r = await puenteNativo().llamar<RegistroNativoBle[]>(COMANDO_REGISTRO_BLE);
          if (r.ok && Array.isArray(r.valor)) nativos = r.valor;
        } catch {
          /* sin app nativa: solo lo de la web */
        }
        if (vivo) setLineas(unirRegistros(web, nativos).slice(-300));
      } catch {
        if (vivo) setLineas([]);
      }
    };
    void leer();
    const t = setInterval(() => void leer(), 3_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [abierto]);
  const texto = lineas.join("\n");
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Registro copiado.");
    } catch {
      setAviso("No se pudo copiar: usa «Guardar».");
    }
  };
  const guardar = () => {
    try {
      const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `enlaces-bluetooth-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      setAviso(null);
    } catch {
      setAviso("No se pudo guardar el registro.");
    }
  };
  return (
    <div className="mt-3" data-testid="registro-enlace">
      <button onClick={() => setAbierto((v) => !v)} className="cursor-pointer text-[11px] font-medium text-white/65 underline-offset-2 hover:underline" aria-expanded={abierto}>
        Registro del enlace {abierto ? "▲" : "▼"}
      </button>
      {abierto && (
        <div className="mt-2">
          <div className="mb-1.5 flex items-center gap-2">
            <button onClick={() => void copiar()} disabled={!lineas.length} className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/65 hover:bg-white/10 disabled:opacity-40">
              Copiar
            </button>
            <button onClick={guardar} disabled={!lineas.length} className="cursor-pointer rounded border border-white/15 px-2 py-0.5 text-[10px] text-white/65 hover:bg-white/10 disabled:opacity-40">
              Guardar
            </button>
            {aviso && <span className="text-[10px] text-amber-300">{aviso}</span>}
          </div>
          <pre className="max-h-56 overflow-auto rounded-lg bg-black/30 p-2 text-[10px] leading-snug text-white/60" aria-label="Registro del enlace Bluetooth">
            {lineas.length ? texto : "Aún no hay eventos: aquí se apuntará cada enlace que se abra, se cierre o se caiga, y por qué."}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function BluetoothDirectoPanel() {
  const estado = useEstadoBluetooth();
  const [aviso, setAviso] = useState<string | null>(null);
  if (!estado) return null;
  const cambiar = async () => {
    // (PER1108A) Tocado a propósito: la migración de defectos no lo cambia nunca.
    try {
      window.localStorage.setItem(CLAVE_DEFECTOS_ANTENAS, serializarMarca(marcarExplicito(leerMarca(window.localStorage.getItem(CLAVE_DEFECTOS_ANTENAS)), "bluetooth")));
    } catch {
      /* sin almacenamiento: vale esta sesión */
    }
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
      {estado.disponible && <RegistroDelEnlace />}
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
                    enlazada · {enlace.rtt_ms != null ? `${enlace.rtt_ms} ms` : "sin medir"} · {enlace.carril === "rapido" ? textoCanalBle(enlace) : textoVelocidadBle(enlace.kbps)}
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
