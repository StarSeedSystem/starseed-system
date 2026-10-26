"use client";
/**
 * Pestaña «Cerebro» de la ficha (Ola 1025U · U2): memoria propia o vinculada a un cerebro de la cuenta, modo de
 * memoria (individual, colectiva, telepática) y vínculos telepáticos. La sincronía NO se reimplementa: se reutilizan
 * `VinculoTelepatico` y `planSincronizacion` de `lib/cerebros/telepatia`, y para un cerebro vinculado se abre el
 * mismo diálogo de Telepatía que ya usa la página de Cerebros.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Brain, Link2, Network, RefreshCw, Unlink, Users, User, Waypoints } from "lucide-react";
import type { Brain as CerebroDB } from "@/lib/brains/brains";
import type { RecuerdoBot } from "@/lib/astraura-bots/memoria-bot";
import { accesoEnPalabras, destinoEnPalabras, direccionEnPalabras, estadoConMotivo } from "@/lib/cerebros/telepatia";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  ETIQUETA_AMBITO, ETIQUETA_MODO, MODOS_MEMORIA, agregarVinculo, ambitoDeBrain, elegirModoMemoria, planTelepatiaAgente, ponerSincronizacionAuto,
  ponerTransferenciaAuto, puedeVincularCerebro, quitarVinculo, recuerdosParaDestino, usarCerebroPropio, vincularCerebro, limpiarTexto,
  type ConfigAgente, type ModoMemoria,
} from "@/lib/avatares/agente/config-agente";
import { recuerdosVisibles } from "@/lib/avatares/agente/desarrollo";
import {
  Aviso, Bloque, BotonFicha, CLASE_CAMPO, CLASE_SELECT, FilaInterruptor, GrupoRadio, type OpcionRadio,
} from "./ui-ficha";

// El diálogo es pesado y solo se necesita al abrirlo: carga perezosa.
const TelepatiaDialog = lazy(() => import("@/components/cerebro/telepatia-dialog"));

type Carga = "cargando" | "ok" | "error";

export interface TabCerebroProps {
  agente: AgenteMundoRef;
  config: ConfigAgente;
  recuerdos: RecuerdoBot[];
  actualizar: (cambio: (c: ConfigAgente) => ConfigAgente) => void;
  ahora: number;
}

const OPCIONES_MEMORIA: readonly OpcionRadio<ModoMemoria>[] = MODOS_MEMORIA.map((m) => ({
  valor: m, titulo: ETIQUETA_MODO[m].nombre, ayuda: ETIQUETA_MODO[m].ayuda,
  icono: m === "individual" ? User : m === "colectiva" ? Users : Waypoints,
}));

export function TabCerebro({ agente, config, recuerdos, actualizar, ahora }: TabCerebroProps) {
  const { cerebro } = config;
  const [cerebros, setCerebros] = useState<CerebroDB[]>([]);
  const [carga, setCarga] = useState<Carga>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [direccion, setDireccion] = useState<"ambas" | "enviar" | "recibir">("ambas");
  const [acceso, setAcceso] = useState<"leer" | "escribir">("leer");
  const [abierto, setAbierto] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    setCarga("cargando");
    try {
      const { listarCerebros } = await import("@/lib/brains/brains");
      const r = await listarCerebros();
      if (!vivo.current) return;
      setCerebros(r.ok ? r.brains : []);
      setCarga(r.ok ? "ok" : "error");
    } catch {
      if (vivo.current) setCarga("error");
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    return () => { vivo.current = false; };
  }, [cargar]);

  const visibles = useMemo(() => recuerdosVisibles(recuerdos, agente), [recuerdos, agente]);
  const vinculado = cerebro.vinculado;
  const cerebroVinculado = vinculado ? cerebros.find((c) => c.id === vinculado.brainId) ?? null : null;
  const yaVinculados = new Set(cerebro.vinculos.map((v) => v.destino.id));
  const candidatosTelepatia = cerebros.filter((c) => !yaVinculados.has(c.id));

  const elegirTipo = (tipo: "propio" | "vinculado") => {
    if (tipo === "propio") {
      setError(null);
      setEligiendo(false);
      actualizar((c) => usarCerebroPropio(c));
    } else if (!vinculado) {
      // Todavía no hay cerebro elegido: se elige en el selector de abajo; no se cambia nada hasta entonces.
      setError(null);
      setEligiendo(true);
    }
  };
  const mostrarSelector = cerebro.tipo === "vinculado" || eligiendo;

  const alElegirCerebro = (id: string) => {
    const elegido = cerebros.find((c) => c.id === id);
    if (!elegido) return;
    const v = puedeVincularCerebro(agente, elegido);
    if (!v.ok) {
      setError(v.motivo);
      return;
    }
    setError(null);
    actualizar((c) => {
      const r = vincularCerebro(c, agente, { id: elegido.id, name: elegido.name, scope: elegido.scope, scope_ref: elegido.scope_ref });
      return r.ok ? r.config : c;
    });
    setEligiendo(false);
  };

  const alVincularTelepatia = () => {
    const elegido = cerebros.find((c) => c.id === destino);
    if (!elegido) return;
    const r = agregarVinculo(config, agente, { id: elegido.id, name: elegido.name, scope: elegido.scope, scope_ref: elegido.scope_ref }, Date.now(), { direccion, acceso });
    if (!r.ok) {
      setError(r.motivo);
      return;
    }
    setError(null);
    setDestino("");
    actualizar(() => r.config);
  };

  return (
    <div className="space-y-3">
      <Bloque
        icono={Brain}
        titulo="De dónde sale su memoria"
        estado="ficha"
        ayuda="Un agente puede tener su propio cerebro o usar uno que ya tienes. Solo ve los cerebros de un ámbito que su memoria permite: un agente público nunca lee lo personal de nadie."
      >
        <GrupoRadio
          etiqueta="Tipo de cerebro"
          valor={mostrarSelector ? "vinculado" : "propio"}
          alCambiar={elegirTipo}
          opciones={[
            { valor: "propio", titulo: "Cerebro propio", ayuda: "Su memoria, solo suya. Vive en este aparato.", icono: Brain },
            { valor: "vinculado", titulo: "Cerebro de mi cuenta", ayuda: "Usa uno de tus cerebros (cuenta, perfil, grupo, página o publicación).", icono: Link2 },
          ]}
        />

        {!mostrarSelector && (
          <div className="mt-3">
            <label htmlFor="cerebro-nombre" className="mb-1 block text-sm text-foreground">Nombre de su cerebro</label>
            <input
              id="cerebro-nombre"
              className={CLASE_CAMPO}
              maxLength={80}
              value={cerebro.nombre}
              onChange={(e) => {
                const nombre = limpiarTexto(e.target.value, 80);
                actualizar((c) => ({ ...c, cerebro: { ...c.cerebro, nombre } }));
              }}
            />
            <p className="mt-1 text-xs text-muted-foreground">Es una memoria propia del agente: no crea ningún cerebro nuevo en tu cuenta.</p>
          </div>
        )}

        {mostrarSelector && (
          <div className="mt-3 space-y-2">
            {carga === "cargando" && <p role="status" className="text-xs text-muted-foreground">Cargando tus cerebros…</p>}
            {carga === "error" && (
              <div className="space-y-2">
                <Aviso>No se pudieron cargar tus cerebros. Hace falta haber iniciado sesión y tener conexión.</Aviso>
                <BotonFicha icono={RefreshCw} onClick={() => void cargar()}>Reintentar</BotonFicha>
              </div>
            )}
            {carga === "ok" && cerebros.length === 0 && (
              <p className="break-words text-xs text-muted-foreground">
                Todavía no tienes cerebros. Crea uno en <Link href="/cerebros" className="cursor-pointer underline underline-offset-2">Cerebros</Link>.
              </p>
            )}
            {carga === "ok" && cerebros.length > 0 && (
              <>
                <label htmlFor="cerebro-vinculado" className="block text-sm text-foreground">Cerebro vinculado</label>
                <select
                  id="cerebro-vinculado"
                  className={CLASE_SELECT}
                  value={vinculado?.brainId ?? ""}
                  onChange={(e) => alElegirCerebro(e.target.value)}
                >
                  <option value="" disabled className="bg-background text-foreground">Elige un cerebro…</option>
                  {cerebros.map((c) => {
                    const ok = puedeVincularCerebro(agente, c).ok;
                    return (
                      <option key={c.id} value={c.id} disabled={!ok} className="bg-background text-foreground">
                        {c.name} · {ETIQUETA_AMBITO[ambitoDeBrain(c.scope)]}{ok ? "" : " (no permitido para este agente)"}
                      </option>
                    );
                  })}
                </select>
                {vinculado && !cerebroVinculado && (
                  <Aviso>No encuentro el cerebro «{vinculado.nombre}» en tu cuenta. Puede que se haya borrado: elige otro o vuelve al cerebro propio.</Aviso>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground">
              Gestiona tus cerebros en <Link href="/cerebros" className="cursor-pointer underline underline-offset-2">Cerebros</Link>.
            </p>
          </div>
        )}
        {error && <div className="mt-2"><Aviso tono="error">{error}</Aviso></div>}
      </Bloque>

      <Bloque
        icono={Network}
        titulo="Modo de memoria"
        estado="ficha"
        ayuda="Cómo se comparte lo que aprende. El alcance manda siempre: personal › perfil › grupo › público, y un recuerdo nunca pasa a un ámbito más abierto que el suyo."
      >
        <GrupoRadio etiqueta="Modo de memoria" opciones={OPCIONES_MEMORIA} valor={cerebro.memoria} alCambiar={(m) => actualizar((c) => elegirModoMemoria(c, m))} />
        <div className="mt-2">
          <FilaInterruptor
            id="cerebro-sync-auto"
            etiqueta="Sincronizar solo"
            ayuda="Los vínculos telepáticos nuevos y los actuales se sincronizan sin pedírtelo."
            marcado={cerebro.sincronizacionAuto}
            alCambiar={(v) => actualizar((c) => ponerSincronizacionAuto(c, v))}
          />
          <FilaInterruptor
            id="cerebro-transfer-auto"
            etiqueta="Transferir recuerdos entre mis neuronas"
            ayuda="Sus recuerdos pasan solos entre tus aparatos, con las reglas de alcance: lo personal nunca sale de tu cuenta."
            marcado={cerebro.transferenciaAuto}
            alCambiar={(v) => actualizar((c) => ponerTransferenciaAuto(c, v))}
          />
        </div>
      </Bloque>

      {cerebro.memoria === "telepatica" && (
        <Bloque
          icono={Waypoints}
          titulo="Telepatía"
          estado="ficha"
          ayuda="Vincula su memoria con otros cerebros tuyos. La sincronización es la misma de Cerebros → Telepatía."
        >
          {vinculado ? (
            <div className="space-y-2">
              <p className="break-words text-sm text-foreground">
                Su memoria es la del cerebro «{vinculado.nombre}». Sus vínculos telepáticos se gestionan en ese cerebro.
              </p>
              <BotonFicha
                variante="primario"
                icono={Waypoints}
                disabled={!cerebroVinculado}
                onClick={() => setAbierto(true)}
              >
                Abrir la telepatía de este cerebro
              </BotonFicha>
              {!cerebroVinculado && <p className="text-xs text-muted-foreground">Disponible cuando se carguen tus cerebros.</p>}
              {abierto && cerebroVinculado && (
                <Suspense fallback={<p role="status" className="text-xs text-muted-foreground">Abriendo…</p>}>
                  <TelepatiaDialog open={abierto} onOpenChange={setAbierto} cerebro={cerebroVinculado} cerebros={cerebros} onHecho={() => void cargar()} />
                </Suspense>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {cerebro.vinculos.length === 0 ? (
                <p data-testid="telepatia-sin-vinculos" className="text-xs text-muted-foreground">Todavía no está vinculado a ningún cerebro.</p>
              ) : (
                <ul className="space-y-2" aria-label="Vínculos telepáticos">
                  {cerebro.vinculos.map((v) => {
                    const otro = cerebros.find((c) => c.id === v.destino.id);
                    const est = estadoConMotivo(v, ahora);
                    let plan = "No encuentro ese cerebro, así que no puedo calcular qué se sincronizaría.";
                    if (!visibles.length) plan = "Todavía no tiene recuerdos que sincronizar.";
                    else if (otro) {
                      const puede = recuerdosParaDestino(visibles, ambitoDeBrain(otro.scope)).length;
                      const hechos = planTelepatiaAgente(v, visibles, [], ambitoDeBrain(otro.scope)).filter((o) => o.tipo === "archivo" && o.de === "origen").length;
                      plan = est.estado === "activo"
                        ? `Pasarían ${hechos} de sus ${visibles.length} recuerdos${puede < visibles.length ? `; ${visibles.length - puede} se quedan porque son más privados que ese cerebro` : ""}.`
                        : "Mientras no esté activo, no se sincroniza nada.";
                    }
                    return (
                      <li key={v.id} className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium text-foreground">{destinoEnPalabras(v, cerebros)}</p>
                            <p className="break-words text-xs text-muted-foreground">
                              {direccionEnPalabras(v.direccion)} · {accesoEnPalabras(v.acceso)} · {v.auto ? "automático" : "manual"}
                            </p>
                            <p className="break-words text-xs text-muted-foreground">{est.motivo}</p>
                            <p className="break-words text-xs text-muted-foreground">{plan}</p>
                          </div>
                          <BotonFicha icono={Unlink} aria-label={`Quitar el vínculo con ${destinoEnPalabras(v, cerebros)}`} onClick={() => actualizar((c) => quitarVinculo(c, v.id))} className="shrink-0 border-transparent" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {carga === "ok" && candidatosTelepatia.length > 0 && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                  <label htmlFor="telepatia-destino" className="block text-sm text-foreground">Vincular con otro cerebro</label>
                  <select id="telepatia-destino" className={CLASE_SELECT} value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="" className="bg-background text-foreground">Elige un cerebro…</option>
                    {candidatosTelepatia.map((c) => {
                      const ok = puedeVincularCerebro(agente, c).ok;
                      return (
                        <option key={c.id} value={c.id} disabled={!ok} className="bg-background text-foreground">
                          {c.name} · {ETIQUETA_AMBITO[ambitoDeBrain(c.scope)]}{ok ? "" : " (no permitido)"}
                        </option>
                      );
                    })}
                  </select>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label htmlFor="telepatia-direccion" className="mb-1 block text-xs text-muted-foreground">Dirección</label>
                      <select id="telepatia-direccion" className={CLASE_SELECT} value={direccion} onChange={(e) => setDireccion(e.target.value as typeof direccion)}>
                        {(["ambas", "enviar", "recibir"] as const).map((d) => (
                          <option key={d} value={d} className="bg-background text-foreground">{direccionEnPalabras(d)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="telepatia-acceso" className="mb-1 block text-xs text-muted-foreground">Acceso</label>
                      <select id="telepatia-acceso" className={CLASE_SELECT} value={acceso} onChange={(e) => setAcceso(e.target.value as typeof acceso)}>
                        {(["leer", "escribir"] as const).map((a) => (
                          <option key={a} value={a} className="bg-background text-foreground">{accesoEnPalabras(a)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <BotonFicha variante="primario" icono={Link2} disabled={!destino} onClick={alVincularTelepatia}>Vincular</BotonFicha>
                </div>
              )}
              {carga === "error" && <Aviso>Para vincular con otros cerebros hace falta poder cargarlos: reintenta arriba.</Aviso>}
              {carga === "ok" && cerebros.length === 0 && <p className="text-xs text-muted-foreground">Aún no tienes cerebros con los que vincularte.</p>}
            </div>
          )}
        </Bloque>
      )}
    </div>
  );
}
