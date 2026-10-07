"use client";

// Paneles auxiliares del estudio (ES1010P): vista previa DOM de la escena
// adaptada, panel del asistente IA (rótulos → capa de texto; la escena
// sugerida solo se aplica al confirmar) y barra de salidas (Grabar webm,
// Emitir por WHIP con credenciales solo en localStorage, Publicar estación).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Escena, Salida } from "@/lib/estaciones/estudio-escenas";
import { editarEstacion, publicarEstacion } from "@/lib/estaciones/datos";
import { generarRotulos, sugerirEscena } from "@/lib/estaciones/asistente-estudio";

const btn = "cursor-pointer rounded-lg border border-white/10 px-2 py-1 text-xs hover:bg-white/10";
const input = "w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs";
const CLAVE_WHIP = "starseed.estudio.whip.v1";

export function VistaPrevia({ escena, salida, pistas }: {
  escena: Escena | null; salida: Salida; pistas: Map<string, MediaStreamTrack>;
}) {
  const estilo: React.CSSProperties = salida.ancho
    ? { aspectRatio: `${salida.ancho}/${salida.alto}` } : { height: 96 };
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/60" style={estilo}>
      {!escena && <p className="p-4 text-sm text-white/50">Crea una escena desde una plantilla para verla aquí.</p>}
      {escena?.capas.filter((c) => c.visible).map((c) => (
        <div key={c.id} className="absolute" style={{
          left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.ancho * 100}%`,
          height: `${c.alto * 100}%`, zIndex: c.z,
        }}>
          {(() => {
            const pista = pistas.get(c.fuente.id);
            if ((c.fuente.tipo === "camara" || c.fuente.tipo === "pantalla") && pista) {
              return <video autoPlay muted playsInline className="h-full w-full object-cover"
                ref={(el) => { if (el) el.srcObject = new MediaStream([pista]); }} />;
            }
            if (c.fuente.tipo === "microfono") {
              return <p className="p-2 text-xs text-white/70">Micrófono activo</p>;
            }
            if (c.fuente.tipo === "imagen" && c.fuente.url) {
              // eslint-disable-next-line @next/next/no-img-element
              return <img src={c.fuente.url} alt={c.fuente.etiqueta} className="h-full w-full object-cover" />;
            }
            if (c.fuente.tipo === "texto") {
              return <p className="flex h-full items-center justify-center text-center text-lg font-bold drop-shadow"
                style={{ fontSize: "clamp(10px, 3vw, 48px)" }}>{c.fuente.texto}</p>;
            }
            const src = c.fuente.tipo === "estacion-interna" ? c.fuente.ruta : c.fuente.url;
            return src ? <iframe src={src} title={c.fuente.etiqueta} className="h-full w-full" sandbox="allow-scripts allow-same-origin" /> : null;
          })()}
        </div>
      ))}
    </div>
  );
}

export function PanelIa(p: {
  tema: string; setTema: (v: string) => void; rotulos: string[]; setRotulos: (v: string[]) => void;
  escenas: { id: string; nombre: string }[];
  sugerida: { escenaId: string; porque: string } | null;
  setSugerida: (v: { escenaId: string; porque: string } | null) => void;
  onRotulo: (texto: string) => void; onAplicar: (escenaId: string) => void;
}) {
  const [aviso, setAviso] = useState("");
  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-2">
      <p className="font-medium">Asistente IA</p>
      <input value={p.tema} onChange={(e) => p.setTema(e.target.value)} placeholder="Tema del directo" className={input} aria-label="Tema del directo" />
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={async () => {
          const r = await generarRotulos(p.tema, 5);
          if (r.ok) { p.setRotulos(r.valor); setAviso(""); } else setAviso(r.error);
        }}>Rótulos</button>
        <button type="button" className={btn} onClick={async () => {
          const r = await sugerirEscena({ escenas: p.escenas });
          if (r.ok) { p.setSugerida(r.valor); setAviso(""); } else setAviso(r.error);
        }}>Sugerir escena</button>
      </div>
      {p.rotulos.map((r) => (
        <button key={r} type="button" className={`${btn} mr-1`} onClick={() => p.onRotulo(r)}>{r}</button>
      ))}
      {p.sugerida && (
        <p className="text-xs text-white/70">
          Sugerida: «{p.escenas.find((e) => e.id === p.sugerida?.escenaId)?.nombre}» — {p.sugerida.porque}{" "}
          <button type="button" className={btn} onClick={() => p.onAplicar(p.sugerida!.escenaId)}>Aplicar</button>
        </p>
      )}
      {aviso && <p role="alert" className="text-xs text-amber-300">{aviso}</p>}
    </div>
  );
}

export function BarraSalidasEstudio({ flujo }: { flujo: () => MediaStream | null }) {
  const router = useRouter();
  const [grabando, setGrabando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const grabacion = useRef<MediaRecorder | null>(null);
  const bloques = useRef<Blob[]>([]);

  const conFlujo = (accion: (f: MediaStream) => void) => {
    const f = flujo();
    if (!f) { setAviso("No hay ninguna fuente de vídeo o audio en el aire."); return; }
    setAviso(""); accion(f);
  };

  const alternarGrabacion = () => conFlujo((f) => {
    if (grabacion.current) { grabacion.current.stop(); return; }
    const rec = new MediaRecorder(f, { mimeType: "video/webm" });
    bloques.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) bloques.current.push(e.data); };
    rec.onstop = () => {
      setGrabando(false); grabacion.current = null;
      const url = URL.createObjectURL(new Blob(bloques.current, { type: "video/webm" }));
      const a = document.createElement("a");
      a.href = url; a.download = `estudio-${Date.now()}.webm`; a.click();
      URL.revokeObjectURL(url);
    };
    grabacion.current = rec; rec.start(); setGrabando(true);
  });

  const alternarEmision = () => conFlujo(async (f) => {
    if (emitiendo) { f.getTracks().forEach((t) => t.stop()); setEmitiendo(false); return; }
    const conf = JSON.parse(localStorage.getItem(CLAVE_WHIP) ?? "null") as { url: string; token: string } | null
      ?? (() => {
        const url = window.prompt("Endpoint WHIP (https)")?.trim();
        const token = window.prompt("Token de emisión")?.trim();
        if (!url || !token) return null;
        const v = { url, token }; localStorage.setItem(CLAVE_WHIP, JSON.stringify(v)); return v;
      })();
    if (!conf) { setAviso("Faltan las credenciales WHIP."); return; }
    try {
      const pc = new RTCPeerConnection();
      f.getTracks().forEach((t) => pc.addTrack(t, f));
      const oferta = await pc.createOffer();
      await pc.setLocalDescription(oferta);
      const r = await fetch(conf.url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp", Authorization: `Bearer ${conf.token}` },
        body: oferta.sdp ?? "",
      });
      if (!r.ok) { setEmitiendo(false); setAviso("El servidor WHIP rechazó la emisión."); return; }
      await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
      setEmitiendo(true);
    } catch { setEmitiendo(false); setAviso("No se pudo conectar con el endpoint WHIP."); }
  });

  const publicar = async () => {
    const titulo = window.prompt("Título de la estación")?.trim();
    if (!titulo) return;
    const conf = JSON.parse(localStorage.getItem(CLAVE_WHIP) ?? "null") as { url: string; token: string } | null;
    const r = await publicarEstacion({ titulo, tipo: "video", fuente: "estudio", enlace: conf?.url ?? "https://", licencia: "cc0" });
    if (r.ok) router.push(`/estaciones/${r.estacion.id}`); else setAviso(r.error);
  };

  return (
    <div className="space-y-2 rounded-xl border border-white/10 p-2">
      <p className="font-medium">Salidas</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} aria-pressed={grabando} onClick={alternarGrabacion}>
          {grabando ? "Parar grabación" : "Grabar webm"}
        </button>
        <button type="button" className={btn} aria-pressed={emitiendo} onClick={() => void alternarEmision()}>
          {emitiendo ? "Parar emisión" : "Emitir por WHIP"}
        </button>
        <button type="button" className={btn} onClick={() => void publicar()}>Publicar estación</button>
      </div>
      {aviso && <p role="alert" className="text-xs text-amber-300">{aviso}</p>}
    </div>
  );
}
