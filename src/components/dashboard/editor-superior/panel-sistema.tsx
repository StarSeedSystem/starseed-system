"use client";
/**
 * Panel «Sistema»: lo que antes abría la barra lateral en tarjetas flotantes (perfiles, memoria,
 * inteligencia, conexiones, servidores y VPN, ubicación), ahora como un menú en lista vertical
 * con su contenido al lado (debajo, en el móvil). Mismo estado y mismas acciones que antes.
 */
import * as React from "react";
import { Cpu, Database, Globe, HardDrive, Lock, MapPin, RefreshCw, Shield, User, Wifi, Zap, GitBranch, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { pildoraFantasma } from "./ui-editor";

const CARMESI = "#DC143C";

export interface PerfilSistema {
    id: string;
    type: "OFFICIAL" | "ARTISTIC" | "ANONYMOUS";
    displayName: string;
    handle: string;
    avatarUrl: string;
}

export type ProveedorIa = "ollama" | "gemini" | "openai";
export type ServicioConexion = "supabase" | "ipfs" | "github" | "vercel";

export interface PropsSistema {
    perfiles: PerfilSistema[];
    perfilActivoId: string | null;
    onPerfil: (id: string) => void;
    memoria: { id: string; type: string; value: string; source?: string }[];
    onRasgo: () => void;
    proveedorIa: ProveedorIa;
    onProveedorIa: (p: ProveedorIa) => void;
    temperatura: number;
    onTemperatura: (t: number) => void;
    agente: string;
    onAgente: (a: string) => void;
    servicios: Record<ServicioConexion, boolean>;
    onServicio: (s: ServicioConexion, v: boolean) => void;
    servidores: string[];
    onServidor: (id: string) => void;
    vpn: boolean;
    onVpn: (v: boolean) => void;
    tor: boolean;
    onTor: (v: boolean) => void;
    zkp: boolean;
    onZkp: (v: boolean) => void;
    sincronizando: boolean;
    progreso: number;
    onSincronizar: () => void;
    onUbicacion: () => void;
}

type Seccion = "perfiles" | "memoria" | "ia" | "conexiones" | "servidores";

const SECCIONES: { id: Seccion; etiqueta: string; ayuda: string; icono: LucideIcon; acento: string }[] = [
    { id: "perfiles", etiqueta: "Perfiles", ayuda: "Con qué faceta actúas", icono: User, acento: "#22D3EE" },
    { id: "memoria", etiqueta: "Memoria", ayuda: "Lo que tu Exocórtex recuerda", icono: HardDrive, acento: "#10B981" },
    { id: "ia", etiqueta: "Inteligencia", ayuda: "Proveedor, temperatura y agente", icono: Cpu, acento: "#007FFF" },
    { id: "conexiones", etiqueta: "Conexiones", ayuda: "Servicios enlazados", icono: Wifi, acento: "#7C5CFF" },
    { id: "servidores", etiqueta: "Servidores y VPN", ayuda: "Por dónde viaja tu tablero", icono: Globe, acento: CARMESI },
];

const fila = "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5";
const filaEstilo: React.CSSProperties = { background: "rgba(255,255,255,.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06)" };

export function PanelSistema(p: PropsSistema) {
    const [seccion, setSeccion] = React.useState<Seccion>("perfiles");
    const def = SECCIONES.find((s) => s.id === seccion)!;

    return (
        <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
            <nav aria-label="Secciones de sistema">
                <ul className="flex flex-col gap-1">
                    {SECCIONES.map((s) => {
                        const activo = s.id === seccion;
                        const Icono = s.icono;
                        return (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    aria-current={activo ? "true" : undefined}
                                    onClick={() => setSeccion(s.id)}
                                    className={cn("flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left cursor-pointer transition-[background,box-shadow] duration-200", activo ? "text-white" : "text-white/70 hover:bg-white/[0.05] hover:text-white")}
                                    style={activo ? pildoraFantasma(s.acento) : undefined}
                                >
                                    <Icono className="size-4 shrink-0" style={{ color: s.acento }} aria-hidden />
                                    <span className="min-w-0">
                                        <span className="block text-[13.5px] font-semibold">{s.etiqueta}</span>
                                        <span className="block text-[11.5px] text-white/50">{s.ayuda}</span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                    <li>
                        <button type="button" onClick={p.onUbicacion} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-white/70 cursor-pointer transition-colors duration-200 hover:bg-white/[0.05] hover:text-white">
                            <MapPin className="size-4 shrink-0 text-cyan-300" aria-hidden />
                            <span className="min-w-0">
                                <span className="block text-[13.5px] font-semibold">Ubicación</span>
                                <span className="block text-[11.5px] text-white/50">Abre el selector de lugar del clima</span>
                            </span>
                        </button>
                    </li>
                </ul>
            </nav>

            <section aria-label={def.etiqueta} className="min-w-0 space-y-3">
                {seccion === "perfiles" && (
                    <div className="space-y-2">
                        {p.perfiles.length === 0 && <p className="rounded-xl px-3 py-6 text-center text-[13px] text-white/50" style={filaEstilo}>Inicia sesión para ver y gestionar tus perfiles.</p>}
                        {p.perfiles.map((perfil) => {
                            const activo = perfil.id === p.perfilActivoId;
                            return (
                                <button
                                    key={perfil.id} type="button" onClick={() => p.onPerfil(perfil.id)} aria-pressed={activo}
                                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left cursor-pointer transition-colors duration-200 hover:bg-white/[0.05]"
                                    style={activo ? pildoraFantasma("#FFBF00") : filaEstilo}
                                >
                                    {perfil.avatarUrl
                                        ? <img src={perfil.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-white/15" />
                                        : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-[14px] font-semibold text-white/80">{perfil.displayName.charAt(0).toUpperCase()}</span>}
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[14px] font-semibold text-white/90">{perfil.displayName}</span>
                                        <span className="block text-[12px] text-white/50">@{perfil.handle} · {perfil.type === "OFFICIAL" ? "Oficial" : perfil.type === "ARTISTIC" ? "Artístico" : "Anónimo"}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {seccion === "memoria" && (
                    <div className="space-y-2">
                        <div className={fila} style={filaEstilo}>
                            <span className="text-[13px] text-white/70">Tu Exocórtex registra rasgos del usuario local de forma cifrada.</span>
                            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-emerald-300">{p.memoria.length} nodos</span>
                        </div>
                        {p.memoria.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-white/45">Memoria local vacía.</p>}
                        <ul className="space-y-1.5">
                            {p.memoria.slice(-5).reverse().map((m) => (
                                <li key={m.id} className="rounded-xl px-3 py-2 text-[12.5px] text-white/75" style={filaEstilo}>
                                    <span className="mr-1.5 font-semibold text-emerald-300">{m.type}</span>{m.value}
                                    {m.source && <span className="mt-0.5 block text-[11px] text-white/40">{m.source}</span>}
                                </li>
                            ))}
                        </ul>
                        <button type="button" onClick={p.onRasgo} className="ss-redondo inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-white cursor-pointer" style={pildoraFantasma("#10B981")}>
                            Añadir rasgo de foco visual
                        </button>
                    </div>
                )}

                {seccion === "ia" && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Proveedor de IA</span>
                            <Select value={p.proveedorIa} onValueChange={(v) => p.onProveedorIa(v as ProveedorIa)}>
                                <SelectTrigger className="h-10 rounded-xl border-white/10 bg-black/30 text-[13px]" aria-label="Proveedor de IA"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ollama">Ollama (local, sin conexión)</SelectItem>
                                    <SelectItem value="gemini">Google Gemini</SelectItem>
                                    <SelectItem value="openai">OpenAI y compatibles</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                                Temperatura <span className="tabular-nums text-cyan-300">{p.temperatura.toFixed(1)}</span>
                            </span>
                            <Slider value={[p.temperatura]} onValueChange={(v) => p.onTemperatura(v[0] ?? p.temperatura)} min={0.1} max={1.5} step={0.1} aria-label="Temperatura" />
                        </div>
                        <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Agente activo</span>
                            <Select value={p.agente} onValueChange={p.onAgente}>
                                <SelectTrigger className="h-10 rounded-xl border-white/10 bg-black/30 text-[13px]" aria-label="Agente activo"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="central">Central (núcleo StarSeed)</SelectItem>
                                    <SelectItem value="creative">Musa creativa (Horizon)</SelectItem>
                                    <SelectItem value="logic">Panel de control (Logic)</SelectItem>
                                    <SelectItem value="pilot">System Pilot (Exocórtex)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {seccion === "conexiones" && (
                    <div className="space-y-1.5">
                        {([
                            { id: "supabase", etiqueta: "Base de datos Supabase", icono: Database, color: "text-blue-300" },
                            { id: "ipfs", etiqueta: "Red P2P IPFS", icono: Globe, color: "text-emerald-300" },
                            { id: "github", etiqueta: "Repositorio GitHub", icono: GitBranch, color: "text-white" },
                            { id: "vercel", etiqueta: "Despliegue automático Vercel", icono: Zap, color: "text-violet-300" },
                        ] as const).map((s) => {
                            const Icono = s.icono;
                            return (
                                <label key={s.id} className={cn(fila, "cursor-pointer")} style={filaEstilo}>
                                    <span className="flex items-center gap-2 text-[13.5px] text-white/85"><Icono className={cn("size-4", s.color)} aria-hidden /> {s.etiqueta}</span>
                                    <Switch checked={p.servicios[s.id]} onCheckedChange={(v) => p.onServicio(s.id, v)} aria-label={s.etiqueta} />
                                </label>
                            );
                        })}
                    </div>
                )}

                {seccion === "servidores" && (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            {[
                                { id: "vercel", etiqueta: "Servidor principal Vercel" },
                                { id: "supabase", etiqueta: "Supabase redundante" },
                                { id: "ipfs", etiqueta: "Nodo IPFS akáshico" },
                            ].map((s) => {
                                const activo = p.servidores.includes(s.id);
                                return (
                                    <button key={s.id} type="button" aria-pressed={activo} onClick={() => p.onServidor(s.id)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] cursor-pointer transition-colors duration-200 hover:bg-white/[0.05]" style={activo ? pildoraFantasma(CARMESI) : filaEstilo}>
                                        <span className={cn("size-2 rounded-full", activo ? "bg-red-400 shadow-[0_0_8px_#f87171]" : "bg-white/20")} aria-hidden />
                                        <span className={activo ? "text-white" : "text-white/65"}>{s.etiqueta}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {([
                            { etiqueta: "VPN / túnel", icono: Lock, valor: p.vpn, cambiar: p.onVpn },
                            { etiqueta: "Red Tor / Onion", icono: Globe, valor: p.tor, cambiar: p.onTor },
                            { etiqueta: "Cifrado ZKP", icono: Shield, valor: p.zkp, cambiar: p.onZkp },
                        ]).map((o) => {
                            const Icono = o.icono;
                            return (
                                <label key={o.etiqueta} className={cn(fila, "cursor-pointer")} style={filaEstilo}>
                                    <span className="flex items-center gap-2 text-[13.5px] text-white/85"><Icono className="size-4 text-red-300" aria-hidden /> {o.etiqueta}</span>
                                    <Switch checked={o.valor} onCheckedChange={o.cambiar} aria-label={o.etiqueta} />
                                </label>
                            );
                        })}
                        <button
                            type="button" disabled={p.sincronizando} onClick={p.onSincronizar}
                            className="ss-redondo inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white cursor-pointer disabled:cursor-wait"
                            style={{ background: "linear-gradient(90deg, #DC143Ccc, #FFBF00aa)" }}
                        >
                            <RefreshCw className={cn("size-4", p.sincronizando && "animate-spin")} aria-hidden />
                            {p.sincronizando ? `Sincronizando… ${p.progreso}%` : "Sincronizar y fusionar"}
                        </button>
                        {p.sincronizando && (
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={p.progreso} aria-valuemin={0} aria-valuemax={100}>
                                <motion.div className="h-full bg-gradient-to-r from-red-500 to-amber-400" initial={{ width: 0 }} animate={{ width: `${p.progreso}%` }} transition={{ duration: 0.15 }} />
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
