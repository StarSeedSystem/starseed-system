"use client";

// EstudioProduccion (Ola 1010E · ES1010P) — mesa de producción en directo (§10):
// permisos solo al pulsar; al desmontar se paran todas las pistas.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PLANTILLAS, SALIDAS, adaptarEscena, alternarCapa, escenaDesdePlantilla,
  volumenCapa, type Escena, type Fuente, type TipoFuente,
} from "@/lib/estaciones/estudio-escenas";
import { obtenerPantalla, obtenerPista } from "@/lib/llamadas/medios";
import { BarraSalidasEstudio, PanelIa, VistaPrevia } from "./estudio-salidas";

let contador = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${++contador}`;
const fuenteNueva = (tipo: TipoFuente, etiqueta: string, extra?: Partial<Fuente>): Fuente =>
  ({ id: nid(tipo), tipo, etiqueta, ...extra });

const ETIQUETA_FUENTE: Record<TipoFuente, string> = {
  camara: "Cámara", pantalla: "Pantalla", microfono: "Micrófono", imagen: "Imagen https",
  texto: "Rótulo", enlace: "Enlace de estación", "estacion-interna": "Ruta interna",
};
const BOTONES: { tipo: TipoFuente; media?: boolean }[] = [
  { tipo: "camara", media: true }, { tipo: "microfono", media: true }, { tipo: "pantalla", media: true },
  { tipo: "imagen" }, { tipo: "texto" }, { tipo: "enlace" }, { tipo: "estacion-interna" },
];
const btn = "cursor-pointer rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/10";

export function EstudioProduccion() {
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [escenas, setEscenas] = useState<Escena[]>([]);
  const [aire, setAire] = useState<string | null>(null);
  const [salidaId, setSalidaId] = useState("horizontal");
  const [aviso, setAviso] = useState("");
  const pistas = useRef(new Map<string, MediaStreamTrack>());

  useEffect(() => () => { pistas.current.forEach((p) => p.stop()); pistas.current.clear(); }, []);

  const anadirFuente = async (tipo: TipoFuente, media?: boolean) => {
    if (!media) {
      const valor = window.prompt(tipo === "texto" ? "Texto del rótulo"
        : tipo === "estacion-interna" ? "Ruta interna (/…)" : "URL https")?.trim();
      if (!valor) return;
      setFuentes((l) => [...l, fuenteNueva(tipo, ETIQUETA_FUENTE[tipo],
        tipo === "texto" ? { texto: valor } : tipo === "estacion-interna" ? { ruta: valor } : { url: valor })]);
      return;
    }
    const r = tipo === "pantalla" ? await obtenerPantalla()
      : await obtenerPista(tipo === "camara" ? "video" : "audio");
    if (!r.pista) { setAviso(r.error ?? "No se pudo abrir la fuente."); return; }
    const f = fuenteNueva(tipo, ETIQUETA_FUENTE[tipo]);
    pistas.current.set(f.id, r.pista);
    setFuentes((l) => [...l, f]); setAviso("");
  };

  const nuevaEscena = (idPlantilla: string) => {
    try {
      const e = { ...escenaDesdePlantilla(idPlantilla, fuentes), id: nid("escena") };
      setEscenas((l) => [...l, e]); setAire(e.id); setAviso("");
    } catch (err) {
      setAviso(err instanceof Error ? `Falta una fuente: ${err.message}` : "Falta una fuente.");
    }
  };

  const escenaAire = escenas.find((e) => e.id === aire) ?? null;
  const salida = SALIDAS[salidaId] ?? SALIDAS.horizontal;
  const adaptada = (() => { try { return escenaAire ? adaptarEscena(escenaAire, salida) : null; } catch { return escenaAire; } })();
  const parcheEscena = (e: Escena) => setEscenas((l) => l.map((x) => (x.id === e.id ? e : x)));

  const flujoSalida = useCallback((): MediaStream | null => {
    const ids = new Set((adaptada?.capas ?? []).filter((c) => c.visible).map((c) => c.fuente.id));
    const vivas = [...pistas.current.entries()].filter(([id]) => ids.has(id)).map(([, p]) => p);
    return vivas.length ? new MediaStream(vivas) : null;
  }, [adaptada]);

  const agregarRotulo = (texto: string) => {
    const f = fuenteNueva("texto", "Rótulo", { texto });
    setFuentes((l) => [...l, f]);
    if (!escenaAire) return;
    const z = Math.max(0, ...escenaAire.capas.map((c) => c.z)) + 1;
    parcheEscena({ ...escenaAire, capas: [...escenaAire.capas, { id: nid("capa"), fuente: f, x: 0.1, y: 0.78, ancho: 0.8, alto: 0.16, z, visible: true }] });
  };

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_300px]">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">Estudio de producción en directo</h1>
        <VistaPrevia escena={adaptada} salida={salida} pistas={pistas.current} />
        <div className="flex flex-wrap gap-2">
          {Object.values(PLANTILLAS).map((p) => (
            <button key={p.id} type="button" className={btn} onClick={() => nuevaEscena(p.id)}>+ {p.nombre}</button>
          ))}
          {escenas.map((e) => (
            <button key={e.id} type="button" onClick={() => setAire(e.id)} aria-pressed={e.id === aire}
              className={`${btn} ${e.id === aire ? "border-rose-400/60 bg-rose-500/20" : ""}`}>
              {e.nombre}{e.id === aire ? " · en el aire" : ""}
            </button>
          ))}
        </div>
        {adaptada && (
          <ul className="space-y-1 text-sm" aria-label="Capas de la escena en el aire">
            {adaptada.capas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <button type="button" className={btn} aria-pressed={c.visible}
                  onClick={() => escenaAire && parcheEscena(alternarCapa(escenaAire, c.id))}>
                  {c.visible ? "Visible" : "Oculta"}
                </button>
                <span>{c.fuente.etiqueta}</span>
                <input type="range" min={0} max={1} step={0.05} value={c.volumen ?? 1}
                  className="cursor-pointer" aria-label={`Volumen de ${c.fuente.etiqueta}`}
                  onChange={(ev) => escenaAire && parcheEscena(volumenCapa(escenaAire, c.id, Number(ev.target.value)))} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="space-y-3 text-sm">
        <p className="font-medium">Añadir fuente</p>
        <div className="flex flex-wrap gap-2">
          {BOTONES.map(({ tipo, media }) => (
            <button key={tipo} type="button" className={btn} onClick={() => void anadirFuente(tipo, media)}>{ETIQUETA_FUENTE[tipo]}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs">
          Salida
          <select value={salidaId} onChange={(e) => setSalidaId(e.target.value)} aria-label="Formato de salida"
            className="cursor-pointer rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs">
            {Object.values(SALIDAS).map((s) => (<option key={s.id} value={s.id}>{s.id} {s.ancho ? `${s.ancho}×${s.alto}` : ""}</option>))}
          </select>
        </label>
        <PanelIa escenas={escenas} onRotulo={agregarRotulo} onAplicar={setAire} />
        <BarraSalidasEstudio flujo={flujoSalida} />
        {aviso && <p role="alert" className="text-xs text-amber-300">{aviso}</p>}
      </aside>
    </div>
  );
}
