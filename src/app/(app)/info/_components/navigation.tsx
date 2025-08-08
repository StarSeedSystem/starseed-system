// src/app/(app)/info/_components/navigation.tsx
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { BookOpen, Library, GanttChart } from 'lucide-react';

const navItems = [
    { href: '/info', label: 'Centro de Información' },
    { href: '/info/constitution', label: 'Constitución' },
    { href: 'https://starseed-c4b17.web.app/', label: 'Fundamentos y Visión', external: true },
    { href: '#', label: 'Manual de la Red (Próximamente)' },
    { href: '#', label: 'Diccionario (Próximamente)' },
];

export function InfoNavigation() {
  const pathname = usePathname();

  return (
    <div>
        <h1 className="text-3xl font-bold font-headline">Información</h1>
        <p className="text-muted-foreground">
            La base de conocimiento fundamental de la Sociedad StarSeed.
        </p>
        <div className="mt-4 border-b">
            <nav className="flex gap-4" aria-label="Info navigation">
            {navItems.map((item) => (
                <Link
                    key={item.href}
                    href={item.href}
                    target={item.external ? '_blank' : '_self'}
                    className={cn(
                        'pb-3 px-1 text-sm font-medium transition-colors',
                        pathname === item.href
                        ? 'border-b-2 border-primary text-primary'
                        : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
                    )}
                >
                    {item.label}
                </Link>
            ))}
            </nav>
        </div>
    </div>
  );
}
