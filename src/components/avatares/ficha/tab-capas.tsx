"use client";
/**
 * Pestaña «Capas» de la ficha (Ola 1025U · U2): las capas de conciencia del agente, en orden, con peso de 0 a 1.
 * Se pueden añadir, quitar, conectar y reordenar. Incluye la colectiva «Todo StarSeed OS».
 * Honestidad: las cuatro de conciencia (Local, Mesh, Nube, Colectiva) se APLICAN (las lee el enrutador por el ámbito
 * «agente»); «Todo StarSeed OS» y las propias quedan guardadas en la ficha y entran en el prompt del agente.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, Globe2, Layers, Plus, Trash2 } from "lucide-react";
import {
  MAX_CAPAS, agregarCapa, ajustarPesoCapa, capasQueSePuedenAnadir, conectarCapa, moverCapa, quitarCapa,
  type CapaAgente, type ConfigAgente,
} from "@/lib/avatares/agente/config-agente";
import { Aviso, Bloque, BotonFicha, CLASE_CAMPO, Deslizador, FilaInterruptor, InsigniaEstado, porcentaje } from "./ui-ficha";

export interface TabCapasProps {
  config: ConfigAgente;
  actualizar: (cambio: (c: ConfigAgente) => ConfigAgente) => void;
}

const SE_APLICA = new Set(["local", "mesh", "nube", "colectiva"]);

export function TabCapas({ config, actualizar }: TabCapasProps) {
  const { capas } = config;
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const anadibles = capasQueSePuedenAnadir(capas);

  const cambiar = (nuevas: CapaAgente[]) => actualizar((c) => ({ ...c, capas: nuevas }));

  const anadirIntegrada = (id: string) => {
    const r = agregarCapa(capas, { id });
    if (!r.ok) return setError(r.motivo);
    setError(null);
    cambiar(r.capas);
  };

  const anadirPropia = () => {
    const r = agregarCapa(capas, { nombre, descripcion });
    if (!r.ok) return setError(r.motivo);
    setError(null);
    setNombre("");
    setDescripcion("");
    cambiar(r.capas);
  };

  return (
    <div className="space-y-3">
      <Bloque
        icono={Layers}
        titulo="Capas de conciencia"
        ayuda="De más a menos prioridad. El peso dice cuánto cuenta cada capa cuando el agente piensa: 0 no cuenta y 100 % cuenta del todo. Una capa desconectada se queda en la lista sin usarse."
      >
        {capas.length === 0 ? (
          <p data-testid="capas-vacias" className="text-xs text-muted-foreground">Sin capas: este agente hereda las de tu cuenta. Añade alguna abajo.</p>
        ) : (
          <ol className="space-y-2" aria-label="Capas del agente">
            {capas.map((capa, i) => (
              <li key={capa.id} data-capa={capa.id} className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      {capa.tipo === "red-os" && <Globe2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                      <span className="break-words text-sm font-medium text-foreground">{capa.nombre}</span>
                      {SE_APLICA.has(capa.id) ? <InsigniaEstado tipo="aplicado" detalle="El enrutador lee esta capa cuando una petición lleva el id de este agente." /> : <InsigniaEstado tipo="ficha" />}
                    </p>
                    {capa.descripcion && <p className="break-words text-xs text-muted-foreground">{capa.descripcion}</p>}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <BotonFicha icono={ArrowUp} aria-label={`Subir ${capa.nombre}`} disabled={i === 0} onClick={() => cambiar(moverCapa(capas, capa.id, -1))} className="border-transparent px-2" />
                    <BotonFicha icono={ArrowDown} aria-label={`Bajar ${capa.nombre}`} disabled={i === capas.length - 1} onClick={() => cambiar(moverCapa(capas, capa.id, 1))} className="border-transparent px-2" />
                  </div>
                </div>
                <FilaInterruptor
                  id={`capa-${capa.id}-conectada`}
                  etiqueta={`Conectar ${capa.nombre}`}
                  marcado={capa.conectada}
                  alCambiar={(v) => cambiar(conectarCapa(capas, capa.id, v))}
                />
                <Deslizador
                  id={`capa-${capa.id}-peso`}
                  etiqueta={`Peso de ${capa.nombre}`}
                  valor={capa.peso}
                  alCambiar={(v) => cambiar(ajustarPesoCapa(capas, capa.id, v))}
                  formato={porcentaje}
                  deshabilitado={!capa.conectada}
                />
                <BotonFicha variante="peligro" icono={Trash2} aria-label={`Quitar ${capa.nombre}`} onClick={() => cambiar(quitarCapa(capas, capa.id))}>
                  Quitar
                </BotonFicha>
              </li>
            ))}
          </ol>
        )}
      </Bloque>

      <Bloque icono={Plus} titulo="Añadir una capa" ayuda={`Como mucho ${MAX_CAPAS} capas.`}>
        {anadibles.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Capas que se pueden volver a añadir">
            {anadibles.map((c) => (
              <BotonFicha key={c.id} icono={Plus} onClick={() => anadirIntegrada(c.id)}>{c.nombre}</BotonFicha>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="capa-propia-nombre" className="block text-sm text-foreground">Capa propia</label>
          <input id="capa-propia-nombre" className={CLASE_CAMPO} placeholder="Nombre (por ejemplo, Huerto vecinal)" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <label htmlFor="capa-propia-descripcion" className="sr-only">Qué aporta esta capa</label>
          <input id="capa-propia-descripcion" className={CLASE_CAMPO} placeholder="Qué aporta (opcional)" maxLength={160} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <BotonFicha variante="primario" icono={Plus} onClick={anadirPropia}>Añadir capa propia</BotonFicha>
          <p className="text-xs text-muted-foreground">Una capa propia es una perspectiva: entra en cómo el agente se presenta y razona, no conecta con nada externo.</p>
        </div>
        {error && <div className="mt-2"><Aviso tono="error">{error}</Aviso></div>}
      </Bloque>
    </div>
  );
}
