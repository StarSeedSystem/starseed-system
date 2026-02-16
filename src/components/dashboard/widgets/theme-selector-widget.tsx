"use client";

import React from "react";
import { ThemeGallery } from "@/components/settings/appearance/theme-gallery";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette } from "lucide-react";

export function ThemeSelectorWidget() {
    return (
        <Card className="h-full glass-card overflow-hidden flex flex-col">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Temas del Sistema
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pt-0 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                <ThemeGallery compact />
            </CardContent>
        </Card>
    );
}
