"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/src/components/shell/app-shell";
import { SessionGuard } from "@/src/features/auth/session-guard";

export default function AuthenticatedLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <SessionGuard>{(user) => <AppShell user={user}>{children}</AppShell>}</SessionGuard>;
}
