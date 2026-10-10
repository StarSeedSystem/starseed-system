"use client";

/*
 * FuenteEnVivo (2026-10-10) — formulario de «Nueva estación» cuando la fuente es una entonación
 * de Omnifrecuencias o una sesión de espirales de Audiomorphic EN VIVO: enlace de la entonación,
 * de dónde salen sus parámetros, pública o privada, y al publicar los enlaces que hacen falta
 * (escuchar/invitar y controlar desde otro aparato tuyo). SOP:
 * architecture/estaciones-en-vivo-parametricas.md §3.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, KeyRound, Lock, Radio, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { crearSesionEnVivo, type ResultadoNuevaSesion } from "@/lib/estaciones/crear-sesion";
import { base64UrlATexto } from "@/lib/estaciones/cripto-estacion";
import {
  entonacionDeFrecuencia,
  opcionesAudiomorphic,
  opcionesOmnifrecuencias,
  parametrosPegados,
  type OpcionEntonacion,
} from "@/lib/estaciones/opciones-entonacion";
import { ETIQUETA_FUENTE_TRANSMISION, type FuenteTransmision, type ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";
import type { Estacion } from "@/lib/estaciones/tipos";

const WEB_OFICIAL: Record<FuenteTransmision, string> = {
  omnifrecuencias: "https://omnifrecuencias.vercel.app",
  audiomorphic: "https://audiomorphic.vercel.app",
};

type Origen = "lista" | "frecuencia" | "json";

export interface FuenteEnVivoProps {
  fuente: FuenteTransmision;
  ambito?: { tipo: "persona" | "entidad"; ref: string | null };
  onPublicada?: (estacion: Estacion | null, enlace: string) => void;
}

const campo = "flex flex-col gap-1.5";

export function FuenteEnVivo({ fuente, ambito, onPublicada }: FuenteEnVivoProps) {
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [enlace, setEnlace] = useState(WEB_OFICIAL[fuente]);
  const [privada, setPrivada] = useState(false);
  const [origen, setOrigen] = useState<Origen>("lista");
  const [opciones, setOpciones] = useState<OpcionEntonacion[] | null>(null);
  const [elegida, setElegida] = useState("");
  const [hz, setHz] = useState("432");
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<Extract<ResultadoNuevaSesion, { ok: true }> | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setOpciones(null);
    setEnlace(WEB_OFICIAL[fuente]);
    setOrigen("lista");
    (fuente === "omnifrecuencias" ? opcionesOmnifrecuencias() : opcionesAudiomorphic())
      .then((l) => {
        if (!vivo) return;
        setOpciones(l);
        setElegida(l[0]?.id ?? "");
      })
      .catch(() => vivo && setOpciones([]));
    // Llegada desde la app oficial fuera del OS: `/estaciones?nueva=…#p=<JSON en base64url>&t=<título>&e=<enlace>`.
    try {
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const p = h.get("p");
      if (p) {
        setJson(base64UrlATexto(p));
        setOrigen("json");
      }
      if (h.get("t")) setTitulo((h.get("t") ?? "").slice(0, 100));
      if (h.get("e")) setEnlace((h.get("e") ?? "").slice(0, 500));
    } catch {
      /* fragmento ilegible: se rellena a mano */
    }
    return () => {
      vivo = false;
    };
  }, [fuente]);

  const grupos = useMemo(() => {
    const m = new Map<string, OpcionEntonacion[]>();
    for (const o of opciones ?? []) m.set(o.grupo, [...(m.get(o.grupo) ?? []), o]);
    return [...m.entries()];
  }, [opciones]);

  const parametros = (): ParametrosSesion | null => {
    if (origen === "lista") return opciones?.find((o) => o.id === elegida)?.params ?? null;
    if (origen === "frecuencia") return fuente === "omnifrecuencias" ? entonacionDeFrecuencia(Number(hz.replace(",", "."))) : null;
    return parametrosPegados(json, fuente);
  };

  const publicar = async () => {
    setError(null);
    const params = parametros();
    if (!params) {
      setError(origen === "json" ? "Ese JSON no tiene parámetros válidos para esta fuente." : "Elige una entonación válida.");
      return;
    }
    if (titulo.trim().length < 2) {
      setError("El título debe tener entre 2 y 100 caracteres.");
      return;
    }
    setEnviando(true);
    const r = await crearSesionEnVivo({
      fuente,
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      enlace: enlace.trim(),
      params,
      privada,
      categorias: [fuente, "en-vivo"],
      ambito,
    });
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setHecho(r);
    onPublicada?.(r.estacion, r.enlace);
  };

  const copiar = async (texto: string, que: string) => {
    try {
      await navigator.clipboard.writeText(new URL(texto, window.location.origin).toString());
      setCopiado(que);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setError("El portapapeles no responde en este navegador.");
    }
  };

  if (hecho) {
    return (
      <div className="flex flex-col gap-3" data-testid="en-vivo-publicada">
        <p className="flex items-center gap-2 text-sm text-emerald-300">
          <Check className="h-4 w-4" aria-hidden /> Estación en vivo creada{hecho.estacion ? " y publicada en Transmisiones" : ""}.
        </p>
        {hecho.ficha.privada && (
          <p className="text-xs text-white/60">Es privada: no sale en el directorio. Solo entra quien tenga el enlace de invitación (va cifrada con él).</p>
        )}
        {hecho.avisoDirectorio && (
          <p className="text-xs text-amber-200/90">No se pudo publicar en el directorio: {hecho.avisoDirectorio}. La estación funciona igual con su enlace.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={hecho.enlace} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full bg-emerald-500/90 px-4 text-sm font-semibold text-black hover:bg-emerald-400">
            <Radio className="h-4 w-4" aria-hidden /> Abrir la estación
          </Link>
          <button type="button" onClick={() => void copiar(hecho.enlace, "enlace")}
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 text-sm hover:border-white/30">
            <Copy className="h-4 w-4" aria-hidden /> {copiado === "enlace" ? "Copiado" : hecho.ficha.privada ? "Copiar invitación" : "Copiar enlace"}
          </button>
          <button type="button" onClick={() => void copiar(hecho.enlaceControl, "control")}
            title="Lleva la llave de la estación: solo para tus otros aparatos"
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-white/10 px-4 text-sm hover:border-white/30">
            <KeyRound className="h-4 w-4" aria-hidden /> {copiado === "control" ? "Copiado" : "Enlace de control (tus aparatos)"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="fuente-en-vivo">
      <p className="text-xs text-white/60">
        Se transmite la {fuente === "omnifrecuencias" ? "entonación" : "configuración de la espiral"} y una línea de tiempo con un reloj común: cada aparato genera {fuente === "omnifrecuencias" ? "el sonido" : "la imagen"} en local, a la vez. Cabe en cualquier conexión.
      </p>
      <div className={campo}>
        <Label htmlFor="ev-titulo">Título</Label>
        <Input id="ev-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={fuente === "omnifrecuencias" ? "Meditación 432 Hz en grupo" : "Espirales de la luna nueva"} />
      </div>
      <div className={campo}>
        <Label htmlFor="ev-enlace">Enlace de la {fuente === "omnifrecuencias" ? "entonación en Omnifrecuencias" : "sesión en Audiomorphic"}</Label>
        <Input id="ev-enlace" value={enlace} onChange={(e) => setEnlace(e.target.value)} />
        <p className="text-xs text-white/50">El mismo enlace aparece en la app y en Transmisiones de StarSeed OS.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Parámetros</legend>
        <div className="flex flex-wrap gap-2">
          {(["lista", ...(fuente === "omnifrecuencias" ? (["frecuencia"] as const) : []), "json"] as Origen[]).map((o) => (
            <button key={o} type="button" onClick={() => setOrigen(o)} aria-pressed={origen === o}
              className={`min-h-[40px] cursor-pointer rounded-full border px-3 text-xs transition-colors duration-200 ${origen === o ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200" : "border-white/10 text-white/70 hover:border-white/30"}`}>
              {o === "lista" ? "De la biblioteca" : o === "frecuencia" ? "Una frecuencia" : "Pegar JSON de la app"}
            </button>
          ))}
        </div>
        {origen === "lista" && (
          opciones === null ? <p className="text-xs text-white/60">Cargando la biblioteca…</p>
            : opciones.length === 0 ? <p className="text-xs text-white/60">No hay nada guardado en este aparato: usa otra opción.</p>
            : (
              <select value={elegida} onChange={(e) => setElegida(e.target.value)} aria-label="Entonación"
                className="min-h-[44px] w-full cursor-pointer rounded-md border border-white/10 bg-black/40 px-3 text-sm">
                {grupos.map(([g, lista]) => (
                  <optgroup key={g} label={g}>
                    {lista.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </optgroup>
                ))}
              </select>
            )
        )}
        {origen === "frecuencia" && (
          <div className="flex items-center gap-2">
            <Input inputMode="decimal" value={hz} onChange={(e) => setHz(e.target.value)} aria-label="Frecuencia en Hz" className="w-32" />
            <span className="text-sm text-white/60">Hz</span>
          </div>
        )}
        {origen === "json" && (
          <Textarea value={json} onChange={(e) => setJson(e.target.value)} rows={4} aria-label="Parámetros en JSON"
            placeholder={fuente === "omnifrecuencias" ? '[{"frequency":432,"type":"sine","volume":0.6,"panX":0,"panY":0,"panZ":0}]' : '{"k":1.2,"psi":0.3,"baseHue":200}'} />
        )}
      </fieldset>

      <div className={campo}>
        <Label htmlFor="ev-desc">Descripción (opcional)</Label>
        <Textarea id="ev-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién puede entrar">
        <button type="button" role="radio" aria-checked={!privada} onClick={() => setPrivada(false)}
          className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${!privada ? "border-emerald-400/50 text-emerald-200" : "border-white/10 text-white/70"}`}>
          <Globe2 className="h-4 w-4" aria-hidden /> Pública (sale en Transmisiones)
        </button>
        <button type="button" role="radio" aria-checked={privada} onClick={() => setPrivada(true)}
          className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${privada ? "border-amber-400/50 text-amber-200" : "border-white/10 text-white/70"}`}>
          <Lock className="h-4 w-4" aria-hidden /> Privada (solo con invitación)
        </button>
      </div>

      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={() => void publicar()} disabled={enviando} className="min-h-[44px] cursor-pointer">
          {enviando ? "Creando…" : `Publicar en vivo · ${ETIQUETA_FUENTE_TRANSMISION[fuente]}`}
        </Button>
      </div>
    </div>
  );
}
