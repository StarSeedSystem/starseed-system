"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { DashboardWorkspaceState, WorkspaceNode, PanelNode, SplitNode, createDefaultWorkspace } from "./dashboard-workspace-types";

interface WorkspaceContextValue {
    state: DashboardWorkspaceState;
    splitPanel: (panelId: string, direction: 'horizontal' | 'vertical') => void;
    closePanel: (panelId: string) => void;
    moveDashboard: (dashboardId: string, sourcePanelId: string, targetPanelId: string) => void;
    setActiveDashboard: (panelId: string, dashboardId: string) => void;
    openDashboardInPanel: (dashboardId: string, panelId: string) => void;
    setState: React.Dispatch<React.SetStateAction<DashboardWorkspaceState>>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children, initialDashboards }: { children: ReactNode, initialDashboards: string[] }) {
    const [state, setState] = useState<DashboardWorkspaceState>(() => {
        if (initialDashboards.length > 0) {
            return {
                root: {
                    id: 'root-panel',
                    type: 'panel',
                    dashboardIds: initialDashboards,
                    activeDashboardId: initialDashboards[0]
                }
            };
        }
        return createDefaultWorkspace('default');
    });

    const splitPanel = useCallback((panelId: string, direction: 'horizontal' | 'vertical') => {
        setState(prev => {
            const newState = JSON.parse(JSON.stringify(prev)); // Deep clone for simplicity

            const findAndReplace = (node: WorkspaceNode): WorkspaceNode => {
                if (node.type === 'panel' && node.id === panelId) {
                    // Turn this panel into a split node
                    const newPanel1: PanelNode = { ...node, id: crypto.randomUUID() };
                    const newPanel2: PanelNode = { id: crypto.randomUUID(), type: 'panel', dashboardIds: [], activeDashboardId: null };
                    
                    return {
                        id: crypto.randomUUID(),
                        type: 'split',
                        direction,
                        sizes: [50, 50],
                        children: [newPanel1, newPanel2]
                    };
                }
                
                if (node.type === 'split') {
                    return {
                        ...node,
                        children: node.children.map(findAndReplace)
                    };
                }
                return node;
            };

            newState.root = findAndReplace(newState.root);
            return newState;
        });
    }, []);

    const closePanel = useCallback((panelId: string) => {
        setState(prev => {
            const newState = JSON.parse(JSON.stringify(prev));

            const findAndRemove = (node: WorkspaceNode): WorkspaceNode | null => {
                if (node.type === 'panel' && node.id === panelId) {
                    return null;
                }
                if (node.type === 'split') {
                    const newChildren = node.children.map(findAndRemove).filter(Boolean) as WorkspaceNode[];
                    if (newChildren.length === 0) return null;
                    if (newChildren.length === 1) return newChildren[0]; // collapse split
                    return { ...node, children: newChildren, sizes: newChildren.map(() => 100 / newChildren.length) };
                }
                return node;
            };

            const newRoot = findAndRemove(newState.root);
            if (!newRoot) return prev; // Cannot close the last panel
            newState.root = newRoot;
            return newState;
        });
    }, []);

    const moveDashboard = useCallback((dashboardId: string, sourcePanelId: string, targetPanelId: string) => {
        setState(prev => {
            if (sourcePanelId === targetPanelId) return prev;
            const newState = JSON.parse(JSON.stringify(prev));

            const updateNode = (node: WorkspaceNode): WorkspaceNode => {
                if (node.type === 'panel') {
                    if (node.id === sourcePanelId) {
                        const newIds = node.dashboardIds.filter(id => id !== dashboardId);
                        return {
                            ...node,
                            dashboardIds: newIds,
                            activeDashboardId: node.activeDashboardId === dashboardId ? (newIds[0] || null) : node.activeDashboardId
                        };
                    }
                    if (node.id === targetPanelId) {
                        const newIds = [...node.dashboardIds, dashboardId];
                        return {
                            ...node,
                            dashboardIds: newIds,
                            activeDashboardId: dashboardId // Focus the moved dashboard
                        };
                    }
                }
                if (node.type === 'split') {
                    return { ...node, children: node.children.map(updateNode) };
                }
                return node;
            };

            newState.root = updateNode(newState.root);
            return newState;
        });
    }, []);

    const setActiveDashboard = useCallback((panelId: string, dashboardId: string) => {
        setState(prev => {
            const newState = JSON.parse(JSON.stringify(prev));
            const updateNode = (node: WorkspaceNode): WorkspaceNode => {
                if (node.type === 'panel' && node.id === panelId) {
                    return { ...node, activeDashboardId: dashboardId };
                }
                if (node.type === 'split') {
                    return { ...node, children: node.children.map(updateNode) };
                }
                return node;
            };
            newState.root = updateNode(newState.root);
            return newState;
        });
    }, []);

    const openDashboardInPanel = useCallback((dashboardId: string, panelId: string) => {
        setState(prev => {
            const newState = JSON.parse(JSON.stringify(prev));
            const updateNode = (node: WorkspaceNode): WorkspaceNode => {
                if (node.type === 'panel' && node.id === panelId) {
                    if (!node.dashboardIds.includes(dashboardId)) {
                        return { 
                            ...node, 
                            dashboardIds: [...node.dashboardIds, dashboardId],
                            activeDashboardId: dashboardId
                        };
                    }
                    return { ...node, activeDashboardId: dashboardId };
                }
                if (node.type === 'split') {
                    return { ...node, children: node.children.map(updateNode) };
                }
                return node;
            };
            newState.root = updateNode(newState.root);
            return newState;
        });
    }, []);

    return (
        <WorkspaceContext.Provider value={{ state, splitPanel, closePanel, moveDashboard, setActiveDashboard, openDashboardInPanel, setState }}>
            {children}
        </WorkspaceContext.Provider>
    );
}

export function useWorkspace() {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
    return ctx;
}
