"use client";

/*
 * Adenda 138 · RouterCenter — configurar cada NEURONA como parte de la red:
 * router / punto de acceso / nodo mesh (802.11s) / gateway. StarSeed GENERA la
 * configuración NetJSON (compatible OpenWISP/OpenWrt) y el usuario la aplica en
 * su router o la envía a un controlador OpenWISP por su API REST (proxy con
 * guarda SSRF). También inventaría las antenas/señales de telecomunicaciones de
 * la neurona. Ver SOP architecture/red-por-neurona-openwisp.md.
 *
 * Límite honesto (web): una web no cambia la banda del router por sí sola;
 * genera la config y la envía a un controlador/daemon. Defensivo y SSR-safe.
 */

import { useEffect, useMemo, useState } from "react";
import { thisDeviceId } from "@/lib/neurons/neurons";
import { toPrettyJson } from "@/lib/network/netjson";
import {
  getNetworkConfig,
  setNetworkConfig,
  generateConfigForNeuron,
  owAuth,
  owPushConfig,
  listAntennas,
  upsertAntenna,
  removeAntenna,
  type NeuronNetworkRole,
  type NeuronNetworkConfig,
  type TelecomAntenna,
  type TelecomAntennaKind,
} from "@/lib/network/neuron-network";

const ROLES: { id: NeuronNetworkRole; label: string; hint: string }[] = [
  { id: "none", label: "Sin rol de red", hint: "La neurona no participa en la configuración de red." },
  { id: "router", label: "Router", hint: "AP 2.4/5 GHz + puente LAN + DHCP (config de router típica)." },
  { id: "access-point", label: "Punto de acceso", hint: "Solo AP WiFi hacia una LAN existente." },
  { id: "mesh-node", label: "Nodo mesh (802.11s)", hint: "Nodo de malla WiFi por radiofrecuencia." },
  { id: "gateway", label: "Gateway", hint: "Salida a internet / puente entre redes." },
];

const ANTENNA_KINDS: { id: TelecomAntennaKind; label: string }[] = [
  { id: "wifi-ap", label: "AP WiFi" },
  { id: "cell-tower", label: "Torre celular" },
  { id: "wisp-ap", label: "AP WISP" },
  { id: "lora-gateway", label: "Gateway LoRa" },
  { id: "satellite", label: "Satélite" },
];

