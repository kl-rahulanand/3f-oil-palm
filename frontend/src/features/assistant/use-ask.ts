"use client";

import { ResponseClass, type AskPriorTurn, type AskResponse } from "@3f/contract";
import { createContext, useContext, useState, type ReactNode } from "react";
import { api } from "@/src/lib/api";

export interface AskTurn {
  question: string;
  response: AskResponse;
}

interface AskContextValue {
  turns: AskTurn[];
  isPending: boolean;
  error: string | null;
  ask: (question: string) => Promise<void>;
}

const AskContext = createContext<AskContextValue | null>(null);

export function AskProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isPending) return;

    const priorTurns: AskPriorTurn[] = turns.flatMap((turn) =>
      turn.response.responseClass === ResponseClass.Success && turn.response.selection
        ? [{ question: turn.question, selection: turn.response.selection }]
        : [],
    );
    setIsPending(true);
    setError(null);
    try {
      const response = await api.ask({ question: trimmed, ...(priorTurns.length ? { priorTurns } : {}) });
      setTurns((current) => [...current, { question: trimmed, response }]);
    } catch {
      setError("The question could not be sent. Try again.");
    } finally {
      setIsPending(false);
    }
  }

  return <AskContext.Provider value={{ turns, isPending, error, ask }}>{children}</AskContext.Provider>;
}

export function useAsk(): AskContextValue {
  const value = useContext(AskContext);
  if (!value) throw new Error("useAsk must be used within AskProvider");
  return value;
}
