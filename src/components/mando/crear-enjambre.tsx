"use client";

import { useState } from "react";
import { validarPaso, resumenEnjambre, type DatosAsistente, type TipoMotor, type PlantillaOla, type AlcanceMemoria, type Horario } from "@/lib/mando/crear-enjambre-pasos";

export function CrearEnjambre() {
  const habilitado = process.env.NEXT_PUBLIC_STARSEED_MANDO_TODOS === "1" || (typeof process !== "undefined" && process.env.STARSEED_MANDO_TODOS === "1");
  if (!habilitado) return null;

  const [paso, setPaso] = useState(1);
  const [datos, setDatos] = useState<DatosAsistente>({
    ambitoTipo: "persona",
    motor: { tipo: "local" },
    proveedores: ["llm7"],
    directores: { chat: true, optimizador: false, diseño: false, producción: false, nube: false, medidores: false },
    plantilla: "vacía",
    limites: {
      presupuestoTokensDia: 5000,
      pagoPermitido: false,
      horario: "24/7",
      visibilidad: "privado",
      alcanceMemoria: "perfil",
    },
  });
  const [token, setToken] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [errorCreacion, setErrorCreacion] = useState<string | null>(null);

  const puedeAvanzar = validarPaso(paso, datos).valido;

  const avanzar = () => {
    if (!puedeAvanzar) return;
    if (paso < 5) {
      setPaso((p) => p + 1);
      setErrorCreacion(null);
    } else {
      crear();
    }
  };

  const crear = async () => {
    setErrorCreacion(null);
    setToken(null);
    if (!datos.ambitoId || !datos.ambitoId.trim()) {
      setErrorCreacion("falta el id del ámbito");
      return;
    }
    setCreando(true);
    try {
      const resMotor = await fetch(`/api/mando/ambitos/${encodeURIComponent(datos.ambitoId)}/motores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motor: datos.motor?.tipo ?? "local",
          proveedores: datos.proveedores ?? [],
        }),
      });
      const jMotor = await resMotor.json().catch(() => ({}));
      if (!resMotor.ok) {
        setErrorCreacion(jMotor.motivo || jMotor.error || `error ${resMotor.status} al crear el motor`);
        setCreando(false);
        return;
      }
      if (!jMotor.token || typeof jMotor.token !== "string") {
        setErrorCreacion("el servidor no devolvió un token de motor válido");
        setCreando(false);
        return;
      }
      setToken(jMotor.token);

      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error: errEnjambre } = await supabase.from("mando_enjambres").insert({
        ambito_id: datos.ambitoId,
        nombre: `Enjambre de ${datos.ambitoId}`,
        config: datos,
      });
      if (errEnjambre) {
        setErrorCreacion(errEnjambre.message || "error al guardar la configuración del enjambre");
      }
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : "error desconocido";
      setErrorCreacion(mensaje);
    } finally {
      setCreando(false);
    }
  };

  const copiarToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // no hacer nada si falla el portapapeles
    }
  };

  const directores = ["chat", "optimizador", "diseño", "producción", "nube", "medidores"] as const;

  return (
    <section aria-label="Asistente para crear un enjambre de Genesis" className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-950/30 to-fuchsia-950/20 p-5 shadow-lg shadow-violet-900/10">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-violet-200">Crear enjambre de Genesis</h2>
        <p className="text-xs text-violet-300/70">Paso {paso} de 5 · diseña tu propio Genesis vinculado a StarSeed OS</p>
      </header>

      <div className="space-y-4">
        {paso === 1 && (
          <div className="space-y-3">
            <label htmlFor="ambito-id" className="block text-xs font-medium text-violet-200">Ámbito</label>
            <input
              id="ambito-id"
              type="text"
              value={datos.ambitoId || ""}
              onChange={(e) => setDatos((d) => ({ ...d, ambitoId: e.target.value }))}
              placeholder="ID del ámbito (p. ej. persona-abc)"
              className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-3 py-2 text-sm text-violet-100 placeholder:text-violet-400/40 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              aria-required="true"
            />
            <p className="text-[11px] text-violet-300/50">Selecciona un ámbito donde tengas la capacidad de gestionar motores.</p>
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-2">
            <label htmlFor="motor-tipo" className="block text-xs font-medium text-violet-200">Motor</label>
            <select
              id="motor-tipo"
              value={datos.motor?.tipo || ""}
              onChange={(e) => setDatos((d) => ({ ...d, motor: { tipo: e.target.value as TipoMotor } }))}
              className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-3 py-2 text-sm text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
              aria-required="true"
            >
              <option value="">Elige un motor</option>
              <option value="local">Este equipo</option>
              <option value="nube-propia">Mi GitHub</option>
              <option value="servidor-propio">Mi servidor</option>
            </select>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-2">
            <label htmlFor="proveedores" className="block text-xs font-medium text-violet-200">Proveedores detectados (gratis primero)</label>
            <input
              id="proveedores"
              type="text"
              value={(datos.proveedores ?? []).join(", ")}
              onChange={(e) =>
                setDatos((d) => ({
                  ...d,
                  proveedores: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                }))
              }
              placeholder="llm7, nim, groq"
              className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-3 py-2 text-sm text-violet-100 placeholder:text-violet-400/40 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              aria-required="true"
            />
            <p className="text-[11px] text-violet-300/50">Solo los nombres que el motor detecta; nunca se introducen claves aquí.</p>
          </div>
        )}

        {paso === 4 && (
          <div className="space-y-3">
            <label htmlFor="plantilla-ola" className="block text-xs font-medium text-violet-200">Plantilla de ola</label>
            <select
              id="plantilla-ola"
              value={datos.plantilla || ""}
              onChange={(e) => setDatos((d) => ({ ...d, plantilla: e.target.value as PlantillaOla }))}
              className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-3 py-2 text-sm text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
              aria-required="true"
            >
              <option value="">Elige plantilla</option>
              <option value="vacía">Vacía</option>
              <option value="ejemplo">Ejemplo</option>
            </select>

            <div className="grid gap-1">
              {directores.map((key) => (
                <label key={key} htmlFor={`dir-${key}`} className="flex items-center gap-2 cursor-pointer text-xs text-violet-200">
                  <input
                    id={`dir-${key}`}
                    type="checkbox"
                    checked={!!datos.directores?.[key]}
                    onChange={(e) =>
                      setDatos((d) => ({
                        ...d,
                        directores: {
                          ...d.directores,
                          [key]: e.target.checked,
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-violet-500/40 accent-violet-500"
                    aria-label={`Activar director ${key}`}
                  />
                  <span className="capitalize">{key}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {paso === 5 && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="presupuesto" className="block mb-1 text-violet-200">Presupuesto tokens/día</label>
                <input
                  id="presupuesto"
                  type="number"
                  min={1}
                  step={100}
                  value={datos.limites?.presupuestoTokensDia ?? 5000}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setDatos((d) => ({ ...d, limites: { ...d.limites, presupuestoTokensDia: Number.isFinite(v) ? v : 5000 } }));
                  }}
                  className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-2 py-1.5 text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
              <div>
                <label htmlFor="horario" className="block mb-1 text-violet-200">Horario</label>
                <select
                  id="horario"
                  value={datos.limites?.horario || "24/7"}
                  onChange={(e) => setDatos((d) => ({ ...d, limites: { ...d.limites, horario: e.target.value as Horario } }))}
                  className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-2 py-1.5 text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
                >
                  <option value="24/7">24/7</option>
                  <option value="09:00-21:00">09:00-21:00</option>
                  <option value="08:00-20:00">08:00-20:00</option>
                </select>
              </div>
            </div>

            <label htmlFor="pago-permitido" className="flex items-center gap-2 cursor-pointer text-violet-200">
              <input
                id="pago-permitido"
                type="checkbox"
                checked={!!datos.limites?.pagoPermitido}
                onChange={(e) => setDatos((d) => ({ ...d, limites: { ...d.limites, pagoPermitido: e.target.checked } }))}
                className="h-4 w-4 rounded border-violet-500/40 accent-violet-500"
              />
              <span>Permitir pago</span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="visibilidad" className="block mb-1 text-violet-200">Visibilidad</label>
                <select
                  id="visibilidad"
                  value={datos.limites?.visibilidad || "privado"}
                  onChange={(e) => setDatos((d) => ({ ...d, limites: { ...d.limites, visibilidad: e.target.value as "privado" | "miembros" | "publico" } }))}
                  className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-2 py-1.5 text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
                >
                  <option value="privado">Privado</option>
                  <option value="miembros">Miembros</option>
                  <option value="publico">Público</option>
                </select>
              </div>
              <div>
                <label htmlFor="alcance-memoria" className="block mb-1 text-violet-200">Alcance memoria</label>
                <select
                  id="alcance-memoria"
                  value={datos.limites?.alcanceMemoria || (datos.ambitoTipo === "entidad" ? "grupo" : "perfil")}
                  onChange={(e) => setDatos((d) => ({ ...d, limites: { ...d.limites, alcanceMemoria: e.target.value as AlcanceMemoria } }))}
                  className="w-full rounded-lg border border-violet-400/30 bg-violet-950/40 px-2 py-1.5 text-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40 cursor-pointer"
                >
                  <option value="perfil">Perfil</option>
                  <option value="grupo">Grupo</option>
                  <option value="publica">Pública</option>
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-violet-400/10 bg-violet-900/20 px-3 py-2 text-[11px] text-violet-200/80">
              <span className="font-medium text-violet-100">Resumen:</span> {resumenEnjambre(datos)}
            </div>
          </div>
        )}
      </div>

      {token && (
        <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-950/20 p-3" role="region" aria-label="Token del motor creado">
          <div className="text-xs font-medium text-amber-300">Token del motor (no se volverá a mostrar)</div>
          <div className="mt-2 flex gap-2">
            <code className="flex-1 truncate rounded bg-amber-950/30 px-2 py-1 text-xs text-amber-200">{token}</code>
            <button
              type="button"
              onClick={copiarToken}
              className="cursor-pointer rounded border border-amber-400/40 bg-amber-950/30 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-950/50"
              aria-label="Copiar token al portapapeles"
            >
              Copiar
            </button>
          </div>
          <p className="mt-2 text-[11px] text-amber-300/60">Guarda este token; no se volverá a mostrar.</p>
        </div>
      )}

      {errorCreacion && (
        <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300" role="alert">
          <span className="font-medium">Error:</span> {errorCreacion}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setPaso((p) => Math.max(1, p - 1))}
          disabled={paso === 1 || creando}
          className="cursor-pointer rounded-lg border border-violet-400/30 bg-violet-950/30 px-4 py-2 text-sm font-medium text-violet-200 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-violet-950/50"
          aria-label="Ir al paso anterior"
        >
          Atrás
        </button>
        <span className="text-[11px] text-violet-300/50">Paso {paso} / 5</span>
        <button
          type="button"
          onClick={avanzar}
          disabled={!puedeAvanzar || creando}
          className="cursor-pointer rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-900/20 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={paso === 5 ? "Crear enjambre" : "Avanzar al siguiente paso"}
        >
          {creando ? "Creando..." : paso === 5 ? "Crear" : "Siguiente"}
        </button>
      </div>
    </section>
  );
}
