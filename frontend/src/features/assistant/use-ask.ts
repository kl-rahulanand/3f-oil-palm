"use client";

import type { AskPriorTurn, AskResponse, ChatStreamEvent, Selection } from "@3f/contract";
import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/src/lib/api";

export interface AskTurn {
  id: string;
  question: string;
  response: AskResponse;
  isPending?: boolean;
  error?: string;
}

interface AskContextValue {
  turns: AskTurn[];
  phases: Array<Extract<ChatStreamEvent, { type: "phase" }>["phase"]>;
  isPending: boolean;
  error: string | null;
  ask: (question: string) => Promise<void>;
  rerun: (question: string, selection: Selection) => Promise<boolean>;
  continueTurn: (turnId: string, question: string, selection: Selection) => Promise<boolean>;
}

const AskContext = createContext<AskContextValue | null>(null);

export function AskProvider({ children, pathname = "/ask" }: Readonly<{ children: ReactNode; pathname?: string }>) {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [phases, setPhases] = useState<AskContextValue["phases"]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingPhasesRef = useRef<AskContextValue["phases"]>([]);
  const phasesVisibleRef = useRef(false);
  const nextTurnIdRef = useRef(0);

  useEffect(() => {
    if (pathname !== "/ask" && pathname !== "/mis-reports") abortRef.current?.abort();
  }, [pathname]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function clearProgress() {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = undefined;
    pendingPhasesRef.current = [];
    phasesVisibleRef.current = false;
    setPhases([]);
  }

  function receivePhase(phase: AskContextValue["phases"][number]) {
    pendingPhasesRef.current = [...pendingPhasesRef.current, phase];
    if (phasesVisibleRef.current) {
      setPhases(pendingPhasesRef.current);
    } else if (!phaseTimerRef.current) {
      phaseTimerRef.current = setTimeout(() => {
        phaseTimerRef.current = undefined;
        phasesVisibleRef.current = true;
        setPhases(pendingPhasesRef.current);
      }, 250);
    }
  }

  async function run(question: string, selection?: Selection): Promise<boolean> {
    const trimmed = question.trim();
    if (!trimmed || isPending) return false;

    const priorTurns: AskPriorTurn[] = turns.flatMap((turn) =>
      turn.response.responseClass === "success" && turn.response.selection
        ? [{ question: turn.question, selection: turn.response.selection }]
        : [],
    );
    setIsPending(true);
    setError(null);
    clearProgress();
    const controller = (abortRef.current = new AbortController());
    try {
      const response = selection
        ? await api.ask({ question: trimmed, selection }, { signal: controller.signal })
        : await api.ask(
            { question: trimmed, ...(priorTurns.length ? { priorTurns } : {}) },
            { signal: controller.signal, onPhase: receivePhase },
          );
      clearProgress();
      setTurns((current) => [...current, { id: `ask-turn-${++nextTurnIdRef.current}`, question: trimmed, response }]);
    } catch (caught) {
      clearProgress();
      if (!isAbort(caught)) setError("The question could not be sent. Try again.");
    } finally {
      abortRef.current = undefined;
      setIsPending(false);
    }
    return true;
  }

  async function continueTurn(turnId: string, question: string, selection: Selection): Promise<boolean> {
    if (!question.trim() || isPending || !turns.some((turn) => turn.id === turnId)) return false;

    setIsPending(true);
    setError(null);
    setTurns((current) =>
      current.map((turn) => (turn.id === turnId ? { ...turn, isPending: true, error: undefined } : turn)),
    );
    const controller = (abortRef.current = new AbortController());
    try {
      const response = await api.ask({ question, selection }, { signal: controller.signal });
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? response.responseClass === "success"
              ? { id: turn.id, question: turn.question, response }
              : { ...turn, isPending: false, error: "That period could not be loaded. Choose a period to try again." }
            : turn,
        ),
      );
    } catch (caught) {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? {
                ...turn,
                isPending: false,
                ...(isAbort(caught) ? { error: undefined } : { error: "The period could not be loaded. Try again." }),
              }
            : turn,
        ),
      );
    } finally {
      abortRef.current = undefined;
      setIsPending(false);
    }
    return true;
  }

  return createElement(
    AskContext.Provider,
    {
      value: {
        turns,
        phases,
        isPending,
        error,
        ask: async (question) => {
          await run(question);
        },
        rerun: (question, selection) => run(question, selection),
        continueTurn,
      },
    },
    children,
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useAsk(): AskContextValue {
  const value = useContext(AskContext);
  if (!value) throw new Error("useAsk must be used within AskProvider");
  return value;
}