export function RouterCenter({ neuronId }: { neuronId?: string }) {
  const id = neuronId || (typeof window !== "undefined" ? thisDeviceId() : "@device");
  const [cfg, setCfg] = useState<NeuronNetworkConfig | null>(null);
  const [json, setJson] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [antennas, setAntennas] = useState<TelecomAntenna[]>([]);
  const [owUser, setOwUser] = useState("");
  const [owPass, setOwPass] = useState("");
  const [owToken, setOwToken] = useState("");

  useEffect(() => {
    try {
      setCfg(getNetworkConfig(id));
      setAntennas(listAntennas());
    } catch {
      /* noop */
    }
  }, [id]);

  const patch = (p: Partial<NeuronNetworkConfig>) => {
    try {
      const next = setNetworkConfig(id, p);
      setCfg(next);
    } catch {
      /* noop */
    }
  };

  const generate = () => {
    try {
      const c = generateConfigForNeuron(id);
      setJson(c ? toPrettyJson(c) : "");
      setStatus(c ? "Config NetJSON generada. Cópiala o envíala a tu controlador OpenWISP." : "Elige un rol de red primero.");
    } catch {
      setStatus("No pude generar la configuración.");
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setStatus("Copiado al portapapeles.");
    } catch {
      setStatus("No pude copiar; selecciona el texto manualmente.");
    }
  };

  const connectOpenwisp = async () => {
    if (!cfg?.controllerUrl) {
      setStatus("Pon la URL del controlador OpenWISP primero.");
      return;
    }
    setStatus("Conectando con OpenWISP…");
    const res = await owAuth(cfg.controllerUrl, owUser, owPass);
    if (res.ok && res.data?.token) {
      setOwToken(res.data.token);
      setStatus("Conectado a OpenWISP. Ya puedes enviar la configuración.");
    } else {
      setStatus(`No pude autenticar en OpenWISP: ${res.error ?? "revisa la URL y credenciales"}.`);
    }
  };

  const pushToOpenwisp = async () => {
    if (!cfg?.controllerUrl || !owToken || !cfg?.deviceId) {
      setStatus("Necesito URL del controlador, sesión conectada y el id del dispositivo en OpenWISP.");
      return;
    }
    setStatus("Enviando configuración a OpenWISP…");
    const res = await owPushConfig(cfg.controllerUrl, owToken, cfg.deviceId, []);
    setStatus(res.ok ? "Configuración enviada al controlador." : `Error al enviar: ${res.error ?? "?"}.`);
  };

  const role = cfg?.role ?? "none";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 p-3">
        <div className="text-[11px] uppercase tracking-widest text-amber-300/60">Router · red por neurona</div>
        <p className="mt-1 text-sm text-white/70">
          Configura esta neurona como parte de la red. StarSeed genera la configuración NetJSON (compatible
          OpenWISP/OpenWrt); tú la aplicas en tu router o la envías a tu controlador OpenWISP. Una web no cambia la
          radio del router por sí sola — genera la config y la entrega al dispositivo.
        </p>
      </div>

      {/* Rol de red */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => patch({ role: r.id })}
            className={`rounded-lg border p-3 text-left transition ${
              role === r.id
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <div className="text-sm font-medium text-white/90">{r.label}</div>
            <div className="text-[12px] text-white/50">{r.hint}</div>
          </button>
        ))}
      </div>

      {role !== "none" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="text-[12px] text-white/60">
            SSID (WiFi)
            <input
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
              value={cfg?.ssid ?? ""}
              onChange={(e) => patch({ ssid: e.target.value })}
              placeholder="StarSeedNet"
            />
          </label>
          <label className="text-[12px] text-white/60">
            Clave WiFi (WPA2)
            <input
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
              value={cfg?.key ?? ""}
              onChange={(e) => patch({ key: e.target.value })}
              placeholder="mín. 8 caracteres"
            />
          </label>
          <label className="text-[12px] text-white/60">
            Mesh ID (802.11s)
            <input
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
              value={cfg?.meshId ?? ""}
              onChange={(e) => patch({ meshId: e.target.value })}
              placeholder="starseed-mesh"
            />
          </label>
          <label className="text-[12px] text-white/60">
            País / LAN CIDR
            <input
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
              value={cfg?.lanCidr ?? ""}
              onChange={(e) => patch({ lanCidr: e.target.value })}
              placeholder="192.168.1.1/24"
            />
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={generate}
          className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-100 hover:bg-amber-500/25"
        >
          Generar NetJSON
        </button>
        {json && (
          <button
            onClick={copy}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            Copiar
          </button>
        )}
      </div>

      {json && (
        <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-emerald-200/90">
          {json}
        </pre>
      )}

      {/* Controlador OpenWISP */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="text-[11px] uppercase tracking-widest text-white/45">Controlador OpenWISP (opcional)</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white sm:col-span-2"
            value={cfg?.controllerUrl ?? ""}
            onChange={(e) => patch({ controllerUrl: e.target.value })}
            placeholder="https://openwisp.mi-red.org"
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={owUser}
            onChange={(e) => setOwUser(e.target.value)}
            placeholder="usuario"
          />
          <input
            type="password"
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={owPass}
            onChange={(e) => setOwPass(e.target.value)}
            placeholder="contraseña"
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white sm:col-span-2"
            value={cfg?.deviceId ?? ""}
            onChange={(e) => patch({ deviceId: e.target.value })}
            placeholder="id del dispositivo en OpenWISP (para enviar la config)"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={connectOpenwisp}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            Conectar
          </button>
          <button
            onClick={pushToOpenwisp}
            disabled={!owToken}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            Enviar configuración
          </button>
        </div>
      </div>

      {/* Antenas / señales */}
      <AntennaInventory
        antennas={antennas}
        neuronId={id}
        onChange={() => setAntennas(listAntennas())}
      />

      {status && <p className="text-[12px] text-white/50">{status}</p>}
    </div>
  );
}

function AntennaInventory({
  antennas,
  neuronId,
  onChange,
}: {
  antennas: TelecomAntenna[];
  neuronId: string;
  onChange: () => void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<TelecomAntennaKind>("wifi-ap");
  const [dbm, setDbm] = useState("");

  const mine = useMemo(() => antennas.filter((a) => !a.neuronId || a.neuronId === neuronId), [antennas, neuronId]);

  const add = () => {
    if (!label.trim()) return;
    try {
      upsertAntenna({
        id: `ant-${Date.now().toString(36)}`,
        kind,
        label: label.trim(),
        dbm: dbm ? Number(dbm) : undefined,
        neuronId,
        lastSeen: new Date().toISOString(),
      });
      setLabel("");
      setDbm("");
      onChange();
    } catch {
      /* noop */
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-widest text-white/45">Antenas y señales de esta neurona</div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <input
          className="min-w-[140px] flex-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="nombre / operador"
        />
        <select
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
          value={kind}
          onChange={(e) => setKind(e.target.value as TelecomAntennaKind)}
        >
          {ANTENNA_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input
          className="w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
          value={dbm}
          onChange={(e) => setDbm(e.target.value)}
          placeholder="dBm"
        />
        <button
          onClick={add}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white/80 hover:bg-white/10"
        >
          Añadir
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {mine.length === 0 && <div className="text-[12px] text-white/40">Sin antenas registradas todavía.</div>}
        {mine.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1.5">
            <span className="text-sm text-white/85">{a.label}</span>
            <span className="text-[11px] text-white/45">
              {ANTENNA_KINDS.find((k) => k.id === a.kind)?.label ?? a.kind}
              {typeof a.dbm === "number" ? ` · ${a.dbm} dBm` : ""}
            </span>
            <button
              onClick={() => {
                try {
                  removeAntenna(a.id);
                  onChange();
                } catch {
                  /* noop */
                }
              }}
              className="ml-auto text-[12px] text-white/40 hover:text-rose-300"
            >
              Quitar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RouterCenter;
