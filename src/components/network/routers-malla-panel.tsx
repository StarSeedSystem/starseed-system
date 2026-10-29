"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  compatibilidad,
  type EntradaTabla,
} from "@/lib/network/routers-malla/compatibilidad-openwrt";
import {
  planRadios,
  type RouterMalla,
  type TroncalResult,
} from "@/lib/network/routers-malla/plan-radios";
import { guionAplicar, uciMalla, type CfgUciMalla } from "@/lib/network/routers-malla/uci-malla";
import { PERFILES_WIFI } from "@/ai/astraura/mesh/camr/regulacion";

const CLAVE_LS = "starseed.malla.routers.v1";
const URL_TABLA = "https://openwrt.org/toh/start";
const MESH_ID = "starseed-mesh";
const BANDAS = ["2g", "5g", "6g"] as const;
const ANCHOS: Record<(typeof BANDAS)[number], number[]> = {
  "2g": [20, 40],
  "5g": [20, 40, 80, 160],
  "6g": [20, 40, 80, 160],
};
type Banda = (typeof BANDAS)[number];

export interface RouterMallaItem {
  id: string;
  fabricante: string;
  modelo: string;
  version?: string;
  deOperador: boolean;
  openwrt: boolean;
}

type Ajuste = { banda: Banda; canal: number; anchoMhz: number; pireDbm: number };

const radiosDe = (r: RouterMallaItem): RouterMalla["radios"] => [
  { id: `${r.id}-2g`, banda: "2g", anchosMhz: ANCHOS["2g"] },
  { id: `${r.id}-5g`, banda: "5g", anchosMhz: ANCHOS["5g"] },
];

const canalesDe = (region: string, banda: Banda) => {
  const perfil = PERFILES_WIFI[region] || PERFILES_WIFI.EU;
  return banda === "2g" ? perfil.g24 : banda === "5g" ? perfil.g5 : perfil.g6;
};

const pireLegal = (region: string, banda: Banda, canal: number): number =>
  canalesDe(region, banda).find((c) => c.canal === canal)?.pireDbm ?? 20;

