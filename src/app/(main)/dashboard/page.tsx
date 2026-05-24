import { DashboardLayout } from "@/components/dashboard/dashboard-layout";

// Spline 3D components are ESM-only and can't be statically pre-rendered
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
    return (
        <DashboardLayout />
    );
}
