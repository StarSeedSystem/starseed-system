"use client";

import React from "react";
import { SettingControl } from "./SettingControl";
import { StitchToggle } from "../../stitch/StitchToggle";

export interface ToggleProps {
    on: boolean;
    onToggle: () => void;
    label: string;
    description?: string;
    id?: string;
    onHighlight?: (id: string | null) => void;
    config?: { style: any; activeColor: string };
}

export function Toggle({ on, onToggle, label, description, id, onHighlight, config }: ToggleProps) {
    return (
        <SettingControl id={id || label} label={label} description={description} onHighlight={onHighlight}
            headerAction={
                <StitchToggle
                    checked={on ?? false}
                    onChange={onToggle}
                    style={config?.style || "standard"}
                    activeColor={config?.activeColor || "#FFbf00"}
                    size="sm"
                />
            }
        />
    );
}
