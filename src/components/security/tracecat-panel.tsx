"use client";

// Tarjeta «Respuesta a incidentes · Tracecat» · INF1025C · Ola 1025R (infra).
// Honesta y desactivada: qué saldría (eventos YA saneados: lista blanca, falla
// cerrado), qué NO sale nunca y cómo se activará (INF1026). No envía nada:
// sin fetch, sin `process.env`, sin `node:*`; el envío real, por safeFetch.

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EyeOff, HeartHandshake, Siren } from "lucide-react";
import { construirEventoSeguridad } from "@/lib/security/eventos-seguridad";
import { describirEnvio, prepararEnvio } from "@/lib/security/tracecat-conector";

const AHORA_EJEMPLO = 1770000000000;
// Ejemplos en ejecución: no son claves reales, no se muestran (los de verdad van en el SERVIDOR).
const SECRETO_EJEMPLO = "s" + "e".repeat(23);
const DESTINO_EJEMPLO = "https://tracecat.de-tu-servidor.internal/webhooks/starseed";

const EVENTO_EJEMPLO = construirEventoSeguridad(
  { tipo: "limite-peticiones", severidad: "media", elemento: "api", contador: 2, detalle: { ruta: "/api/feed", limite: 120, ventanaMs: 60000 } },
  AHORA_EJEMPLO,
);

const TIPOS_EJEMPLO = [
  { tipo: "secreto-detectado", detalle: { familia: "detector-claves", campo: "cuerpo" } },
  { tipo: "limite-peticiones", detalle: { ruta: "/api/feed", limite: 120, ventanaMs: 60000 } },
  { tipo: "ssrf-bloqueado", detalle: { clase: "privada", motivo: "rango-reservado" } },
  { tipo: "csp-informe", detalle: { directiva: "script-src", codigo: "400" } },
  { tipo: "repeticion-rechazada", detalle: { ventanaMs: 60000, motivo: "nonce-repetido" } },
  { tipo: "invariante-violada", detalle: { invariante: "entidad-unica", paso: "publicar" } },
  { tipo: "hallazgo-strix", detalle: { familia: "cabeceras", campo: "csp" } },
  { tipo: "acceso-inusual", detalle: { medio: "elasticidad-de-cuenta", ventanaMs: 300000 } },
] as const;

const LISTA_TIPOS = TIPOS_EJEMPLO.map((e) => ({
  tipo: e.tipo,
  resumen: construirEventoSeguridad({ ...e, severidad: "media", elemento: "app" }, AHORA_EJEMPLO)?.resumen ?? "",
}));

export default function TracecatPanel() {
  const [vista, setVista] = useState("");
  useEffect(() => {
    let vivo = true;
    if (EVENTO_EJEMPLO)
      void prepararEnvio(EVENTO_EJEMPLO, DESTINO_EJEMPLO, SECRETO_EJEMPLO, AHORA_EJEMPLO).then((p) => {
        if (vivo) setVista(describirEnvio(p));
      });
    return () => { vivo = false; };
  }, []);
  return (
    <Card className="border-rose-400/20 bg-gradient-to-br from-rose-500/[0.06] via-background/40 to-amber-500/[0.06]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Siren className="h-5 w-5 text-rose-400" /> Respuesta a incidentes · Tracecat
          <Badge variant="outline" className="border-amber-400/30 bg-amber-500/10 text-amber-300">Sin conectar</Badge>
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Tracecat reúne, prioriza y resuelve lo que el OS ya detecta. Todavía no se envía nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <section aria-label="Qué saldría" className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-rose-300/70">Qué saldría</h3>
          <ul className="space-y-1">
            {LISTA_TIPOS.map((l) => (
              <li key={l.tipo} className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
                <code className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-rose-200">{l.tipo}</code>
                <span>{l.resumen}</span>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-label="Vista previa del envío"
          className="rounded-lg border border-white/5 bg-black/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground"
        >
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="border-white/15 text-[10px] text-rose-200">{EVENTO_EJEMPLO?.tipo}</Badge>
            <Badge variant="outline" className="border-white/15 text-[10px]">{EVENTO_EJEMPLO?.severidad}</Badge>
            <Badge variant="outline" className="border-white/15 text-[10px]">{EVENTO_EJEMPLO?.elemento}</Badge>
            <span>nº {EVENTO_EJEMPLO?.contador ?? 1}</span>
          </div>
          <p>{EVENTO_EJEMPLO?.resumen}</p>
          <p className="mt-1 text-white/70">{vista || "Preparando la firma de ejemplo…"}</p>
        </section>
        <p className="flex items-start gap-2 rounded-lg border border-sky-400/15 bg-sky-500/[0.06] p-2.5 text-[11px] text-sky-100/80">
          <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-300" />
          <span>Qué NO sale nunca: <b>correos</b>, <b>direcciones IP</b>, <b>claves o tokens</b>, <b>mensajes</b> ni contenido de nadie.</span>
          <span>Solo vocabulario cerrado y contadores: la identidad de cada persona se queda dentro.</span>
        </p>
        <section aria-label="Cómo se activará" className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-rose-300/70">Cómo se activa (3 pasos)</h3>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Un servidor de 8 núcleos y 16 GB (no cabe en el A1 ni en la Mac); lo coloca la bolsa de recursos.</li>
            <li>
              Poner la URL y el secreto del webhook en variables de entorno del <b>servidor</b>{" "}
              (<code>TRACECAT_WEBHOOK_URL</code>, <code>TRACECAT_WEBHOOK_SECRET</code>): jamás en el navegador.
            </li>
            <li>Activar el envío, que llega con la siguiente ola (INF1026).</li>
          </ol>
        </section>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
          <Label htmlFor="tracecat-activar-envio" className="text-xs text-white/80">
            Activar el envío<span className="ml-2 font-normal text-white/45">· llega con la siguiente ola</span>
          </Label>
          <Switch id="tracecat-activar-envio" checked={false} disabled className="opacity-60" />
        </div>
        <p className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-500/[0.07] p-2.5 text-[11px] text-amber-100/85">
          <HeartHandshake className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span><span className="font-semibold text-amber-200">Aviso.</span> Ninguna respuesta castiga automáticamente.</span>
          <span>Lo que toque a una persona lo decide un humano o un Círculo de Paz.</span>
        </p>
      </CardContent>
    </Card>
  );
}
