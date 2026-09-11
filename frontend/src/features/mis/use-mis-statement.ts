"use client";

import type { MisSelectionRunRequest } from "@3f/contract";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api";

export function useMisStatement() {
  const options = useQuery({ queryKey: ["mis", "options"], queryFn: api.misOptions });
  const run = useMutation({ mutationFn: (selection: MisSelectionRunRequest) => api.runMisStatement(selection) });
  return { options, run };
}

export function useMisStatementExport() {
  return useMutation({ mutationFn: api.exportMisStatement });
}
