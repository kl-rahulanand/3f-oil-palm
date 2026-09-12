"use client";

import type { Pin, SavedQuery } from "@3f/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api";

const savedKey = ["saved-queries"] as const;
const pinsKey = ["pins"] as const;

export function useSavedViews() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: savedKey, queryFn: api.savedQueries });
  const remove = useMutation({
    mutationFn: api.deleteSavedQuery,
    onSuccess: (_, id) =>
      client.setQueryData<SavedQuery[]>(savedKey, (items) => items?.filter((item) => item.id !== id)),
  });
  return {
    items: query.data ?? [],
    isPending: query.isPending,
    loadError: errorMessage(query.error, "Saved views could not be loaded. Refresh the page to try again."),
    deleteError: errorMessage(remove.error, "The saved view could not be deleted. Try again."),
    deletingId: remove.isPending ? remove.variables : undefined,
    remove: remove.mutate,
  };
}

export function usePinnedReports() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: pinsKey, queryFn: api.pins });
  const remove = useMutation({
    mutationFn: api.deletePin,
    onSuccess: (_, id) => client.setQueryData<Pin[]>(pinsKey, (items) => items?.filter((item) => item.id !== id)),
  });
  return {
    items: query.data ?? [],
    isPending: query.isPending,
    loadError: errorMessage(query.error, "Pinned reports could not be loaded. Refresh the page to try again."),
    deleteError: errorMessage(remove.error, "The pinned report could not be deleted. Try again."),
    deletingId: remove.isPending ? remove.variables : undefined,
    remove: remove.mutate,
  };
}

function errorMessage(error: unknown, message: string): string | null {
  return error ? message : null;
}
