import type { AnchorHTMLAttributes } from "react";
export default function Link({ href, ...r }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) { return <a href={String(href)} {...r} />; }
