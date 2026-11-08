"use client";

/**
 * AjustePuertaInternet — Ajustes › Neuronas › Medios: internet compartido por la malla (PTA1108A · 2026-11-08).
 * Contrato: `architecture/red-sin-dependencias.md` §5.3. «Compartir mi internet con mis neuronas» (encendido) y
 * «con otras cuentas» (Nunca / Preguntar / Automático), «Internet por: <neurona> (vía …)» en quien usa la puerta y
 * «Compartiendo internet con: …» con botón de parar en quien la presta. Solo se muestra en la app nativa.
 */

import { useSyncExternalStore } from "react";
import { Globe2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ModoOtrasCuentas } from "@/lib/malla/puerta/politica";
import { cambiarAjustesPuerta, estadoPuerta, pararDeCompartir, permitirCapasANeurona, responderPregunta, revocarVecina, suscribirPuerta } from "@/lib/malla/puerta/servicio";
import type { CapaPuerta, TipoCapa } from "@/lib/malla/puerta/capas"; // PTA1108C

const NOMBRE_CAPA: Record<TipoCapa, string> = { "servidor-propio": "Servidor propio", lan: "Red local", "router-publico": "Router" };

/** PTA1108C · «Servidor propio · api.casa.lan:8443 · 12 ms». */
export function resumenCapa(c: CapaPuerta): string {
  const donde = c.tipo === "lan" ? c.cidrs.join(", ") : [...c.hosts, ...c.cidrs.filter((r) => !r.endsWith("/32"))].slice(0, 2).join(", ") + (c.puertos.length ? `:${c.puertos.join("/")}` : "");
  const lat = typeof c.latenciaMs === "number" ? ` · ${Math.round(c.latenciaMs)} ms` : "";
  return `${NOMBRE_CAPA[c.tipo]}${donde ? ` · ${donde}` : ""}${lat}`;
}

const MODOS: Array<{ id: ModoOtrasCuentas; nombre: string; detalle: string }> = [
  { id: "nunca", nombre: "Nunca", detalle: "Ninguna otra cuenta usa mi internet." },
  { id: "preguntar", nombre: "Preguntar", detalle: "Cada vez que otra cuenta pide salir por mí, me lo pregunta (y puedo recordar la respuesta)." },
  { id: "automatico", nombre: "Automático", detalle: "Sirvo a otras cuentas con topes más bajos que para las mías." },
];

