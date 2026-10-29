"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useAppearance } from "@/context/appearance-context";
import { leerNivelMovimiento } from "@/lib/movimiento/nivel";
import {
    alquimia,
    barridoHorizonte,
    cristalizacion,
    CURVAS,
    DURACION_INTERFAZ,
    entradaCardinal,
    elementoCompartido,
    fundidoDesenfoque,
    opcionesReducidas,
    type Animacion,
} from "@/lib/design/movimiento-starseed";

/**
 * La bancada de las transiciones de la marca (DSN1019G): cada caja reproduce
 * la Animación de la biblioteca de movimiento StarSeed con WAAPI, tal y como
 * hace `memory/diseno/estudio-audiovisual/examples/transiciones.html`. Solo
 * se animan `transform`, `opacity`, `filter` y `clip-path`; con movimiento
 * reducido cada una va en su versión de `opcionesReducidas`.
 */
function SeccionTransiciones() {
    const entrada = useRef<HTMLDivElement>(null);
    const desenfoque = useRef<HTMLDivElement>(null);
    const compartido = useRef<HTMLDivElement>(null);
    const linea = useRef<HTMLDivElement>(null);
    const escenaB = useRef<HTMLDivElement>(null);
    const malla = useRef<HTMLDivElement>(null);
    const oro = useRef<HTMLDivElement>(null);
    const [vueltas, setVueltas] = useState(0);

    const reproducir = useCallback(() => {
        const reducido = leerNivelMovimiento() === "minimo";
        const en = (el: HTMLDivElement | null, a: Animacion) => {
            if (!el || typeof el.animate !== "function") return;
            const b = reducido ? opcionesReducidas(a) : a;
            el.animate(b.keyframes as unknown as Keyframe[], {
                duration: b.duracionMs,
                easing: b.curva,
                delay: b.delayMs ?? 0,
                fill: b.relleno,
                direction: b.direccion,
                iterations: b.iteraciones,
            });
        };
        en(entrada.current, entradaCardinal("anchor")); // Sur: entra desde el borde de abajo
        en(desenfoque.current, fundidoDesenfoque()); // «Cristal Líquido»: aparece desdibujado
        en(compartido.current, elementoCompartido()); // el elemento crece hacia su destino
        const barrido = barridoHorizonte(); // la línea cruza y la escena nueva se descubre
        en(linea.current, barrido.linea);
        en(escenaB.current, barrido.escenaB);
        en(malla.current, cristalizacion()); // la malla dispersa se ordena en retícula
        en(oro.current, alquimia()); // el elemento gris se vuelve oro de lógica
    }, []);

    useEffect(() => { reproducir(); }, [reproducir, vueltas]);

    const cajas = "relative overflow-hidden h-[200px] rounded-2xl border border-white/10 bg-white/5 grid place-items-center";
    const transicionPildora = `${DURACION_INTERFAZ.rapido}ms ${CURVAS.glide}`;

    return (
        <section className="flex flex-col gap-4 w-full max-w-4xl">
            <h2 className="text-2xl font-semibold">Transiciones de la marca (biblioteca de movimiento StarSeed)</h2>
            <div className="grid grid-cols-2 gap-6 max-md:grid-cols-1">
                <div className={cajas}>
                    <span className="absolute top-2 left-4 text-xs text-white/45">Entrada cardinal · Anchor</span>
                    <div ref={entrada} className="h-14 w-3/5 rounded-full bg-primary" style={{ transition: transicionPildora }} />
                </div>
                <div className={cajas}>
                    <span className="absolute top-2 left-4 text-xs text-white/45">Fundido con desenfoque</span>
                    <div ref={desenfoque} className="h-14 w-3/5 rounded-full bg-primary" style={{ transition: transicionPildora }} />
                </div>
                <div className={cajas}>
                    <span className="absolute top-2 left-4 text-xs text-white/45">Elemento compartido</span>
                    <div ref={compartido} className="h-12 w-[72px] rounded-xl bg-secondary" style={{ transition: transicionPildora }} />
                </div>
                <div className={cajas}>
                    <span className="absolute top-2 left-4 text-xs text-black/60">Barrido de horizonte · la «jugada rara»</span>
                    <div ref={escenaB} className="absolute inset-0 bg-primary" />
                    <div ref={linea} className="absolute left-0 right-0 top-[66%] h-[2px] bg-foreground" style={{ transformOrigin: "left" }} />
                </div>
                <div className={cajas}>
                    <span className="absolute top-2 left-4 text-xs text-white/45">Cristalización</span>
                    <div ref={malla} className="h-12 w-[72px] rounded-xl bg-accent" style={{ transition: transicionPildora }} />
                </div>
                <div className={cajas}>
                    <span className="absolute top-2 left-4 text-xs text-white/45">Alquimia</span>
                    <div ref={oro} className="h-12 w-[72px] rounded-xl bg-secondary-foreground" style={{ transition: transicionPildora }} />
                </div>
            </div>
            <Button type="button" className="cursor-pointer self-center" title="Vuelve a pasar las seis transiciones" onClick={() => setVueltas((v) => v + 1)}>
                Repetir
            </Button>
        </section>
    );
}

export default function ComponentsTestPage() {
    const { updateConfig } = useAppearance();

    // Force enable liquid UI for testing.
    // updateConfig hace deep-merge, así que basta con la rama que cambia.
    const enableLiquid = () => {
        updateConfig({ liquidGlass: { enabled: true } });
    };

    return (
        <div className="min-h-screen p-10 flex flex-col gap-8 items-start relative z-10">
            <div className="absolute top-4 right-4 z-50">
                <Button onClick={enableLiquid} variant="outline">Force Enable Liquid UI</Button>
            </div>

            <h1 className="text-4xl font-bold mb-4">Liquid UI Component Test</h1>

            <SeccionTransiciones />

            <section className="flex flex-col gap-4">
                <h2 className="text-2xl font-semibold">Buttons</h2>
                <div className="flex gap-4">
                    <Button>Primary Button</Button>
                    <Button variant="secondary">Secondary Button</Button>
                    <Button variant="outline">Outline Button</Button>
                    <Button variant="ghost">Ghost Button</Button>
                    <Button variant="destructive">Destructive Button</Button>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-2xl font-semibold">Cards</h2>
                <div className="grid grid-cols-2 gap-6 w-full max-w-4xl">
                    <Card>
                        <CardHeader>
                            <CardTitle>Standard Card</CardTitle>
                            <CardDescription>This card should have the liquid glass texture.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p>Content inside the card.</p>
                        </CardContent>
                    </Card>
                    <Card className="data-[liquid-ui=true]:liquid-glass-ui">
                        <CardHeader>
                            <CardTitle>Explicit Liquid Card</CardTitle>
                            <CardDescription>Forcing the class via props (if supported).</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p>Content inside the card.</p>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-2xl font-semibold">Dropdown Menu</h2>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button>Open Menu</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Profile</DropdownMenuItem>
                        <DropdownMenuItem>Billing</DropdownMenuItem>
                        <DropdownMenuItem>Team</DropdownMenuItem>
                        <DropdownMenuItem>Subscription</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </section>

            <section className="flex flex-col gap-4">
                <h2 className="text-2xl font-semibold">Dialog</h2>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button variant="outline">Open Dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Edit profile</DialogTitle>
                            <DialogDescription>
                                Make changes to your profile here. Click save when you're done.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                Name
                                <input className="col-span-3 border p-2 rounded" defaultValue="Pedro Duarte" />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <Button type="submit">Save changes</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </section>
        </div>
    );
}
