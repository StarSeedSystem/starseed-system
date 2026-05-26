export type PanelNode = {
    id: string;
    type: 'panel';
    dashboardIds: string[];
    activeDashboardId: string | null;
};

export type SplitNode = {
    id: string;
    type: 'split';
    direction: 'horizontal' | 'vertical';
    sizes: number[]; // Array of percentages, e.g., [50, 50]
    children: WorkspaceNode[];
};

export type WorkspaceNode = PanelNode | SplitNode;

export interface DashboardWorkspaceState {
    root: WorkspaceNode;
}

// Helpers
export function createDefaultWorkspace(initialDashboardId: string): DashboardWorkspaceState {
    return {
        root: {
            id: 'root-panel',
            type: 'panel',
            dashboardIds: [initialDashboardId],
            activeDashboardId: initialDashboardId
        }
    };
}
