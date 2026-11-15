import { lazy, Suspense, type ComponentType } from "react";
export default function dynamic(f: () => Promise<{ default: ComponentType<any> } | ComponentType<any>>) { const L = lazy(async () => { const m: any = await f(); return m.default ? m : { default: m }; }); return (p: any) => <Suspense fallback={null}><L {...p} /></Suspense>; }
