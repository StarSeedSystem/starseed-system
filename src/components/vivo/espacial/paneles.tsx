"use client";

/**
 * Paneles de la escena compartida (L5 · 2026-09-28): añadir, ambiente, personas e inspector.
 * Menús verticales con etiquetas completas, sin tiras que se desplacen de lado.
 */

import { useEffect, useId, useState } from "react";
import {
    Aperture,
    Box,
    Boxes,
    Circle,
    Cone,
    Copy,
    Cylinder,
    Grid3x3,
    Image as IconoImagen,
    Lightbulb,
    Lock,
    LockOpen,
    Moon,
    Move,
    Rotate3d,
    Scale3d,
    Sparkles,
    Square,
    Sun,
    Sunrise,
    Sunset,
    Torus,
    Trash2,
    Type,
    X,
    type LucideIcon,
} from "lucide-react";
import {
    CIELOS,
    NOMBRE_TIPO,
    PALETA_ESCENA,
    PRESETS_CIELO,
    urlHttpsSegura,
    type AmbienteEscena,
    type IdCielo,
    type ObjetoEscena,
    type OpcionesNuevoObjeto,
    type TipoObjeto,
    type Vec3,
} from "@/lib/vivo/espacial/modelo";
import type { MetaAvatar } from "@/lib/vivo/espacial/avatares";
import type { ModoGizmo } from "./lienzo-escena";
import css from "./escena.module.css";

export function CabeceraHoja({ titulo, onCerrar }: { titulo: string; onCerrar: () => void }) {
    return (
        <div className={css.cabeceraHoja}>
            <h2 className={css.tituloHoja}>{titulo}</h2>
            <button type="button" className={`${css.cerrar} ss-redondo`} onClick={onCerrar} aria-label={`Cerrar ${titulo.toLowerCase()}`}>
                <X className="size-4" aria-hidden />
            </button>
        </div>
    );
}

function Icono({ Icon, color }: { Icon: LucideIcon; color: string }) {
    return (
        <span className={css.icono} style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, color }}>
            <Icon className="size-[18px]" aria-hidden />
        </span>
    );
}

// ───────────────────────────── Añadir ─────────────────────────────

const FORMAS: { tipo: TipoObjeto; Icon: LucideIcon; detalle: string }[] = [
    { tipo: "caja", Icon: Box, detalle: "Cubo de 1 m" },
    { tipo: "esfera", Icon: Circle, detalle: "Bola de 1 m" },
    { tipo: "cilindro", Icon: Cylinder, detalle: "Columna o pedestal" },
    { tipo: "cono", Icon: Cone, detalle: "Punta o tejado" },
    { tipo: "toro", Icon: Torus, detalle: "Anillo" },
    { tipo: "plano", Icon: Square, detalle: "Suelo, pared o mesa" },
];

