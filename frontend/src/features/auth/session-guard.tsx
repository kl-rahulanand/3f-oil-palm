"use client";

import type { AuthUser } from "@3f/contract";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { api } from "@/src/lib/api";
import { sessionQueryKey } from "./session";

export function SessionGuard({ children }: Readonly<{ children: (user: AuthUser) => ReactNode }>) {
  const router = useRouter();
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: api.me, retry: false });

  useEffect(() => {
    if (session.isError) router.replace("/login");
  }, [router, session.isError]);

  if (!session.data) return <div className="session-loading">Checking your session…</div>;
  return children(session.data);
}
