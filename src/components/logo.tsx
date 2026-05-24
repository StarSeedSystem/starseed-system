import Image from "next/image";

export function Logo() {
  return (
    <div className="flex items-center gap-2 font-headline text-lg font-semibold tracking-tighter">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg">
        <Image
          src="/logo.png"
          alt="StarSeed Logo"
          fill
          sizes="32px"
          className="object-contain"
        />
      </div>
      StarSeed Network
    </div>
  );
}
