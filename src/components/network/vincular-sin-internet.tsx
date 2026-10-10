"use client";

/**
 * VincularSinInternet — emparejar dos aparatos por código/QR SIN internet, y lo que se hace con el
 * enlace: notas, archivos (por varios enlaces a la vez si los hay) y llamadas directas (2026-10-10).
 * La llamada en curso la dibuja `LlamadaDirectaFlotante` (archivo propio, montado una sola vez).
 *
 * Contrato: `architecture/transporte-universal-sin-internet.md`. Se carga perezoso (next/dynamic)
 * desde la pestaña «Malla» del Centro de Conexiones y desde `MallaNeuronasMount` (la llamada).
 * Mobile-first, iconos lucide, cursor-pointer, sin emojis. Cada dato que se enseña está medido.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  CameraOff,
  Check,
  ClipboardPaste,
  Copy,
  Loader2,
  Phone,
  QrCode,
  ScanLine,
  Send,
  Share2,
  Unlink,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMallaNeuronasEstado } from "@/lib/network/malla-neuronas";
import { etiquetaRuta } from "@/lib/network/estadisticas-enlace";
import {
  iniciarEmparejamiento,
  responderEmparejamiento,
  soportaEmparejado,
  type Emparejamiento,
  type EstadoEmparejado,
} from "@/lib/malla/emparejar-sin-internet";
import { enlaceLocal, useEnlacesLocales, type FotoEnlaceLocal } from "@/lib/malla/registro-enlaces-locales";
import { alRecibirMensaje, asegurarRecepcionLocal, enviarArchivo, enviarMensaje } from "@/lib/malla/transporte-universal";
import { asegurarEscuchaLlamadas, llamarPorEnlace, useLlamadaDirecta } from "@/lib/malla/llamada-directa";
import { LlamadaDirectaFlotante } from "@/components/network/llamada-directa-flotante";

const boton =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50";
const botonSuave = cn(boton, "border-foreground/15 bg-foreground/[0.03] text-foreground/75 hover:border-sky-400/40 hover:text-sky-200");
const botonFuerte = cn(boton, "border-sky-400/40 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25");

/* ═════════════════════════ QR ═════════════════════════ */

