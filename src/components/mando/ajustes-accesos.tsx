"use client";

/**
 * Ajustes de accesos del Puente de Mando (Ola 332 · CU3c): selector de cuentas
 * y perfiles, quién está conectado ahora y accesos de servicio. El POST
 * devuelve el MISMO payload completo que el GET (contrato único), así que
 * `enviar` solo hace `setDatos`. Permisos decididos en servidor; aquí solo se
 * muestra lo que el servidor ya filtró. Jamás el valor de una clave: solo el
 * NOMBRE de la variable y para qué se usa.
 */
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plug, UserPlus, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CuentaAcceso { correo: string; rol: string; capacidades: readonly string[] }
interface ServicioAcceso { variable: string; uso: string }
interface DatosAccesos {
    quienPide: string; cuentas: CuentaAcceso[];
    conectados: readonly string[]; servicios: ServicioAcceso[];
}

export function AjustesAccesos() {
    const [datos, setDatos] = useState<DatosAccesos | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [correo, setCorreo] = useState("");
    const [variable, setVariable] = useState("");
    const [uso, setUso] = useState("");
    const [aviso, setAviso] = useState("");

    const cargar = useCallback(async () => {
        const res = await fetch("/api/mando/accesos", { cache: "no-store" });
        if (!res.ok) { setAviso("No puedes ver los accesos de este Mando."); return; }
        setDatos((await res.json()) as DatosAccesos);
    }, []);
    useEffect(() => { void cargar(); }, [cargar]);

    const enviar = useCallback(async (cuerpo: Record<string, string>) => {
        setOcupado(true); setAviso("");
        try {
            const res = await fetch("/api/mando/accesos", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cuerpo) });
            if (!res.ok) { setAviso("No se pudo aplicar el cambio."); return; }
            setDatos((await res.json()) as DatosAccesos);
            setCorreo(""); setVariable(""); setUso("");
        } finally { setOcupado(false); }
    }, []);

    const retirar = useCallback((objetivo: string, esServicio: boolean) => {
        const que = esServicio ? `el servicio «${objetivo}»` : `el acceso de ${objetivo}`;
        if (!window.confirm(`¿Retirar ${que}?`)) return;
        void enviar(esServicio
            ? { accion: "retirar-servicio", variable: objetivo }
            : { accion: "retirar", correo: objetivo });
    }, [enviar]);

    if (!datos) {
        return <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {aviso || "Cargando accesos…"}</div>;
    }
    const invitadas = datos.cuentas.filter((c) => c.rol === "invitado");
    return (
        <section className="space-y-4 text-sm">
            <p className="text-muted-foreground">
                Cuentas y perfiles de este Mando. Conectado ahora como <b>{datos.quienPide}</b>.
                {datos.conectados.length > 0 && <> También lo usan: {datos.conectados.join(", ")}.</>}
            </p>
            <ul className="space-y-1">
                {datos.cuentas.filter((c) => c.rol !== "invitado").map((c) => (
                    <li key={c.correo} className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{c.correo}</span>
                        <span className="rounded bg-muted px-1.5 text-xs capitalize">{c.rol}</span>
                    </li>))}
            </ul>
            <ul className="space-y-1">
                {invitadas.map((c) => (
                    <li key={c.correo} className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{c.correo}</span>
                        <span className="rounded bg-muted px-1.5 text-xs">{c.capacidades.join(", ") || "sin permisos"}</span>
                        <button type="button" aria-label={`Retirar acceso de ${c.correo}`}
                            disabled={ocupado} onClick={() => retirar(c.correo, false)}
                            className="cursor-pointer text-muted-foreground transition-opacity hover:opacity-70 disabled:opacity-40">
                            <X className="h-4 w-4" /></button>
                    </li>))}
            </ul>
            <div className="flex gap-2">
                <Input value={correo} onChange={(e) => setCorreo(e.target.value)}
                    placeholder="correo@de-la-cuenta" aria-label="Correo de la cuenta invitada" />
                <Button type="button" disabled={ocupado || !correo.includes("@")}
                    className="cursor-pointer" onClick={() => void enviar({ accion: "conceder", correo })}>
                    <UserPlus className="h-4 w-4" /> Conceder</Button>
            </div>
            <ul className="space-y-1">
                {datos.servicios.map((s) => (
                    <li key={s.variable} className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                        <code className="text-xs">{s.variable}</code>
                        <span className="text-muted-foreground">— usada para {s.uso}</span>
                        <button type="button" aria-label={`Retirar servicio ${s.variable}`}
                            disabled={ocupado} onClick={() => retirar(s.variable, true)}
                            className="cursor-pointer text-muted-foreground transition-opacity hover:opacity-70 disabled:opacity-40">
                            <X className="h-4 w-4" /></button>
                    </li>))}
            </ul>
            <div className="flex gap-2">
                <Input value={variable} onChange={(e) => setVariable(e.target.value)}
                    placeholder="NOMBRE_VARIABLE" aria-label="Nombre de la variable de entorno" />
                <Input value={uso} onChange={(e) => setUso(e.target.value)}
                    placeholder="Para qué se usa" aria-label="Uso del servicio" />
                <Button type="button" disabled={ocupado || !variable.trim() || !uso.trim()}
                    className="cursor-pointer" onClick={() => void enviar({ accion: "conceder-servicio", variable, uso })}>
                    <Plug className="h-4 w-4" /> Añadir</Button>
            </div>
            {aviso && <p role="alert" className="text-xs text-destructive">{aviso}</p>}
        </section>
    );
}
