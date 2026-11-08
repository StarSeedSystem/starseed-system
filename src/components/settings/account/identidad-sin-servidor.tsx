"use client";

/**
 * IDENTIDAD DE CUENTA SIN SERVIDOR (IDN1108A · 2026-11-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ajustes › Cuenta › Seguridad. La clave MAESTRA de la cuenta firma certificados para tus neuronas, así
 * se reconocen entre sí sin internet. Aquí se crea, importa y exporta (cifrada con contraseña; la clave
 * privada nunca se envía a ningún servidor) y se añaden neuronas nuevas con un código de 6 cifras.
 * Contrato: architecture/red-sin-dependencias.md §5.1 · architecture/identidad-soberana-portatil.md.
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Download, Fingerprint, Loader2, ShieldCheck, Smartphone, Upload } from "lucide-react";
import { toast } from "sonner";
import { LectorCodigo } from "@/components/network/vincular-sin-internet";
import { codificarMensaje, type EnrolamientoPendiente, type EnrolamientoPreparado, type SolicitudEnrolamiento } from "@/lib/identidad/enrolar";
import type { ServicioIdentidad } from "@/lib/identidad/servicio";

type Estado = Awaited<ReturnType<ServicioIdentidad["estado"]>>;
type Modo = null | "exportar" | "importar" | "titular" | "nueva";

const campo = "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-fuchsia-400/50";
const boton = "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-40";
const botonFuerte = "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40";

function Qr({ texto, alt }: { texto: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setUrl(null);
    // @ts-ignore
    import(/* @vite-ignore */ "qrcode")
      .then((m) => {
        const lib = ((m as unknown as { default?: typeof m }).default ?? m) as typeof m;
        return lib.toDataURL(texto, { errorCorrectionLevel: "L", margin: 2, width: 320, color: { dark: "#0b1020", light: "#ffffff" } });
      })
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setUrl(null));
    return () => {
      vivo = false;
    };
  }, [texto]);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="h-auto w-full max-w-[260px] rounded-xl bg-white" /> : <p className="text-[11px] text-white/50">No se pudo dibujar el QR: usa el texto de abajo.</p>;
}

function TextoCopiable({ texto }: { texto: string }) {
  return (
    <div className="space-y-1">
      <textarea readOnly value={texto} rows={3} className={`${campo} font-mono text-[10px]`} aria-label="Texto para copiar" />
      <button type="button" className={boton} onClick={() => void navigator.clipboard?.writeText(texto).then(() => toast.success("Copiado."))}>
        Copiar texto
      </button>
    </div>
  );
}

