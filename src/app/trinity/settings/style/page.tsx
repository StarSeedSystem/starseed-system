import React from 'react';
import { StyleAdapter } from '@/components/settings/StyleAdapter';

export default function StyleSettingsPage() {
    return (
        <div className="min-h-screen bg-[#020205] pt-24">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[150px] rounded-full mix-blend-screen" />
            </div>
            <StyleAdapter />
        </div>
    );
}
