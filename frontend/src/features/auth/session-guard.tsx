"use client";

import type { AuthUser } from "@3f/contract";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ApiError, api } from "@/src/lib/api";
import { sessionQueryKey } from "./session";

export function SessionGuard({ children }: Readonly<{ children: (user: AuthUser) => ReactNode }>) {
  const router = useRouter();
  const session = useQuery({ queryKey: sessionQueryKey, queryFn: api.me, retry: false });

  // Only a confirmed 401 means the session is gone: api.me refreshes once and
  // retries, so a 401 here is a failed retry, not a transient blip. A 5xx,
  // network drop, malformed body, or CSRF-bootstrap failure must NOT eject an
  // authenticated user to /login — those surface a retryable error instead.
  const unauthorized = session.error instanceof ApiError && session.error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace("/login");
  }, [router, unauthorized]);

  if (session.isError && !unauthorized) {
    return (
      <div className="session-loading" role="alert">
        We couldn&apos;t verify your session. Refresh to try again.
      </div>
    );
  }
  if (!session.data) return <div className="session-loading">Checking your session…</div>;
  return children(session.data);
}