const claveBase64Url = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export function RoutersMallaPanel({ tabla = [] }: { tabla?: EntradaTabla[] }) {
  const [routers, setRouters] = useState<RouterMallaItem[]>([]);
  const [fabricante, setFabricante] = useState("");
  const [modelo, setModelo] = useState("");
  const [version, setVersion] = useState("");
  const [deOperador, setDeOperador] = useState(false);
  const [region, setRegion] = useState("EU");
  const [troncales, setTroncales] = useState<[string, string][]>([]);
  const [overrides, setOverrides] = useState<Record<string, Ajuste>>({});
  const [estado, setEstado] = useState("");
  const claveRef = useRef("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAVE_LS);
      if (raw) setRouters(JSON.parse(raw) as RouterMallaItem[]);
    } catch {
      /* sin almacenamiento se empieza vacío */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CLAVE_LS, JSON.stringify(routers));
    } catch {
      /* sin almacenamiento no se guarda, pero el panel funciona */
    }
  }, [routers]);

  const agregar = () => {
    if (!fabricante.trim() || !modelo.trim()) return;
    const id = `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setRouters((rs) => [
      ...rs,
      {
        id,
        fabricante: fabricante.trim(),
        modelo: modelo.trim(),
        version: version.trim() || undefined,
        deOperador,
        openwrt: false,
      },
    ]);
    setFabricante("");
    setModelo("");
    setVersion("");
    setDeOperador(false);
  };

  const pares = useMemo(() => {
    const lista: Array<[RouterMallaItem, RouterMallaItem]> = [];
    const abiertos = routers.filter((r) => r.openwrt);
    for (let i = 0; i < abiertos.length; i++)
      for (let j = i + 1; j < abiertos.length; j++) lista.push([abiertos[i], abiertos[j]]);
    return lista;
  }, [routers]);

  const plan = useMemo(
    () =>
      planRadios({
        region,
        routers: routers.filter((r) => r.openwrt).map<RouterMalla>((r) => ({ id: r.id, radios: radiosDe(r) })),
        troncales,
      }),
    [routers, region, troncales],
  );

  const aplicado = (t: TroncalResult): Ajuste => {
    const o = overrides[`${t.a}::${t.b}`];
    return {
      banda: o?.banda ?? t.banda,
      canal: o?.canal ?? t.canal,
      anchoMhz: o?.anchoMhz ?? t.anchoMhz,
      pireDbm: o?.pireDbm ?? t.pireDbm,
    };
  };

  const editar = (t: TroncalResult, cambio: Partial<Ajuste>) => {
    const key = `${t.a}::${t.b}`;
    const next: Ajuste = { ...aplicado(t), ...cambio };
    if (cambio.banda) next.canal = canalesDe(region, cambio.banda)[0]?.canal ?? next.canal;
    next.anchoMhz = next.banda === "2g" ? Math.min(next.anchoMhz, 40) : next.anchoMhz;
    next.pireDbm = Math.max(0, Math.min(next.pireDbm, pireLegal(region, next.banda, next.canal)));
    setOverrides((o) => ({ ...o, [key]: next }));
  };

  const nombre = (id: string) => {
    const r = routers.find((x) => x.id === id);
    return r ? r.modelo : id;
  };

  const claveDeMalla = (): string => {
    if (!claveRef.current) claveRef.current = claveBase64Url();
    return claveRef.current;
  };

  const cfgDe = (r: RouterMallaItem): CfgUciMalla => {
    const t = plan.troncales.find((x) => x.a === r.id || x.b === r.id);
    const ajuste: Ajuste = t ? aplicado(t) : { banda: "5g", canal: 36, anchoMhz: 20, pireDbm: 20 };
    const clave = claveDeMalla();
    return {
      router: `${r.fabricante} ${r.modelo}`.trim(),
      meshId: MESH_ID,
      claveMalla: clave,
      region: region === "EU" ? "ES" : region,
      troncal: ajuste,
      cliente: { canal: 1, ssid: "StarSeedNet", clave },
    };
  };

  const copiarGuion = async (r: RouterMallaItem) => {
    try {
      await navigator.clipboard.writeText(guionAplicar(cfgDe(r)));
      setEstado(`Guion de ${r.modelo} copiado. Incluye la clave de la malla: no lo pegues en público.`);
    } catch (e) {
      setEstado(e instanceof Error ? e.message : "No pude copiar el guion.");
    }
  };

  const descargarConfig = (r: RouterMallaItem) => {
    try {
      const cfg = cfgDe(r);
      const { wireless, network } = uciMalla(cfg);
      const texto = `# StarSeed OS · malla para ${cfg.router}\n\n## /etc/config/wireless\n${wireless}\n## /etc/config/network\n${network}\n`;
      const url = URL.createObjectURL(new Blob([texto], { type: "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `starseed-${r.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      setEstado(`Configuración de ${r.modelo} descargada.`);
    } catch (e) {
      setEstado(e instanceof Error ? e.message : "No pude generar la configuración.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-500/20 bg-sky-950/10 p-3">
        <div className="text-[11px] uppercase tracking-widest text-sky-300/70">Routers de la malla</div>
        <p className="mt-1 text-sm text-white/70">
          Convierte un router con OpenWrt en un nodo de la malla (802.11s + batman-adv). StarSeed
          comprueba el modelo, genera la configuración y tú la aplicas. Flashear puede dejar el
          router inservible si la imagen no es la de tu modelo exacto: hazlo tú, con cable.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={fabricante}
            onChange={(e) => setFabricante(e.target.value)}
            placeholder="fabricante (p. ej. TP-Link)"
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            placeholder="modelo (p. ej. Archer C7)"
          />
          <input
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="versión (pegatina; opcional)"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/60">
            <input
              type="checkbox"
              className="cursor-pointer"
              checked={deOperador}
              onChange={(e) => setDeOperador(e.target.checked)}
            />
            ¿Es del operador? (router que te dio la compañía)
          </label>
          <button
            onClick={agregar}
            className="cursor-pointer rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-sm text-sky-100 hover:bg-sky-500/25"
          >
            Añadir router
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {routers.length === 0 && (
          <div className="text-[12px] text-white/40">Todavía no hay routers. Añade el primero arriba.</div>
        )}
        {routers.map((r) => {
          const c = compatibilidad(
            { fabricante: r.fabricante, modelo: r.modelo, version: r.version, deOperador: r.deOperador },
            tabla,
          );
          const enlace = c.enlace || (c.estado === "desconocido" ? URL_TABLA : null);
          return (
            <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-medium text-white/90">{r.modelo}</span>
                <span className="text-[11px] text-white/45">{r.fabricante}</span>
                {r.deOperador && (
                  <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[10px] text-amber-200/80">
                    del operador
                  </span>
                )}
                <span className="ml-auto text-[12px] text-white/60">Estado: {c.estado}</span>
              </div>
              {enlace && (
                <a
                  href={enlace}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block cursor-pointer break-all text-[12px] text-sky-300 underline hover:text-sky-200"
                >
                  {enlace}
                </a>
              )}
              <p className="mt-1 text-[12px] text-rose-300/90">{c.aviso}</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[12px] text-white/60">
                {c.pasos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-white/70">
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  checked={r.openwrt}
                  onChange={(e) =>
                    setRouters((rs) => rs.map((x) => (x.id === r.id ? { ...x, openwrt: e.target.checked } : x)))
                  }
                />
                Ya tiene OpenWrt: adoptarlo en la malla
              </label>
            </div>
          );
        })}
      </div>

      {routers.some((r) => r.openwrt) && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-widest text-white/45">Malla 802.11s · radios y troncales</div>

          <label className="block text-[12px] text-white/60">
            Región legal
            <select
              className="mt-1 w-full cursor-pointer rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white"
              value={region}
              onChange={(e) => {
                setRegion(e.target.value);
                setOverrides({});
              }}
            >
              <option value="EU">EU (España y Europa)</option>
              <option value="US">US (Estados Unidos)</option>
              <option value="JP">JP (Japón)</option>
            </select>
          </label>

          <div>
            <div className="text-[12px] text-white/60">Troncales entre routers (elige los pares)</div>
            <div className="mt-1 space-y-1">
              {pares.length === 0 && (
                <div className="text-[12px] text-white/40">Marca «Ya tiene OpenWrt» en dos routers para enlazarlos.</div>
              )}
              {pares.map(([a, b]) => {
                const marcado = troncales.some(
                  ([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id),
                );
                return (
                  <label key={`${a.id}-${b.id}`} className="flex cursor-pointer items-center gap-2 text-[12px] text-white/70">
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      checked={marcado}
                      onChange={() =>
                        setTroncales((ts) =>
                          marcado
                            ? ts.filter(([x, y]) => !((x === a.id && y === b.id) || (x === b.id && y === a.id)))
                            : [...ts, [a.id, b.id]],
                        )
                      }
                    />
                    {a.modelo} ↔ {b.modelo}
                  </label>
                );
              })}
            </div>
          </div>

          {plan.avisos.map((aviso) => (
            <p key={aviso} className="text-[12px] text-amber-200/80">
              {aviso}
            </p>
          ))}

          {plan.troncales.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[12px] text-white/70">
                <thead className="text-[10px] uppercase tracking-widest text-white/40">
                  <tr>
                    <th className="py-1 pr-2">Enlace</th>
                    <th className="py-1 pr-2">Banda</th>
                    <th className="py-1 pr-2">Canal</th>
                    <th className="py-1 pr-2">Ancho</th>
                    <th className="py-1">Potencia</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.troncales.map((t) => {
                    const a = aplicado(t);
                    return (
                      <tr key={`${t.a}-${t.b}`} className="border-t border-white/10">
                        <td className="py-1 pr-2">
                          {nombre(t.a)} ↔ {nombre(t.b)}
                        </td>
                        <td className="py-1 pr-2">
                          <select
                            className="cursor-pointer rounded border border-white/10 bg-white/5 px-2 py-1 text-white"
                            value={a.banda}
                            onChange={(e) => editar(t, { banda: e.target.value as Banda })}
                          >
                            {BANDAS.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <select
                            className="cursor-pointer rounded border border-white/10 bg-white/5 px-2 py-1 text-white"
                            value={a.canal}
                            onChange={(e) => editar(t, { canal: Number(e.target.value) })}
                          >
                            {canalesDe(region, a.banda).map((ch) => (
                              <option key={ch.canal} value={ch.canal}>
                                {ch.canal}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 pr-2">
                          <select
                            className="cursor-pointer rounded border border-white/10 bg-white/5 px-2 py-1 text-white"
                            value={a.anchoMhz}
                            onChange={(e) => editar(t, { anchoMhz: Number(e.target.value) })}
                          >
                            {ANCHOS[a.banda].map((w) => (
                              <option key={w} value={w}>
                                {w} MHz
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1">
                          <input
                            type="number"
                            min={0}
                            max={pireLegal(region, a.banda, a.canal)}
                            className="w-20 rounded border border-white/10 bg-white/5 px-2 py-1 text-white"
                            value={a.pireDbm}
                            onChange={(e) => editar(t, { pireDbm: Number(e.target.value) })}
                          />
                          <span className="ml-1 text-[10px] text-white/40">
                            máx. {pireLegal(region, a.banda, a.canal)} dBm
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[12px] text-white/60">Aplicar en cada router</div>
            {routers
              .filter((r) => r.openwrt)
              .map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5">
                  <span className="text-[12px] text-white/80">{r.modelo}</span>
                  <button
                    onClick={() => void copiarGuion(r)}
                    className="ml-auto cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/10"
                  >
                    Copiar guion
                  </button>
                  <button
                    onClick={() => descargarConfig(r)}
                    className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/80 hover:bg-white/10"
                  >
                    Descargar configuración
                  </button>
                </div>
              ))}
            <p className="text-[11px] text-white/40">
              La clave de la malla se genera en este navegador y solo aparece dentro del guion copiado.
            </p>
          </div>
        </div>
      )}

      {estado && <p className="text-[12px] text-white/50">{estado}</p>}
    </div>
  );
}

export default RoutersMallaPanel;
