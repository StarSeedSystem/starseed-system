'use client';

import { usePathname } from 'next/navigation';
import { Network, Scale, School, Palette } from 'lucide-react';
import { SectionTabs, type SectionTabItem } from '@/components/ui/section-tabs';

const navItems: { href: string; label: string; icon: SectionTabItem['icon'] }[] = [
    { href: '/network', label: 'Panorama', icon: Network },
    { href: '/network/politics', label: 'Política', icon: Scale },
    { href: '/network/education', label: 'Educación', icon: School },
    { href: '/network/culture', label: 'Cultura', icon: Palette },
];

export function NetworkNavigation() {
    const pathname = usePathname();

    // Menú unificado del OS (Adenda 66 §10): mismo componente que el Hub y el
    // resto de secciones. Scroll-x limpio en móvil (antes las etiquetas partían).
    const items: SectionTabItem[] = navItems.map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
        active: pathname === item.href,
    }));

    return <SectionTabs items={items} ariaLabel="Navegación de la Red" className="mb-2" />;
}
