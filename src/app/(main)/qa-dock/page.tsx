// ════════════════════════════════════════════════════════════════
// QA interno — página temporal de auditoría visual (2026-06-11).
// No está enlazada desde ninguna parte de la UI. Renderiza el mismo
// dashboard que /dashboard pero sin exigir sesión, para verificar en
// viewports móviles el dock Trinity (OmniDock) y el tema Materia Viva.
// En producción devuelve 404 (notFound) — solo existe en desarrollo.
// ════════════════════════════════════════════════════════════════
import { notFound } from 'next/navigation';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';

// Igual que /dashboard: componentes con dependencias ESM-only,
// sin pre-render estático.
export const dynamic = 'force-dynamic';

export default function QaDockPage() {
    if (process.env.NODE_ENV === 'production') notFound();
    return <DashboardLayout />;
}
