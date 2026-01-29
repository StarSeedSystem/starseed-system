"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppearance } from "@/context/appearance-context";

export default function SettingsAuditPage() {
    const { settings } = useAppearance();

    return (
        <div className="container mx-auto p-8 space-y-12 pb-32">
            <div className="space-y-4">
                <h1 className="text-4xl font-bold tracking-tight">Settings Audit & Stress Test</h1>
                <p className="text-muted-foreground text-lg">
                    Use this page to verify visual consistency across all themes, layouts, and liquid glass configurations.
                    Check for text readability, contrast issues, and visual noise.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Section: Liquid Glass UI Check */}
                <section className="space-y-6">
                    <h2 className="text-2xl font-semibold border-b pb-2">Liquid Glass UI Elements</h2>

                    <div className="grid gap-4">
                        <Card className="liquid-glass-ui">
                            <CardHeader>
                                <CardTitle>Liquid Glass Card</CardTitle>
                                <CardDescription>This card has the .liquid-glass-ui class applied.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p>
                                    Verify that this text is sharp and readable against the background.
                                    The liquid distortion should be subtle and flowing, not grainy.
                                </p>
                                <div className="mt-4 flex gap-2">
                                    <Button variant="default">Default Button</Button>
                                    <Button variant="secondary">Secondary</Button>
                                    <Button variant="outline">Outline</Button>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="p-6 rounded-xl border liquid-glass-ui flex flex-col gap-4 items-center justify-center text-center">
                            <h3 className="text-lg font-medium">Standalone Container</h3>
                            <p className="text-sm opacity-80">This container also uses the liquid effect.</p>
                            <Button className="w-full sm:w-auto">Action Button</Button>
                        </div>
                    </div>
                </section>

                {/* Section: Standard UI Comparison */}
                <section className="space-y-6">
                    <h2 className="text-2xl font-semibold border-b pb-2">Standard UI Elements</h2>

                    <div className="grid gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Standard Card</CardTitle>
                                <CardDescription>No liquid effect here.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p>
                                    This is the control group. Compare readability and contrast with the liquid version.
                                </p>
                                <div className="mt-4 flex gap-2">
                                    <Button variant="default">Default Button</Button>
                                    <Button variant="secondary">Secondary</Button>
                                    <Button variant="outline">Outline</Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-6 space-y-4">
                                <div className="grid w-full max-w-sm items-center gap-1.5">
                                    <Label htmlFor="email">Email</Label>
                                    <Input type="email" id="email" placeholder="Email" />
                                </div>
                                <div className="grid w-full max-w-sm items-center gap-1.5">
                                    <Label htmlFor="password">Password</Label>
                                    <Input type="password" id="password" placeholder="Password" />
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </div>

            {/* Section: Typography Scale */}
            <section className="space-y-6">
                <h2 className="text-2xl font-semibold border-b pb-2">Typography Scale</h2>
                <div className="space-y-2 p-6 rounded-lg border bg-card">
                    <h1 className="text-5xl font-extrabold">Heading 1 (5xl)</h1>
                    <h2 className="text-4xl font-bold">Heading 2 (4xl)</h2>
                    <h3 className="text-3xl font-bold">Heading 3 (3xl)</h3>
                    <h4 className="text-2xl font-semibold">Heading 4 (2xl)</h4>
                    <h5 className="text-xl font-semibold">Heading 5 (xl)</h5>
                    <p className="text-base">Body text (base). Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
                    <p className="text-sm text-muted-foreground">Small text (sm). Used for captions and secondary information.</p>
                    <p className="text-xs text-muted-foreground">Tiny text (xs). Used for labels/metadata.</p>
                </div>
            </section>

            {/* Section: Interactive States */}
            <section className="space-y-6">
                <h2 className="text-2xl font-semibold border-b pb-2">Interactive States</h2>
                <div className="flex flex-wrap gap-4 p-6 rounded-lg border bg-card items-center">
                    <Button>Default</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="link">Link</Button>
                    <Button disabled>Disabled</Button>
                    <Input className="max-w-xs" placeholder="Input field..." />
                    <Input className="max-w-xs" disabled placeholder="Disabled input" />
                </div>
            </section>

            {/* Section: Tabs & Layout */}
            <section className="space-y-6">
                <h2 className="text-2xl font-semibold border-b pb-2">Tabs & Content</h2>
                <div className="p-6 rounded-lg border bg-card">
                    <Tabs defaultValue="account" className="w-[400px]">
                        <TabsList>
                            <TabsTrigger value="account">Account</TabsTrigger>
                            <TabsTrigger value="password">Password</TabsTrigger>
                            <TabsTrigger value="settings">Settings</TabsTrigger>
                        </TabsList>
                        <TabsContent value="account">Make changes to your account here.</TabsContent>
                        <TabsContent value="password">Change your password here.</TabsContent>
                        <TabsContent value="settings">Manage your settings.</TabsContent>
                    </Tabs>
                </div>
            </section>
        </div>
    );
}
