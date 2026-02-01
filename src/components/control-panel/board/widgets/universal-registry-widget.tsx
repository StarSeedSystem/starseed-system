import React from "react";
import { WidgetRegistry } from "@/components/dashboard/widget-registry";
import { DashboardWidget, WidgetType as DashboardWidgetType } from "@/components/dashboard/dashboard-types";

interface UniversalRegistryWidgetProps {
    type: string;
}

export function UniversalRegistryWidget({ type }: UniversalRegistryWidgetProps) {
    // Construct a mock widget object to pass to the registry
    // We intentionally cast the type and provide dummy values for required fields
    // to allow the Dashboard Registry to render its content within the Board.
    const mockWidget: DashboardWidget = {
        id: "universal-mock",
        dashboard_id: "board-mock-dashboard",
        widget_type: type as DashboardWidgetType,
        layout: {
            x: 0,
            y: 0,
            w: 1,
            h: 1
        },
        settings: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    return (
        <div className="h-full w-full overflow-hidden rounded-xl">
            {/* We reuse the Registry to render the internal content */}
            <WidgetRegistry widget={mockWidget} />
        </div>
    );
}
