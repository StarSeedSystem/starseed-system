"use client";

import { DesignIntegrationCanvas } from "@/components/design-canvas/DesignIntegrationCanvas";

export default function DesignCanvasPage() {
    return (
        <div className="min-h-screen bg-[var(--background,#0F0F23)] text-white">
            <DesignIntegrationCanvas />
        </div>
    );
}