export function PanelAnadir({
    onAnadir,
    onCerrar,
    puedeEditar,
}: {
    onAnadir: (tipo: TipoObjeto, opciones: OpcionesNuevoObjeto) => boolean;
    onCerrar: () => void;
    puedeEditar: boolean;
}) {
    const [pidiendo, setPidiendo] = useState<"texto" | "imagen" | "modelo" | null>(null);
    const [valor, setValor] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [color, setColor] = useState<string>(PALETA_ESCENA[0]);
    const idCampo = useId();

    const anadir = (tipo: TipoObjeto, extra: OpcionesNuevoObjeto = {}) => {
        const ok = onAnadir(tipo, { color, ...extra });
        if (ok) {
            // El siguiente objeto sale de otro color: la escena no queda monocroma sin querer.
            const i = PALETA_ESCENA.indexOf(color as (typeof PALETA_ESCENA)[number]);
            setColor(PALETA_ESCENA[(i + 1) % PALETA_ESCENA.length]);
        }
        return ok;
    };

    const confirmar = () => {
        if (!pidiendo) return;
        if (pidiendo === "texto") {
            if (!valor.trim()) {
                setError("Escribe el texto del rótulo.");
                return;
            }
            if (anadir("texto", { texto: valor })) {
                setValor("");
                setPidiendo(null);
            }
            return;
        }
        const url = urlHttpsSegura(valor);
        if (!url) {
            setError("La dirección debe empezar por https:// (sin espacios).");
            return;
        }
        if (anadir(pidiendo, { url })) {
            setValor("");
            setPidiendo(null);
        }
    };

    if (!puedeEditar) {
        return (
            <>
                <CabeceraHoja titulo="Añadir" onCerrar={onCerrar} />
                <p className={css.nota}>Estás en modo lectura: puedes moverte y ver a los demás, pero no añadir objetos.</p>
            </>
        );
    }

    if (pidiendo) {
        const titulos = { texto: "Nuevo rótulo", imagen: "Imagen por dirección", modelo: "Modelo 3D (GLB)" } as const;
        return (
            <>
                <CabeceraHoja titulo={titulos[pidiendo]} onCerrar={onCerrar} />
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        confirmar();
                    }}
                >
                    <div className={css.campo}>
                        <label className={css.etiqueta} htmlFor={idCampo}>
                            {pidiendo === "texto" ? "Texto" : "Dirección https"}
                        </label>
                        {pidiendo === "texto" ? (
                            <textarea
                                id={idCampo}
                                className={css.entrada}
                                value={valor}
                                maxLength={280}
                                autoFocus
                                onChange={(e) => {
                                    setValor(e.target.value);
                                    setError(null);
                                }}
                            />
                        ) : (
                            <input
                                id={idCampo}
                                className={css.entrada}
                                type="url"
                                inputMode="url"
                                placeholder={pidiendo === "modelo" ? "https://…/modelo.glb" : "https://…/imagen.png"}
                                value={valor}
                                autoFocus
                                onChange={(e) => {
                                    setValor(e.target.value);
                                    setError(null);
                                }}
                            />
                        )}
                        {error && (
                            <span role="alert" className="text-[12.5px] text-rose-300">
                                {error}
                            </span>
                        )}
                    </div>
                    {pidiendo !== "texto" && (
                        <p className={css.nota}>
                            {pidiendo === "modelo"
                                ? "Solo archivos .glb de hasta 40 MB, sin compresión Draco. "
                                : "PNG, JPG, WebP o GIF. "}
                            Cada persona lo descarga desde esa dirección, así que el servidor debe permitirlo desde otras webs (CORS).
                        </p>
                    )}
                    <div className={css.acciones}>
                        <button type="submit" className={css.boton} style={{ background: "#7C5CFF" }}>
                            Añadir a la escena
                        </button>
                        <button
                            type="button"
                            className={css.boton}
                            style={{ background: "rgba(255,255,255,.06)" }}
                            onClick={() => {
                                setPidiendo(null);
                                setError(null);
                            }}
                        >
                            Volver a la lista
                        </button>
                    </div>
                </form>
            </>
        );
    }

    return (
        <>
            <CabeceraHoja titulo="Añadir" onCerrar={onCerrar} />
            <span className={css.rotulo}>Color del próximo objeto</span>
            <div className={css.muestras} role="group" aria-label="Color del próximo objeto">
                {PALETA_ESCENA.map((c) => (
                    <button
                        key={c}
                        type="button"
                        className={`${css.muestra} ss-redondo`}
                        style={{ background: c }}
                        aria-label={`Color ${c}`}
                        aria-pressed={color === c}
                        onClick={() => setColor(c)}
                    />
                ))}
            </div>
            <span className={css.rotulo}>Formas</span>
            <div className={css.lista}>
                {FORMAS.map(({ tipo, Icon, detalle }) => (
                    <button key={tipo} type="button" className={css.item} onClick={() => anadir(tipo)}>
                        <Icono Icon={Icon} color={color} />
                        <span className={css.itemTexto}>
                            <span className={css.itemTitulo}>{NOMBRE_TIPO[tipo]}</span>
                            <span className={css.itemDetalle}>{detalle}</span>
                        </span>
                    </button>
                ))}
            </div>
            <span className={css.rotulo}>Contenido</span>
            <div className={css.lista}>
                <button type="button" className={css.item} onClick={() => setPidiendo("texto")}>
                    <Icono Icon={Type} color="#14B8A6" />
                    <span className={css.itemTexto}>
                        <span className={css.itemTitulo}>Rótulo de texto</span>
                        <span className={css.itemDetalle}>Un cartel que todos leen</span>
                    </span>
                </button>
                <button type="button" className={css.item} onClick={() => setPidiendo("imagen")}>
                    <Icono Icon={IconoImagen} color="#007FFF" />
                    <span className={css.itemTexto}>
                        <span className={css.itemTitulo}>Imagen</span>
                        <span className={css.itemDetalle}>Un cuadro desde una dirección https</span>
                    </span>
                </button>
                <button type="button" className={css.item} onClick={() => setPidiendo("modelo")}>
                    <Icono Icon={Boxes} color="#F97316" />
                    <span className={css.itemTexto}>
                        <span className={css.itemTitulo}>Modelo 3D</span>
                        <span className={css.itemDetalle}>Archivo GLB desde una dirección https</span>
                    </span>
                </button>
            </div>
            <span className={css.rotulo}>Luz</span>
            <div className={css.lista}>
                <button type="button" className={css.item} onClick={() => anadir("luz")}>
                    <Icono Icon={Lightbulb} color={color} />
                    <span className={css.itemTexto}>
                        <span className={css.itemTitulo}>Luz de color</span>
                        <span className={css.itemDetalle}>Ilumina lo que tiene cerca</span>
                    </span>
                </button>
            </div>
        </>
    );
}