export function IdentidadSinServidor({ servicio }: { servicio?: ServicioIdentidad }) {
  const [s, setS] = useState<ServicioIdentidad | null>(servicio ?? null);
  const [est, setEst] = useState<Estado | null>(null);
  const [modo, setModo] = useState<Modo>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pass, setPass] = useState("");
  const [texto, setTexto] = useState("");
  const [exportado, setExportado] = useState<{ texto: string; nombreArchivo: string } | null>(null);
  // titular
  const [preparado, setPreparado] = useState<EnrolamientoPreparado | null>(null);
  const [respuesta, setRespuesta] = useState<string | null>(null);
  // neurona nueva
  const [solicitud, setSolicitud] = useState<SolicitudEnrolamiento | null>(null);
  const [pendiente, setPendiente] = useState<EnrolamientoPendiente | null>(null);
  const [codigo, setCodigo] = useState("");

  const refrescar = useCallback(async (sv: ServicioIdentidad) => setEst(await sv.estado()), []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const sv = servicio ?? (await (await import("@/lib/identidad/servicio")).servicioIdentidad());
      if (!vivo) return;
      setS(sv);
      await refrescar(sv);
    })().catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [servicio, refrescar]);

  const reiniciar = (m: Modo) => {
    setModo(m);
    setPass("");
    setTexto("");
    setExportado(null);
    setPreparado(null);
    setRespuesta(null);
    setSolicitud(null);
    setPendiente(null);
    setCodigo("");
  };

  const ejecutar = async (f: (sv: ServicioIdentidad) => Promise<void>) => {
    if (!s) return;
    setOcupado(true);
    try {
      await f(s);
      await refrescar(s);
    } catch {
      toast.error("No se pudo completar la operación.");
    } finally {
      setOcupado(false);
    }
  };

  const crear = () =>
    ejecutar(async (sv) => {
      const r = await sv.crearMaestra();
      if (r.ok) toast.success("Clave maestra creada en esta neurona. Expórtala ahora y guárdala a buen recaudo.");
      else toast.error(r.motivo);
    });
  const exportar = () =>
    ejecutar(async (sv) => {
      const r = await sv.exportar(pass);
      if (r.ok) setExportado({ texto: r.texto, nombreArchivo: r.nombreArchivo });
      else toast.error(r.motivo);
    });
  const importar = () =>
    ejecutar(async (sv) => {
      const r = await sv.importar(texto, pass);
      if (r.ok) {
        toast.success("Clave maestra importada: esta neurona ya es titular de tu cuenta.");
        reiniciar(null);
      } else toast.error(r.motivo);
    });
  const leerSolicitud = () =>
    ejecutar(async (sv) => {
      const r = await sv.prepararEnrolamientoDe(texto);
      if (r.ok) setPreparado(r.preparado);
      else toast.error(r.motivo);
    });
  const certificar = () =>
    ejecutar(async () => {
      const r = await preparado?.emitir();
      if (r) setRespuesta(codificarMensaje(r));
      else toast.error("No se pudo firmar el certificado.");
    });
  const pedir = () =>
    ejecutar(async (sv) => {
      const sol = await sv.nuevaSolicitud();
      if (sol) setSolicitud(sol);
      else toast.error("Este aparato no permite crear la solicitud.");
    });
  const leerResp = () =>
    ejecutar(async (sv) => {
      if (!solicitud) return;
      const r = await sv.leerRespuesta(solicitud, texto);
      if (r.ok) setPendiente(r.pendiente);
      else toast.error(r.motivo);
    });
  const confirmar = () =>
    ejecutar(async (sv) => {
      if (!pendiente) return;
      if (await sv.confirmarEnrolamiento(pendiente, codigo)) {
        toast.success("Listo: esta neurona ya tiene el certificado de tu cuenta.");
        reiniciar(null);
      } else toast.error("El código no coincide. No se ha guardado nada.");
    });

  const descargar = () => {
    if (!exportado) return;
    const url = URL.createObjectURL(new Blob([exportado.texto], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = exportado.nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  };
  const cargarArchivo = async (f: File | undefined) => {
    if (f) setTexto(await f.text());
  };

  const cert = est?.certificado;
  const titular = est?.tenencia;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4" data-testid="identidad-sin-servidor">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-4 w-4 text-cyan-300" />
        <span className="text-sm font-semibold">Identidad de cuenta sin internet</span>
        {est?.tiene && <Check className="h-4 w-4 text-emerald-300" />}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Tu clave maestra firma un certificado para cada una de tus neuronas, y así se reconocen entre ellas aunque no haya internet. La clave
        privada solo vive en las neuronas que tú elijas: nunca se envía a un servidor.
      </p>

      {!est ? (
        <p className="flex items-center gap-2 text-[11px] text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo esta neurona…</p>
      ) : (
        <ul className="space-y-1 text-[12px]" aria-label="Estado de la identidad">
          <li>
            {est.tiene ? (
              <>
                <strong>Esta neurona guarda la clave maestra</strong>
                {titular ? ` desde ${new Date(titular.desde).toLocaleDateString("es")}` : ""}. Huella: <code className="text-[11px]">{est.mfp}</code>
              </>
            ) : (
              <>Esta neurona <strong>no</strong> guarda la clave maestra.</>
            )}
          </li>
          <li>
            {cert ? (
              <>Certificado de cuenta: válido hasta {new Date(cert.caduca).toLocaleDateString("es")}.</>
            ) : (
              <>Sin certificado de cuenta: para reconocerse sin internet, crea o importa la clave, o pide un certificado a otra neurona tuya.</>
            )}
          </li>
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {est && !est.tiene && (
          <button type="button" className={botonFuerte} disabled={ocupado} onClick={() => void crear()}>
            <ShieldCheck className="h-3.5 w-3.5" /> Crear clave maestra
          </button>
        )}
        {est && !est.tiene && (
          <button type="button" className={boton} onClick={() => reiniciar("importar")}>
            <Upload className="h-3.5 w-3.5" /> Importar clave
          </button>
        )}
        {est?.tiene && (
          <button type="button" className={boton} onClick={() => reiniciar("exportar")}>
            <Download className="h-3.5 w-3.5" /> Exportar cifrada
          </button>
        )}
        {est?.tiene && (
          <button type="button" className={boton} onClick={() => reiniciar("titular")}>
            <Smartphone className="h-3.5 w-3.5" /> Añadir una neurona nueva
          </button>
        )}
        {est && !est.tiene && (
          <button type="button" className={boton} onClick={() => reiniciar("nueva")}>
            <Smartphone className="h-3.5 w-3.5" /> Esta neurona es nueva
          </button>
        )}
      </div>

      {modo === "exportar" && (
        <div className="space-y-2">
          <input className={campo} type="password" placeholder="Contraseña para cifrarla (mín. 12)" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" />
          {!exportado ? (
            <button type="button" className={botonFuerte} disabled={ocupado || pass.length < 12} onClick={() => void exportar()}>
              {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Cifrar y exportar
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-amber-200/80">Sin la contraseña no se puede abrir. Guarda el archivo o el QR donde solo tú llegues.</p>
              <Qr texto={exportado.texto} alt="QR de la clave maestra cifrada" />
              <button type="button" className={boton} onClick={descargar}><Download className="h-3.5 w-3.5" /> Guardar archivo</button>
              <TextoCopiable texto={exportado.texto} />
            </div>
          )}
        </div>
      )}

      {modo === "importar" && (
        <div className="space-y-2">
          <LectorCodigo etiqueta="Leer el QR de la clave" onCodigo={setTexto} ocupado={ocupado} />
          <textarea className={`${campo} font-mono text-[10px]`} rows={3} placeholder="Pega aquí el texto de la clave exportada" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <input type="file" accept=".ssm,text/plain" className="text-[11px]" onChange={(e) => void cargarArchivo(e.target.files?.[0])} aria-label="Archivo de la clave" />
          <input className={campo} type="password" placeholder="Contraseña de la exportación" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
          <button type="button" className={botonFuerte} disabled={ocupado || !texto || pass.length < 12} onClick={() => void importar()}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Importar
          </button>
        </div>
      )}

      {modo === "titular" && (
        <div className="space-y-2">
          {!preparado ? (
            <>
              <p className="text-[11px] text-muted-foreground">En la neurona nueva elige «Esta neurona es nueva» y lee aquí su QR (o pega su texto).</p>
              <LectorCodigo etiqueta="Leer el QR de la neurona nueva" onCodigo={setTexto} ocupado={ocupado} />
              <textarea className={`${campo} font-mono text-[10px]`} rows={3} placeholder="Texto de la solicitud" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <button type="button" className={botonFuerte} disabled={ocupado || !texto} onClick={() => void leerSolicitud()}>Leer solicitud</button>
            </>
          ) : !respuesta ? (
            <>
              <p className="text-[12px]">Neurona nueva: <strong>{preparado.solicitud.nombre}</strong></p>
              <p className="text-[11px] text-muted-foreground">Comprueba que este código es IGUAL al que ve la neurona nueva. Si no, cancela.</p>
              <p className="text-3xl font-bold tracking-[0.3em] text-cyan-200" aria-label="Código de confirmación">{preparado.sas}</p>
              <button type="button" className={botonFuerte} disabled={ocupado} onClick={() => void certificar()}>Coincide: certificar</button>
              <button type="button" className={boton} onClick={() => reiniciar(null)}>Cancelar</button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">Enséñale este QR a la neurona nueva (o pásale el texto).</p>
              <Qr texto={respuesta} alt="QR del certificado para la neurona nueva" />
              <TextoCopiable texto={respuesta} />
            </>
          )}
        </div>
      )}

      {modo === "nueva" && (
        <div className="space-y-2">
          {!solicitud ? (
            <button type="button" className={botonFuerte} disabled={ocupado} onClick={() => void pedir()}>Pedir certificado a otra neurona mía</button>
          ) : !pendiente ? (
            <>
              <p className="text-[11px] text-muted-foreground">1) Enséñale este QR a tu neurona titular. 2) Lee aquí su respuesta (o pega su texto).</p>
              <Qr texto={codificarMensaje(solicitud)} alt="QR de la solicitud de esta neurona" />
              <TextoCopiable texto={codificarMensaje(solicitud)} />
              <LectorCodigo etiqueta="Leer el QR de la respuesta" onCodigo={setTexto} ocupado={ocupado} />
              <textarea className={`${campo} font-mono text-[10px]`} rows={3} placeholder="Texto de la respuesta" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <button type="button" className={botonFuerte} disabled={ocupado || !texto} onClick={() => void leerResp()}>Leer respuesta</button>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">Escribe el código de 6 cifras que muestra tu neurona titular. Solo si coincide se guarda el certificado.</p>
              <input className={campo} inputMode="numeric" maxLength={7} placeholder="Código de 6 cifras" value={codigo} onChange={(e) => setCodigo(e.target.value)} aria-label="Código de confirmación" />
              <button type="button" className={botonFuerte} disabled={ocupado || codigo.replace(/\s/g, "").length !== 6} onClick={() => void confirmar()}>Confirmar</button>
            </>
          )}
          <button type="button" className={boton} onClick={() => reiniciar(null)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

export default IdentidadSinServidor;
