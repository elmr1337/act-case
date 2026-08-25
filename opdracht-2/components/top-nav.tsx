"use client";

import { Rows3, Table2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { JobsMenu } from "@/components/jobs-menu";
import { cn } from "@/lib/utils";

/** De vaste navigatie, met een actieve staat zodat je ziet waar je bent. */
export function TopNav() {
  const pathname = usePathname();
  const inBatch = pathname === "/batch" || pathname.endsWith("/batch");
  const inOverview = pathname === "/overzicht";

  return (
    <div className="flex items-center gap-2">
      <NavLink href="/batch" active={inBatch} icon={<Table2 className="size-4" />}>
        Meerdere tegelijk
      </NavLink>

      <NavLink
        href="/overzicht"
        active={inOverview}
        icon={<Rows3 className="size-4" />}
        hideOnMobile
      >
        Overzicht
      </NavLink>

      <JobsMenu />
    </div>
  );
}

function NavLink({
  href,
  active,
  icon,
  hideOnMobile,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  hideOnMobile?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-colors sm:px-4",
        hideOnMobile ? "hidden sm:flex" : "flex",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:border-foreground/25",
      )}
    >
      {icon}
      <span className={hideOnMobile ? "" : "hidden sm:inline"}>{children}</span>
    </Link>
  );
}
