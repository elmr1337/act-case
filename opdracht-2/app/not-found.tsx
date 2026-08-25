import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <h1 className="font-heading text-2xl font-bold">Deze pagina bestaat niet</h1>
      <p className="text-muted-foreground text-sm">
        Misschien is de link verlopen of verkeerd overgenomen.
      </p>
      <Button asChild>
        <Link href="/">Terug naar de templates</Link>
      </Button>
    </div>
  );
}