// ───────────────────────────── Ambiente ─────────────────────────────

const ICONO_CIELO: Record<IdCielo, LucideIcon> = {
    nebulosa: Sparkles,
    amanecer: Sunrise,
    mediodia: Sun,
    atardecer: Sunset,
    noche: Moon,
    estudio: Aperture,
};

const ICONO_TIPO: Record<TipoObjeto, LucideIcon> = {
    caja: Box,
    esfera: Circle,
    cilindro: Cylinder,
    cono: Cone,
    toro: Torus,
    plano: Square,
    texto: Type,
    imagen: IconoImagen,
    modelo: Boxes,
    luz: Lightbulb,
};

/**
 * Panel «Escena»: la lista de objetos (la forma de llegar a cada uno con el teclado o un lector de
 * pantalla, no solo tocando el lienzo) y el ambiente (cielo, luz y suelo).
 */
export function PanelEscena({
    objetos,
    seleccion,
    onElegir,
    ambiente,
    puedeEditar,
    onCambiar,
    onCerrar,
}: {
    objetos: ObjetoEscena[];
    seleccion: string | null;
    onElegir: (id: string) => void;
    ambiente: AmbienteEscena;
    puedeEditar: boolean;
    onCambiar: (c: Partial<Pick<AmbienteEscena, "cielo" | "suelo">>) => void;
    onCerrar: () => void;
}) {
    return (
        <>
            <CabeceraHoja titulo="Escena" onCerrar={onCerrar} />
            <span className={css.rotulo}>Objetos ({objetos.length})</span>
            {objetos.length === 0 ? (
                <p className={css.nota}>Aún no hay nada. {puedeEditar ? "Empieza con «Añadir»." : "Quien edita la escena aún no ha puesto objetos."}</p>
            ) : (
                <ul className={css.lista} aria-label="Objetos de la escena">
                    {objetos.map((o) => (
                        <li key={o.id}>
                            <button type="button" className={css.item} aria-current={o.id === seleccion} onClick={() => onElegir(o.id)}>
                                <Icono Icon={ICONO_TIPO[o.tipo]} color={o.material.color} />
                                <span className={`${css.itemTexto} flex-1`}>
                                    <span className={css.itemTitulo}>{o.nombre}</span>
                                    <span className={css.itemDetalle}>
                                        {NOMBRE_TIPO[o.tipo]}
                                        {o.bloqueado ? " · bloqueado" : ""}
                                    </span>
                                </span>
                                {o.bloqueado && <Lock className="size-4 text-white/50" aria-hidden />}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {!puedeEditar && <p className={css.nota}>Modo lectura: ves el ambiente que eligió quien edita la escena.</p>}
            <span className={css.rotulo}>Cielo y luz</span>
            <div className={css.lista}>
                {CIELOS.map((id) => {
                    const p = PRESETS_CIELO[id];
                    return (
                        <button
                            key={id}
                            type="button"
                            className={css.item}
                            aria-pressed={ambiente.cielo === id}
                            disabled={!puedeEditar}
                            onClick={() => onCambiar({ cielo: id })}
                        >
                            <Icono Icon={ICONO_CIELO[id]} color={p.rejilla} />
                            <span className={css.itemTexto}>
                                <span className={css.itemTitulo}>{p.etiqueta}</span>
                                <span className={css.itemDetalle}>{p.descripcion}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
            <span className={css.rotulo}>Suelo</span>
            <div className={css.lista}>
                <button
                    type="button"
                    className={css.item}
                    aria-pressed={ambiente.suelo}
                    disabled={!puedeEditar}
                    onClick={() => onCambiar({ suelo: !ambiente.suelo })}
                >
                    <Icono Icon={Grid3x3} color="#9aa0ad" />
                    <span className={css.itemTexto}>
                        <span className={css.itemTitulo}>{ambiente.suelo ? "Ocultar la rejilla del suelo" : "Mostrar la rejilla del suelo"}</span>
                        <span className={css.itemDetalle}>Ayuda a medir y colocar</span>
                    </span>
                </button>
            </div>
        </>
    );
}

// ───────────────────────────── Personas ─────────────────────────────

const TEXTO_MODO: Record<MetaAvatar["modo"], string> = { "3d": "En 3D", vr: "En VR", ar: "En AR" };

export function PanelPersonas({
    yo,
    otros,
    persistente,
    onCerrar,
}: {
    yo: MetaAvatar | null;
    otros: MetaAvatar[];
    persistente: boolean;
    onCerrar: () => void;
}) {
    const todos = yo ? [yo, ...otros] : otros;
    return (
        <>
            <CabeceraHoja titulo={`Personas dentro (${todos.length})`} onCerrar={onCerrar} />
            <ul className={css.lista} aria-label="Personas en la escena">
                {todos.map((a) => (
                    <li key={a.clave} className={css.item} style={{ cursor: "default" }}>
                        <span className={css.punto} style={{ background: a.color, marginLeft: 0, width: 34, height: 34 }} aria-hidden>
                            {a.nombre.slice(0, 1).toUpperCase()}
                        </span>
                        <span className={css.itemTexto}>
                            <span className={css.itemTitulo}>
                                {a.nombre}
                                {a === yo ? " (tú)" : ""}
                            </span>
                            <span className={css.itemDetalle}>
                                {TEXTO_MODO[a.modo]} · {a.editor ? "puede editar" : "mirando"}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>
            <p className={css.nota}>
                {persistente
                    ? "Los objetos se guardan en la escena. Tu avatar es tu punto de vista: se mueve con tu cámara o con tu visor."
                    : "Sala de la llamada: los objetos viven mientras haya alguien dentro. Guarda una copia si quieres conservarla."}
            </p>
        </>
    );
}

// ───────────────────────────── Inspector ─────────────────────────────

const GRADOS = 180 / Math.PI;

function NumeroEje({
    etiqueta,
    valor,
    paso,
    disabled,
    onConfirmar,
}: {
    etiqueta: string;
    valor: number;
    paso: number;
    disabled: boolean;
    onConfirmar: (n: number) => void;
}) {
    const [borrador, setBorrador] = useState(String(valor));
    useEffect(() => setBorrador(String(valor)), [valor]);
    const confirmar = () => {
        const n = Number(borrador.replace(",", "."));
        if (Number.isFinite(n) && n !== valor) onConfirmar(n);
        else setBorrador(String(valor));
    };
    return (
        <input
            className={css.entrada}
            type="number"
            inputMode="decimal"
            step={paso}
            aria-label={etiqueta}
            value={borrador}
            disabled={disabled}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => {
                if (e.key === "Enter") confirmar();
            }}
        />
    );
}

function Vector({
    titulo,
    valor,
    paso,
    factor = 1,
    disabled,
    onCambiar,
}: {
    titulo: string;
    valor: Vec3;
    paso: number;
    factor?: number;
    disabled: boolean;
    onCambiar: (v: Vec3) => void;
}) {
    const r = (n: number) => Math.round(n * factor * 100) / 100;
    return (
        <div className={css.campo}>
            <span className={css.etiqueta}>{titulo}</span>
            <div className={css.fila3}>
                {(["X", "Y", "Z"] as const).map((eje, i) => (
                    <NumeroEje
                        key={eje}
                        etiqueta={`${titulo} ${eje}`}
                        valor={r(valor[i])}
                        paso={paso}
                        disabled={disabled}
                        onConfirmar={(n) => {
                            const v: Vec3 = [...valor] as Vec3;
                            v[i] = n / factor;
                            onCambiar(v);
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

function Deslizador({
    etiqueta,
    valor,
    min,
    max,
    paso,
    disabled,
    onConfirmar,
}: {
    etiqueta: string;
    valor: number;
    min: number;
    max: number;
    paso: number;
    disabled: boolean;
    onConfirmar: (n: number) => void;
}) {
    const [local, setLocal] = useState(valor);
    useEffect(() => setLocal(valor), [valor]);
    const id = useId();
    // Se confirma al soltar: un deslizador no manda un cambio por cada píxel.
    const soltar = () => {
        if (local !== valor) onConfirmar(local);
    };
    return (
        <div className={css.campo}>
            <label className={css.etiqueta} htmlFor={id}>
                {etiqueta}: {Math.round(local * 100) / 100}
            </label>
            <input
                id={id}
                className={css.deslizador}
                type="range"
                min={min}
                max={max}
                step={paso}
                value={local}
                disabled={disabled}
                onChange={(e) => setLocal(Number(e.target.value))}
                onPointerUp={soltar}
                onKeyUp={soltar}
                onBlur={soltar}
            />
        </div>
    );
}

const MODOS_GIZMO: { modo: ModoGizmo; etiqueta: string; Icon: LucideIcon }[] = [
    { modo: "translate", etiqueta: "Mover", Icon: Move },
    { modo: "rotate", etiqueta: "Girar", Icon: Rotate3d },
    { modo: "scale", etiqueta: "Escalar", Icon: Scale3d },
];

export function PanelInspector({
    obj,
    puedeEditar,
    modoGizmo,
    onModoGizmo,
    onActualizar,
    onDuplicar,
    onBorrar,
    onCerrar,
}: {
    obj: ObjetoEscena;
    puedeEditar: boolean;
    modoGizmo: ModoGizmo;
    onModoGizmo: (m: ModoGizmo) => void;
    onActualizar: (c: Partial<ObjetoEscena>) => void;
    onDuplicar: () => void;
    onBorrar: () => void;
    onCerrar: () => void;
}) {
    const [nombre, setNombre] = useState(obj.nombre);
    const [texto, setTexto] = useState(obj.texto ?? "");
    const [confirmarBorrado, setConfirmarBorrado] = useState(false);
    const idNombre = useId();
    const idTexto = useId();
    const idColor = useId();
    useEffect(() => setNombre(obj.nombre), [obj.nombre]);
    useEffect(() => setTexto(obj.texto ?? ""), [obj.texto]);
    useEffect(() => setConfirmarBorrado(false), [obj.id]);
    const bloqueado = !!obj.bloqueado;
    const editable = puedeEditar && !bloqueado;
    const m = obj.material;
    const material = (c: Partial<ObjetoEscena["material"]>) => onActualizar({ material: { ...m, ...c } });

    return (
        <>
            <CabeceraHoja titulo={NOMBRE_TIPO[obj.tipo]} onCerrar={onCerrar} />
            {!puedeEditar && <p className={css.nota}>Modo lectura: puedes ver sus datos, no cambiarlos.</p>}
            {puedeEditar && bloqueado && <p className={css.nota}>Bloqueado para que nadie lo mueva por accidente. Desbloquéalo para editarlo.</p>}

            <div className={css.campo}>
                <label className={css.etiqueta} htmlFor={idNombre}>
                    Nombre
                </label>
                <input
                    id={idNombre}
                    className={css.entrada}
                    value={nombre}
                    maxLength={60}
                    disabled={!editable}
                    onChange={(e) => setNombre(e.target.value)}
                    onBlur={() => nombre.trim() && nombre !== obj.nombre && onActualizar({ nombre })}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                />
            </div>

            {obj.tipo === "texto" && (
                <div className={css.campo}>
                    <label className={css.etiqueta} htmlFor={idTexto}>
                        Texto del rótulo
                    </label>
                    <textarea
                        id={idTexto}
                        className={css.entrada}
                        value={texto}
                        maxLength={280}
                        disabled={!editable}
                        onChange={(e) => setTexto(e.target.value)}
                        onBlur={() => texto.trim() && texto !== obj.texto && onActualizar({ texto })}
                    />
                </div>
            )}

            {(obj.tipo === "imagen" || obj.tipo === "modelo") && obj.url && (
                <p className={css.nota} style={{ wordBreak: "break-all" }}>
                    Origen: {obj.url}
                </p>
            )}

            {editable && (
                <>
                    <span className={css.rotulo}>Herramienta en la escena</span>
                    <div className={css.fila3} role="group" aria-label="Herramienta de transformación">
                        {MODOS_GIZMO.map(({ modo, etiqueta, Icon }) => (
                            <button
                                key={modo}
                                type="button"
                                className={css.item}
                                style={{ flexDirection: "column", gap: 4, minHeight: 56, justifyContent: "center" }}
                                aria-pressed={modoGizmo === modo}
                                onClick={() => onModoGizmo(modo)}
                            >
                                <Icon className="size-4" aria-hidden />
                                <span className="text-[12px] font-semibold">{etiqueta}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}

            <span className={css.rotulo}>Posición y forma</span>
            <Vector titulo="Posición (m)" valor={obj.pos} paso={0.1} disabled={!editable} onCambiar={(pos) => onActualizar({ pos })} />
            <Vector titulo="Giro (grados)" valor={obj.rot} paso={5} factor={GRADOS} disabled={!editable} onCambiar={(rot) => onActualizar({ rot })} />
            <Vector titulo="Escala" valor={obj.esc} paso={0.1} disabled={!editable} onCambiar={(esc) => onActualizar({ esc })} />

            <span className={css.rotulo}>{obj.tipo === "luz" ? "Luz" : "Color y material"}</span>
            <div className={css.muestras} role="group" aria-label="Color">
                {PALETA_ESCENA.map((c) => (
                    <button
                        key={c}
                        type="button"
                        className={`${css.muestra} ss-redondo`}
                        style={{ background: c }}
                        aria-label={`Color ${c}`}
                        aria-pressed={m.color.toUpperCase() === c.toUpperCase()}
                        disabled={!editable}
                        onClick={() => material({ color: c })}
                    />
                ))}
            </div>
            <div className={css.campo} style={{ marginTop: 8 }}>
                <label className={css.etiqueta} htmlFor={idColor}>
                    Otro color
                </label>
                <input
                    id={idColor}
                    type="color"
                    className="h-10 w-full cursor-pointer rounded-[14px] border border-white/10 bg-transparent"
                    value={m.color.toLowerCase()}
                    disabled={!editable}
                    onChange={(e) => material({ color: e.target.value })}
                />
            </div>
            {obj.tipo === "luz" ? (
                <>
                    <Deslizador etiqueta="Intensidad" valor={obj.intensidad ?? 3} min={0} max={20} paso={0.5} disabled={!editable} onConfirmar={(n) => onActualizar({ intensidad: n })} />
                    <Deslizador etiqueta="Alcance (m)" valor={obj.alcance ?? 12} min={1} max={60} paso={1} disabled={!editable} onConfirmar={(n) => onActualizar({ alcance: n })} />
                </>
            ) : (
                <>
                    {obj.tipo !== "texto" && obj.tipo !== "imagen" && obj.tipo !== "modelo" && (
                        <>
                            <Deslizador etiqueta="Metálico" valor={m.metalico} min={0} max={1} paso={0.05} disabled={!editable} onConfirmar={(n) => material({ metalico: n })} />
                            <Deslizador etiqueta="Rugosidad" valor={m.rugosidad} min={0} max={1} paso={0.05} disabled={!editable} onConfirmar={(n) => material({ rugosidad: n })} />
                            <Deslizador etiqueta="Brillo propio" valor={m.emisivo} min={0} max={2} paso={0.1} disabled={!editable} onConfirmar={(n) => material({ emisivo: n })} />
                        </>
                    )}
                    <Deslizador etiqueta="Opacidad" valor={m.opacidad} min={0.05} max={1} paso={0.05} disabled={!editable} onConfirmar={(n) => material({ opacidad: n })} />
                    {obj.tipo !== "texto" && obj.tipo !== "imagen" && obj.tipo !== "modelo" && (
                        <div className={css.lista}>
                            <button type="button" className={css.item} aria-pressed={m.alambre} disabled={!editable} onClick={() => material({ alambre: !m.alambre })}>
                                <Icono Icon={Grid3x3} color="#14B8A6" />
                                <span className={css.itemTitulo}>{m.alambre ? "Quitar malla de alambre" : "Ver como malla de alambre"}</span>
                            </button>
                        </div>
                    )}
                </>
            )}

            {puedeEditar && (
                <div className={css.acciones}>
                    <button type="button" className={css.boton} style={{ background: "rgba(255,191,0,.14)", boxShadow: "inset 0 0 0 1px rgba(255,191,0,.45)" }} onClick={() => onActualizar({ bloqueado: !bloqueado })}>
                        {bloqueado ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                        {bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                    <button type="button" className={css.boton} style={{ background: "rgba(0,127,255,.14)", boxShadow: "inset 0 0 0 1px rgba(0,127,255,.45)" }} onClick={onDuplicar}>
                        <Copy className="size-4" aria-hidden /> Duplicar
                    </button>
                    <button
                        type="button"
                        className={css.boton}
                        style={{ background: confirmarBorrado ? "#DC143C" : "rgba(220,20,60,.14)", boxShadow: "inset 0 0 0 1px rgba(220,20,60,.5)" }}
                        onClick={() => {
                            if (!confirmarBorrado) setConfirmarBorrado(true);
                            else onBorrar();
                        }}
                    >
                        <Trash2 className="size-4" aria-hidden />
                        {confirmarBorrado ? "Pulsa otra vez para borrarlo para todos" : "Borrar"}
                    </button>
                </div>
            )}
        </>
    );
}
