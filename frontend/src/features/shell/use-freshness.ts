"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api";

export function useFreshness(): string {
  const query = useQuery({
    queryKey: ["warehouse", "freshness"],
    queryFn: api.warehouseFreshness,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });

  if (query.isFetching) return "Checking load freshness…";
  if (query.isError || !query.data) return "Load freshness · Could not check";
  if (query.data.status === "available") {
    return `Load freshness · ${formatUtc(query.data.oldestUploadedAtUtc)} UTC`;
  }
  if (query.data.status === "no-active-batches") return "Load freshness · No active batches";
  if (query.data.status === "unsupported") return "Load freshness · Not reported by this warehouse";
  if (query.data.status === "unconfigured") return "Load freshness · Warehouse not configured";
  return "Load freshness · Warehouse lookup failed";
}

function formatUtc(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(value));
}
