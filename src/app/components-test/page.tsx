"use client";

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

export default function ComponentsTestPage() {
    const { setConfig } = useAppearance();

    // Force enable liquid UI for testing
    const enableLiquid = () => {
        setConfig((prev) => ({
            ...prev,
            liquidGlass: {
                ...prev.liquidGlass,
                enabled: true,
            },
        }));
    };

    return (
        <div className="min-h-screen p-10 flex flex-col gap-8 items-start relative z-10">
            <div className="absolute top-4 right-4 z-50">
                <Button onClick={enableLiquid} variant="outline">Force Enable Liquid UI</Button>
            </div>

            <h1 className="text-4xl font-bold mb-4">Liquid UI Component Test</h1>

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
