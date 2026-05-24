"use client";

import { SystemMonitor } from '@/components/stitch/SystemMonitor';

export default function SystemMonitorPreviewPage() {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-8 bg-[url('https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <div className="relative z-10 flex flex-col items-center space-y-8">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold text-white tracking-widest font-display">HYPER-CRYSTAL</h1>
                    <p className="text-[#007fff] font-mono text-sm">SYSTEM MONITOR MODULE // PHASE 6</p>
                </div>

                <SystemMonitor />
            </div>
        </div>
    );
}