function CodigoQr({ codigo }: { codigo: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    setUrl(null);
    setError(false);
    // @ts-expect-error módulo cargado en runtime, sin declaración de tipos
    import("qrcode")
      .then((m) => {
        // CommonJS: según el empaquetador llega como módulo o dentro de `default`.
        const lib = ((m as unknown as { default?: typeof m }).default ?? m) as typeof m;
        return lib.toDataURL(codigo, { errorCorrectionLevel: "L", margin: 2, width: 320, color: { dark: "#0b1020", light: "#ffffff" } });
      })
      .then((u) => {
        if (vivo) setUrl(u);
      })
      .catch(() => {
        if (vivo) setError(true);
      });
    return () => {
      vivo = false;
    };
  }, [codigo]);
  if (error) return <p className="text-[11px] text-amber-200/80">No se pudo dibujar el QR: usa el texto de abajo.</p>;
  if (!url) {
    return (
      <div className="flex h-[240px] w-[240px] items-center justify-center rounded-xl bg-white/90">
        <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Código QR para vincular sin internet" className="h-auto w-full max-w-[280px] rounded-xl bg-white" />;
}

function CompartirCodigo({ codigo, titulo }: { codigo: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      toast.error("El navegador no dejó copiar: selecciona el texto y cópialo a mano.");
    }
  };
  const puedeCompartir = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const compartir = async () => {
    try {
      await navigator.share({ title: titulo, text: codigo });
    } catch {
      /* la persona canceló */
    }
  };
  return (
    <div className="w-full space-y-1.5">
      <textarea
        readOnly
        value={codigo}
        onFocus={(e) => e.currentTarget.select()}
        className="h-16 w-full resize-none rounded-lg border border-foreground/10 bg-foreground/[0.03] p-2 font-mono text-[9px] leading-tight text-foreground/70"
        aria-label="Código en texto"
      />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => void copiar()} className={botonSuave}>
          {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copiado ? "Copiado" : "Copiar texto"}
        </button>
        {puedeCompartir ? (
          <button type="button" onClick={() => void compartir()} className={botonSuave}>
            <Share2 className="h-3 w-3" /> Compartir
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ═════════════════════════ Lector (cámara o texto) ═════════════════════════ */

type Detector = { detect(fuente: CanvasImageSource): Promise<Array<{ rawValue: string }>> };

function crearDetector(): Detector | null {
  try {
    const BD = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    return BD ? new BD({ formats: ["qr_code"] }) : null;
  } catch {
    return null;
  }
}

function LectorCodigo({ etiqueta, onCodigo, ocupado }: { etiqueta: string; onCodigo: (texto: string) => void; ocupado?: boolean }) {
  const [texto, setTexto] = useState("");
  const [camara, setCamara] = useState(false);
  const [errorCamara, setErrorCamara] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hayDetector = useMemo(() => !!crearDetector(), []);
  // Ref para no reiniciar la cámara en cada pintado del padre (que pasa una flecha nueva).
  const alCodigo = useRef(onCodigo);
  alCodigo.current = onCodigo;

  useEffect(() => {
    if (!camara) return;
    const detector = crearDetector();
    let stream: MediaStream | null = null;
    let parar = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (parar || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
        const buscar = async () => {
          if (parar || !detector || !videoRef.current) return;
          try {
            const r = await detector.detect(videoRef.current);
            const valor = r.find((x) => x.rawValue?.includes("SSL1"))?.rawValue;
            if (valor) {
              setCamara(false);
              alCodigo.current(valor);
              return;
            }
          } catch {
            /* el siguiente fotograma */
          }
          t = setTimeout(() => void buscar(), 300);
        };
        void buscar();
      } catch {
        setErrorCamara("Sin permiso para la cámara (o no hay cámara): pega el texto.");
        setCamara(false);
      }
    })();
    return () => {
      parar = true;
      if (t) clearTimeout(t);
      for (const tr of stream?.getTracks() ?? []) tr.stop();
    };
  }, [camara]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-foreground/80">{etiqueta}</p>
      {hayDetector ? (
        camara ? (
          <div className="space-y-1.5">
            <video ref={videoRef} muted playsInline className="aspect-square w-full max-w-[280px] rounded-xl bg-black object-cover" />
            <button type="button" onClick={() => setCamara(false)} className={botonSuave}>
              <CameraOff className="h-3 w-3" /> Dejar la cámara
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setCamara(true)} className={botonFuerte} disabled={ocupado}>
            <Camera className="h-3 w-3" /> Leer el QR con la cámara
          </button>
        )
      ) : (
        <p className="text-[10px] text-foreground/50">
          Este navegador no lee QR con la cámara. Escanéalo con la cámara del móvil, copia el texto y pégalo aquí.
        </p>
      )}
      {errorCamara ? <p className="text-[10px] text-amber-200/80">{errorCamara}</p> : null}
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="…o pega aquí el código (empieza por SSL1)"
        className="h-14 w-full resize-none rounded-lg border border-foreground/10 bg-foreground/[0.03] p-2 font-mono text-[10px] text-foreground/80 placeholder:text-foreground/35"
        aria-label="Pegar código"
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={botonSuave}
          onClick={async () => {
            try {
              setTexto(await navigator.clipboard.readText());
            } catch {
              toast.error("El navegador no dejó leer el portapapeles: pégalo a mano.");
            }
          }}
        >
          <ClipboardPaste className="h-3 w-3" /> Pegar
        </button>
        <button type="button" className={botonFuerte} disabled={!texto.trim() || ocupado} onClick={() => onCodigo(texto)}>
          {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Usar este código
        </button>
      </div>
    </div>
  );
}

/* ═════════════════════════ Asistente de emparejado ═════════════════════════ */

const TEXTO_ESTADO: Record<EstadoEmparejado, string> = {
  preparando: "Preparando el código…",
  "esperando-respuesta": "Esperando el código de respuesta del otro aparato.",
  conectando: "Conectando por la red local…",
  abierto: "Enlazados. Ya podéis usar el enlace directo.",
  fallido: "No se pudo enlazar.",
  cerrado: "Cerrado.",
};

function useEstadoEmp(emp: Emparejamiento | null) {
  const [, setN] = useState(0);
  useEffect(() => (emp ? emp.alCambiar(() => setN((n) => n + 1)) : undefined), [emp]);
  return emp ? { estado: emp.estado(), motivo: emp.motivo() } : null;
}

function Asistente({ nombre }: { nombre: string }) {
  const [modo, setModo] = useState<"nada" | "inicia" | "responde">("nada");
  const [emp, setEmp] = useState<Emparejamiento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const est = useEstadoEmp(emp);

  useEffect(() => {
    if (est?.estado === "abierto") {
      toast.success("Enlace directo abierto, sin internet.");
      const t = setTimeout(() => {
        setModo("nada");
        setEmp(null);
      }, 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [est?.estado]);

  const reiniciar = () => {
    if (emp && emp.estado() !== "abierto") emp.cancelar();
    setEmp(null);
    setModo("nada");
    setAviso(null);
  };

  const empezar = async () => {
    setModo("inicia");
    setOcupado(true);
    setAviso(null);
    const r = await iniciarEmparejamiento({ nombre });
    setOcupado(false);
    if (r.ok) setEmp(r.emp);
    else setAviso(r.motivo);
  };

  const leerOferta = async (texto: string) => {
    setOcupado(true);
    setAviso(null);
    const r = await responderEmparejamiento(texto, { nombre });
    setOcupado(false);
    if (r.ok) setEmp(r.emp);
    else setAviso(r.motivo);
  };

  const leerRespuesta = async (texto: string) => {
    if (!emp) return;
    setOcupado(true);
    setAviso(null);
    const r = await emp.completar(texto);
    setOcupado(false);
    if (!r.ok) setAviso(r.motivo ?? "Ese código no sirve.");
  };

  if (modo === "nada") {
    return (
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => void empezar()} className={botonFuerte}>
          <QrCode className="h-3.5 w-3.5" /> Enseñar mi código
        </button>
        <button type="button" onClick={() => setModo("responde")} className={botonSuave}>
          <ScanLine className="h-3.5 w-3.5" /> Leer el código de otro aparato
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-xl border border-sky-400/25 bg-sky-400/[0.05] p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold text-sky-100">
          {modo === "inicia" ? "1 · Enseña este código · 2 · Lee su respuesta" : "1 · Lee su código · 2 · Enséñale el tuyo"}
        </span>
        <button type="button" onClick={reiniciar} className="ml-auto cursor-pointer rounded-full p-1 text-foreground/50 hover:text-foreground" aria-label="Cancelar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {modo === "inicia" && !emp && ocupado ? (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/60">
          <Loader2 className="h-3 w-3 animate-spin" /> Reuniendo las direcciones de esta red…
        </p>
      ) : null}

      {modo === "responde" && !emp ? <LectorCodigo etiqueta="Lee el código que enseña el otro aparato" onCodigo={(t) => void leerOferta(t)} ocupado={ocupado} /> : null}

      {emp && emp.codigo && est?.estado !== "abierto" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col items-center gap-2">
            <CodigoQr codigo={emp.codigo} />
            <CompartirCodigo codigo={emp.codigo} titulo={modo === "inicia" ? "Código para vincular (StarSeed)" : "Respuesta para vincular (StarSeed)"} />
          </div>
          {modo === "inicia" && est?.estado === "esperando-respuesta" ? (
            <LectorCodigo etiqueta="Ahora lee el código de RESPUESTA que te enseña el otro aparato" onCodigo={(t) => void leerRespuesta(t)} ocupado={ocupado} />
          ) : (
            <p className="text-[11px] leading-snug text-foreground/60">
              {modo === "responde" ? "Que el otro aparato lea este código. En cuanto lo lea, el enlace se abre solo." : null}
            </p>
          )}
        </div>
      ) : null}

      {est ? (
        <p className={cn("flex items-center gap-1.5 text-[11px]", est.estado === "fallido" ? "text-amber-200" : "text-foreground/65")}>
          {est.estado === "conectando" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {TEXTO_ESTADO[est.estado]}
          {est.motivo ? ` ${est.motivo}` : ""}
        </p>
      ) : null}
      {aviso ? <p className="text-[11px] text-amber-200">{aviso}</p> : null}
      {est?.estado === "fallido" ? (
        <button type="button" onClick={reiniciar} className={botonSuave}>
          Volver a empezar
        </button>
      ) : null}
    </div>
  );
}

/* ═════════════════════════ Enlaces abiertos ═════════════════════════ */

interface NotaRecibida {
  id: string;
  enlaceId: string;
  texto: string;
  at: number;
  via: string;
}

let notas: NotaRecibida[] = [];
const oyentesNotas = new Set<() => void>();
let escuchandoNotas = false;

function escucharNotas() {
  if (escuchandoNotas) return;
  escuchandoNotas = true;
  alRecibirMensaje("nota", (m) => {
    const texto = typeof (m.cuerpo as { texto?: unknown })?.texto === "string" ? String((m.cuerpo as { texto: string }).texto).slice(0, 500) : "";
    if (!texto) return;
    notas = [{ id: m.id, enlaceId: m.origen.enlaceId, texto, at: m.at, via: m.origen.etiqueta }, ...notas].slice(0, 30);
    for (const f of Array.from(oyentesNotas)) f();
    toast(`Nota de ${m.origen.etiqueta}`, { description: texto.slice(0, 120) });
  });
}

function useNotas(): NotaRecibida[] {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    oyentesNotas.add(f);
    return () => {
      oyentesNotas.delete(f);
    };
  }, []);
  return notas;
}

