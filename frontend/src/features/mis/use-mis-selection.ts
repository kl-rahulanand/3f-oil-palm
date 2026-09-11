"use client";

import type { MisSelectionRunRequest } from "@3f/contract";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api";

export function useMisSelection() {
  const options = useQuery({ queryKey: ["mis", "options"], queryFn: api.misOptions });
  const run = useMutation({ mutationFn: (selection: MisSelectionRunRequest) => api.runMisSelection(selection) });
  return { options, run };
}
