// src/app/(main)/network/_components/navigation.tsx
'use client';

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export function NetworkNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  const handleTabChange = (value: string) => {
    router.push(`/network/${value}`);
  };

  const getCurrentTab = () => {
    if (pathname.startsWith('/network/politics')) return 'politics';
    if (pathname.startsWith('/network/education')) return 'education';
    if (pathname.startsWith('/network/culture')) return 'culture';
    return 'politics';
  }

  return (
    <Tabs value={getCurrentTab()} onValueChange={handleTabChange} className="w-full">
      <TabsList>
        <TabsTrigger value="politics" asChild>
          <Link href="/network/politics">Política</Link>
        </TabsTrigger>
        <TabsTrigger value="education" asChild>
          <Link href="/network/education">Educación</Link>
        </TabsTrigger>
        <TabsTrigger value="culture" asChild>
          <Link href="/network/culture">Cultura</Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