function desdeHace(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  return m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`;
}

function FilaEnlace({ f }: { f: FotoEnlaceLocal }) {
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [archivo, setArchivo] = useState(false);
  const llamada = useLlamadaDirecta();
  const recibidas = useNotas().filter((n) => n.enlaceId === f.id).slice(0, 3);
  const enLlamada = llamada.fase !== "inactiva" && llamada.fase !== "terminada";

  const mandarNota = async () => {
    const texto = nota.trim();
    if (!texto) return;
    setEnviando(true);
    const r = await enviarMensaje({ enlaceId: f.id }, "nota", { texto });
    setEnviando(false);
    if (r.ok) {
      setNota("");
      toast.success(r.confirmado ? `Entregada por ${r.enlace?.etiqueta ?? "el enlace directo"}` : "Enviada, sin confirmación de llegada");
    } else toast.error(r.motivo ?? "No se pudo enviar.");
  };

  const mandarArchivos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setArchivo(true);
    try {
      for (const file of Array.from(lista)) {
        const destino = f.syncDeviceId ? { syncDeviceId: f.syncDeviceId } : { enlaceId: f.id };
        const r = await enviarArchivo(destino, file, file.name);
        if (!r.ok) toast.error(r.motivo ?? "No se pudo enviar el archivo.");
        else
          toast.success(
            r.enlaces.length > 1
              ? `«${file.name}» va por ${r.enlaces.length} enlaces a la vez: ${r.enlaces.map((e) => e.etiqueta).join(" + ")}`
              : `«${file.name}» va por ${r.enlaces[0]?.etiqueta ?? "el enlace directo"}. Al otro lado le pedirá permiso.`,
          );
      }
    } finally {
      setArchivo(false);
    }
  };

  const llamar = async (video: boolean) => {
    const r = await llamarPorEnlace(f.id, video);
    if (!r.ok) toast.error(r.motivo ?? "No se pudo llamar.");
  };

  return (
    <div className="space-y-2 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.04] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <WifiOff className="h-3.5 w-3.5 text-emerald-300" />
        <span className="text-[12px] font-medium text-foreground">{f.nombre}</span>
        {f.plataforma ? <span className="text-[10px] text-foreground/45">{f.plataforma}</span> : null}
        <button
          type="button"
          onClick={() => enlaceLocal(f.id)?.cerrar()}
          className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] text-foreground/45 hover:text-rose-200"
          title="Cerrar este enlace"
        >
          <Unlink className="h-3 w-3" /> Cerrar
        </button>
      </div>
      <p className="text-[10px] text-foreground/50">
        {[
          "sin internet",
          f.ruta ? etiquetaRuta(f.ruta) : "ruta aún sin medir",
          f.rttMs !== null ? `${f.rttMs} ms` : null,
          f.capacidadKbps ? `${(f.capacidadKbps / 1000).toFixed(1)} Mb/s estimados` : null,
          `abierto ${desdeHace(f.desde)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => void llamar(false)} className={botonSuave} disabled={enLlamada}>
          <Phone className="h-3 w-3" /> Llamar
        </button>
        <button type="button" onClick={() => void llamar(true)} className={botonSuave} disabled={enLlamada}>
          <Video className="h-3 w-3" /> Videollamada
        </button>
        <label className={cn(botonSuave, archivo && "cursor-wait")}>
          {archivo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Enviar archivo
          <input
            type="file"
            multiple
            className="hidden"
            disabled={archivo}
            onChange={(e) => {
              void mandarArchivos(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void mandarNota();
          }}
          maxLength={500}
          placeholder="Nota directa…"
          className="min-w-0 flex-1 rounded-full border border-foreground/10 bg-foreground/[0.03] px-3 py-1 text-[11px] text-foreground/85 placeholder:text-foreground/35"
          aria-label={`Nota para ${f.nombre}`}
        />
        <button type="button" onClick={() => void mandarNota()} disabled={!nota.trim() || enviando} className={botonFuerte} aria-label="Enviar nota">
          {enviando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        </button>
      </div>
      {recibidas.length ? (
        <ul className="space-y-1">
          {recibidas.map((n) => (
            <li key={n.id} className="rounded-lg bg-foreground/[0.04] px-2 py-1 text-[11px] text-foreground/75">
              {n.texto} <span className="text-[9px] text-foreground/40">· {desdeHace(n.at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ═════════════════════════ Panel ═════════════════════════ */

export function VincularSinInternet({ compact = false }: { compact?: boolean }) {
  const enlaces = useEnlacesLocales();
  const { misDispositivos } = useMallaNeuronasEstado();
  const nombre = misDispositivos.find((d) => d.esEsteDispositivo)?.nombre || "Aparato StarSeed";
  const soporte = useMemo(() => soportaEmparejado(), []);

  useEffect(() => {
    asegurarRecepcionLocal();
    asegurarEscuchaLlamadas();
    escucharNotas();
  }, []);

  return (
    <section className={cn("space-y-2.5 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3", compact ? "text-[12px]" : "text-sm")} aria-label="Vincular sin internet">
      <div className="flex flex-wrap items-center gap-2">
        <WifiOff className="h-4 w-4 text-emerald-300" />
        <span className="text-xs font-semibold text-foreground">Vincular sin internet</span>
        {enlaces.length ? (
          <span className="rounded-full border border-emerald-400/30 px-1.5 py-0.5 text-[9px] text-emerald-300">
            {enlaces.length} {enlaces.length === 1 ? "enlace directo" : "enlaces directos"}
          </span>
        ) : null}
      </div>
      <p className="text-[10px] leading-snug text-foreground/50">
        Dos aparatos en el mismo Wi-Fi o en el punto de acceso de un móvil (aunque no tenga datos) se enlazan en directo, sin
        internet ni servidores, pasándose un código. Un navegador no puede descubrir solo a otro aparato sin internet: hace
        falta este gesto (o la app nativa). Notas, archivos y llamadas van por ese enlace.
      </p>

      {soporte.ok ? <Asistente nombre={nombre} /> : <p className="text-[11px] text-amber-200">{soporte.motivo}</p>}

      {enlaces.length ? (
        <div className="space-y-2">
          {enlaces.map((f) => (
            <FilaEnlace key={f.id} f={f} />
          ))}
        </div>
      ) : null}

      <LlamadaDirectaFlotante />
    </section>
  );
}

export { LlamadaDirectaFlotante };
export default VincularSinInternet;