export const mib = (b: number): string => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MiB` : `${Math.max(1, Math.round(b / 1024))} KiB`);

export function AjustePuertaInternet() {
  const s = useSyncExternalStore(suscribirPuerta, estadoPuerta, estadoPuerta);
  // El servicio lo arranca `malla-neuronas-mount.tsx`; esta tarjeta solo lo muestra y lo ajusta.
  if (!s.nativo) return null;
  const a = s.ajustes;
  const diaMib = Math.round(a.topesMias.bytesDia / 1024 / 1024);

  return (
    <Card className="bg-background/40 backdrop-blur-sm" data-testid="ajuste-puerta-internet">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe2 className="h-4 w-4 text-[#39FF14]" aria-hidden /> Medios · Internet compartido por la malla
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Una neurona con internet presta su salida a las demás por Bluetooth, Wi‑Fi directo o la red local, de forma automática y con topes. Lo que viaja va cifrado de punta a punta
          con el sitio al que llegas: quien presta la puerta ve a qué servidor te conectas, no lo que dices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {s.internetPor ? (
          <p className="rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/5 px-3 py-2 text-emerald-200" data-testid="internet-por">
            Internet por: <strong>{s.internetPor.nombre}</strong> (vía {s.internetPor.enlace}
            {s.internetPor.saltos ? `, ${s.internetPor.saltos} ${s.internetPor.saltos === 1 ? "salto" : "saltos"}` : ""})
          </p>
        ) : !s.conInternet ? (
          <p className="rounded-lg border border-amber-400/30 px-3 py-2 text-amber-200" data-testid="sin-salida">
            {s.puertas.length ? `Sin salida propia. Puertas cercanas: ${s.puertas.map((p) => `${p.nombre} (${p.enlace})`).join(", ")}.` : "Sin salida propia y ninguna neurona cercana presta la suya."}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Esta neurona tiene salida propia. {s.puertas.length ? `Respaldo: ${s.puertas.length} ${s.puertas.length === 1 ? "puerta" : "puertas"} más.` : ""}</p>
        )}

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
          <input type="checkbox" checked={a.misNeuronas} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, misNeuronas: e.target.checked }))} className="mt-1 accent-[#39FF14]" />
          <span>
            <span className="font-medium">Compartir mi internet con mis neuronas</span>
            <span className="block text-xs text-muted-foreground">
              Hasta {diaMib} MiB al día, con batería por encima del {Math.round(a.topesMias.bateriaMin * 100)} % (o cargando) y sin gastar datos móviles.
            </span>
          </span>
        </label>

        <fieldset className="space-y-1.5" aria-label="Compartir mi internet con otras cuentas">
          <legend className="mb-1 font-medium">Con otras cuentas</legend>
          {MODOS.map((m) => (
            <label
              key={m.id}
              className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors", a.otrasCuentas === m.id ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/10 hover:border-white/25")}
            >
              <input type="radio" name="puerta-otras" checked={a.otrasCuentas === m.id} onChange={() => cambiarAjustesPuerta((x) => ({ ...x, otrasCuentas: m.id }))} className="mt-1 accent-[#39FF14]" />
              <span>
                <span className="font-medium">{m.nombre}</span>
                <span className="block text-xs text-muted-foreground">{m.detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
          <input type="checkbox" checked={a.usarPuertas} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, usarPuertas: e.target.checked }))} className="mt-1 accent-[#39FF14]" />
          <span>
            <span className="font-medium">Usar la puerta de otra neurona cuando me falte internet</span>
            <span className="block text-xs text-muted-foreground">Elige sola la mejor y cambia a otra si se cae.</span>
          </span>
        </label>

        {/* PTA1108C · Capas distintas de internet: servidores propios, red local y routers. */}
        <fieldset className="space-y-2" aria-label="Otras capas de red que comparte esta neurona" data-testid="capas-puerta">
          <legend className="mb-1 font-medium">Otras capas que comparto</legend>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
            <input type="checkbox" checked={a.compartirServidoresPropios} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, compartirServidoresPropios: e.target.checked }))} className="mt-1 accent-[#39FF14]" />
            <span>
              <span className="font-medium">Compartir mis servidores propios con mis neuronas</span>
              <span className="block text-xs text-muted-foreground">Una neurona mía fuera de casa llega a mi servidor a través de esta. Solo mi cuenta, solo el servidor y los puertos declarados.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2">
            <input type="checkbox" checked={a.compartirRedLocal} onChange={(e) => cambiarAjustesPuerta((x) => ({ ...x, compartirRedLocal: e.target.checked }))} className="mt-1 accent-[#39FF14]" />
            <span>
              <span className="font-medium">Compartir mi red local con mis neuronas</span>
              <span className="block text-xs text-muted-foreground">Apagado por defecto. Otras cuentas nunca entran en tu red local salvo que lo permitas neurona por neurona.</span>
            </span>
          </label>
          <p className="text-xs text-muted-foreground" data-testid="capas-propias">
            {s.capasPropias.length
              ? `Esta neurona alcanza: ${s.capasPropias.map((c) => `${resumenCapa(c)}${(c.tipo === "lan" ? a.compartirRedLocal : a.compartirServidoresPropios) ? " (compartida)" : " (no compartida)"}`).join("; ")}.`
              : "Esta neurona no detecta servidores propios ni red local que compartir."}
          </p>
          {s.puertas.some((p) => p.capas.length > 0) && (
            <ul className="space-y-0.5 text-xs text-muted-foreground" data-testid="capas-de-puertas" aria-label="Capas que ofrecen las puertas cercanas">
              {s.puertas.filter((p) => p.capas.length > 0).map((p) => (
                <li key={p.id}>
                  <strong>{p.nombre}</strong> ofrece: {p.capas.map(resumenCapa).join("; ")}
                </li>
              ))}
            </ul>
          )}
          {Object.keys(a.capasPorNeurona).length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground" data-testid="permisos-capas">
              {Object.entries(a.capasPorNeurona).map(([id, tipos]) => (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span>{id.slice(0, 8)} (otra cuenta) puede usar: {tipos.map((t) => NOMBRE_CAPA[t]).join(", ")}</span>
                  <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => permitirCapasANeurona(id, [])}>Retirar</Button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {s.preguntas.map((p) => (
          <div key={p.id} className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/5 px-3 py-2" role="alertdialog" aria-label="Petición de internet de otra cuenta">
            <p>
              <strong>{p.nombre}</strong> (otra cuenta) quiere salir a internet por esta neurona hacia <code className="text-xs">{p.host}</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="cursor-pointer" onClick={() => responderPregunta(p.id, "permitir")}>Permitir esta vez</Button>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => responderPregunta(p.id, "siempre")}>Permitir siempre</Button>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => responderPregunta(p.id, "denegar")}>No</Button>
              <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => responderPregunta(p.id, "nunca")}>Nunca</Button>
            </div>
          </div>
        ))}

        {s.compartiendo.length > 0 && (
          <div className="space-y-1.5" data-testid="compartiendo">
            <p className="flex items-center justify-between gap-2">
              <span>
                Compartiendo internet con: <strong>{[...new Set(s.compartiendo.map((c) => c.nombre))].join(", ")}</strong>
              </span>
              <Button size="sm" variant="destructive" className="cursor-pointer" onClick={() => pararDeCompartir()}>Parar</Button>
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {s.compartiendo.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2">
                  <span>
                    {c.nombre} · {c.rol === "rele" ? "pasando por aquí" : `hacia ${c.host}`} · {mib(c.bytes)} <Badge variant="outline">{c.grupo === "mias" ? "mi cuenta" : "otra cuenta"}</Badge>
                  </span>
                  {c.grupo === "otras" && c.rol === "puerta" && !a.capasPorNeurona[c.de] && (
                    <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => permitirCapasANeurona(c.de, ["servidor-propio", "lan"])}>Permitir mis capas</Button>
                  )}
                  <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => revocarVecina(c.de)}>Revocar</Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Hoy se han servido {mib(s.bytesHoy.mias)} a mis neuronas y {mib(s.bytesHoy.otras)} a otras cuentas.
          {s.proxyLocal ? ` Proxy local para el navegador de la app activo en 127.0.0.1:${s.proxyLocal}.` : ""}
        </p>
        {s.auditoria.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Últimos usos (quién, dónde y cuánto; nunca el contenido)</summary>
            <ul className="mt-1 space-y-0.5">
              {s.auditoria.map((r) => (
                <li key={`${r.t}-${r.de}-${r.host}`}>
                  {new Date(r.t).toLocaleTimeString()} · {r.de.slice(0, 8)} → {r.host}:{r.puerto} · {mib(r.bytes)} · {r.resultado}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
