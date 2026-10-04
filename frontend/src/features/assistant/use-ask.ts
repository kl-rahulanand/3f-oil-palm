"use client";

import type {
  AskPriorTurn,
  AskRequest,
  AskResponse,
  AskStatementGrounding,
  ChatStreamEvent,
  Selection,
} from "@3f/contract";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/src/lib/api";
import { selectionsEqual } from "../exploration/selection-identity.helper";

export interface AskTurn {
  id: string;
  origin: "ungrounded" | "grounded";
  question: string;
  response?: AskResponse;
  isPending?: boolean;
  error?: string;
}

interface AskContextValue {
  turns: AskTurn[];
  phases: Array<Extract<ChatStreamEvent, { type: "phase" }>["phase"]>;
  isPending: boolean;
  error: string | null;
  scrollTargetId: string | null;
  clearScrollTarget: () => void;
  ask: (question: string) => Promise<void>;
  askGrounded: (question: string, grounding: AskStatementGrounding) => Promise<void>;
  syncStatementIdentity: (identity: string | undefined) => void;
  rerun: (question: string, selection: Selection, origin?: AskRequest["origin"]) => Promise<boolean>;
  continueTurn: (
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: ContinueTurnFailurePolicy,
    requestOrigin?: AskRequest["origin"],
  ) => Promise<boolean>;
}

type ContinueTurnFailurePolicy = "retain" | "clear-on-refusal";

const AskContext = createContext<AskContextValue | null>(null);

export function AskProvider({ children, pathname = "/ask" }: Readonly<{ children: ReactNode; pathname?: string }>) {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [phases, setPhases] = useState<AskContextValue["phases"]>([]);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingPhasesRef = useRef<AskContextValue["phases"]>([]);
  const phasesVisibleRef = useRef(false);
  const nextTurnIdRef = useRef(0);
  const requestIdRef = useRef(0);
  const pendingOriginRef = useRef<AskTurn["origin"] | undefined>(undefined);
  const statementIdentityRef = useRef<string | undefined>(undefined);
  const clearScrollTarget = useCallback(() => setScrollTargetId(null), []);

  useEffect(() => {
    if (pathname !== "/ask" && pathname !== "/mis-reports") abortRef.current?.abort();
  }, [pathname]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const clearProgress = useCallback(() => {
    if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    phaseTimerRef.current = undefined;
    pendingPhasesRef.current = [];
    phasesVisibleRef.current = false;
    setPhases([]);
  }, []);

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

  async function run(
    request: Pick<Parameters<typeof api.ask>[0], "question" | "selection" | "statementGrounding" | "origin">,
    origin: AskTurn["origin"],
    reopen = false,
  ): Promise<boolean> {
    const trimmed = request.question.trim();
    if (!trimmed || isPending) return false;

    const priorTurns: AskPriorTurn[] = turns.flatMap((turn) =>
      turn.origin === "ungrounded" && turn.response?.responseClass === "success" && turn.response.selection
        ? [{ question: turn.question, selection: turn.response.selection }]
        : [],
    );
    const turnId = reopen ? `ask-turn-${++nextTurnIdRef.current}` : undefined;
    setIsPending(true);
    setError(null);
    clearProgress();
    if (turnId) {
      setTurns((current) => [...current, { id: turnId, origin, question: trimmed, isPending: true }]);
      setScrollTargetId(turnId);
    }
    const controller = (abortRef.current = new AbortController());
    const requestId = ++requestIdRef.current;
    pendingOriginRef.current = origin;
    try {
      const response = request.selection
        ? await api.ask(
            {
              question: trimmed,
              selection: request.selection,
              ...(request.origin ? { origin: request.origin } : {}),
            },
            { signal: controller.signal },
          )
        : await api.ask(
            {
              question: trimmed,
              ...(request.statementGrounding ? { statementGrounding: request.statementGrounding } : {}),
              ...(priorTurns.length && origin === "ungrounded" ? { priorTurns } : {}),
            },
            { signal: controller.signal, onPhase: receivePhase },
          );
      if (requestId !== requestIdRef.current) return true;
      clearProgress();
      setTurns((current) =>
        turnId
          ? current.map((turn) => (turn.id === turnId ? { id: turnId, origin, question: trimmed, response } : turn))
          : [...current, { id: `ask-turn-${++nextTurnIdRef.current}`, origin, question: trimmed, response }],
      );
    } catch (caught) {
      if (requestId !== requestIdRef.current) return true;
      clearProgress();
      if (turnId) {
        setTurns((current) =>
          isAbort(caught)
            ? current.filter((turn) => turn.id !== turnId)
            : current.map((turn) =>
                turn.id === turnId
                  ? { ...turn, isPending: false, error: "This report could not be reopened. Try again." }
                  : turn,
              ),
        );
      } else if (!isAbort(caught)) {
        setError("The question could not be sent. Try again.");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        abortRef.current = undefined;
        pendingOriginRef.current = undefined;
        setIsPending(false);
      }
    }
    return true;
  }

  async function continueTurn(
    turnId: string,
    question: string,
    selection: Selection,
    failurePolicy: ContinueTurnFailurePolicy,
    requestOrigin?: AskRequest["origin"],
  ): Promise<boolean> {
    if (!question.trim() || isPending || !turns.some((turn) => turn.id === turnId)) return false;

    setIsPending(true);
    setError(null);
    setTurns((current) =>
      current.map((turn) => (turn.id === turnId ? { ...turn, isPending: true, error: undefined } : turn)),
    );
    const controller = (abortRef.current = new AbortController());
    const requestId = ++requestIdRef.current;
    pendingOriginRef.current = "ungrounded";
    try {
      const response = await api.ask(
        { question, selection, ...(requestOrigin ? { origin: requestOrigin } : {}) },
        { signal: controller.signal },
      );
      if (requestId !== requestIdRef.current) return true;
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId && turn.response
            ? resolveContinueResponse({ ...turn, response: turn.response }, response, failurePolicy)
            : turn,
        ),
      );
    } catch (caught) {
      if (requestId !== requestIdRef.current) return true;
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId && turn.response
            ? resolveContinueError({ ...turn, response: turn.response }, caught, failurePolicy)
            : turn,
        ),
      );
    } finally {
      if (requestId === requestIdRef.current) {
        abortRef.current = undefined;
        pendingOriginRef.current = undefined;
        setIsPending(false);
      }
    }
    return true;
  }

  const clearGroundedTurns = useCallback(() => {
    setTurns((current) => current.filter((turn) => turn.origin === "ungrounded"));
    if (pendingOriginRef.current !== "grounded") return;
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = undefined;
    pendingOriginRef.current = undefined;
    clearProgress();
    setIsPending(false);
  }, [clearProgress]);

  const syncStatementIdentity = useCallback(
    (identity: string | undefined) => {
      if (!identity) {
        clearGroundedTurns();
        return;
      }
      if (identity === statementIdentityRef.current) return;
      const replacesStatement = statementIdentityRef.current !== undefined;
      statementIdentityRef.current = identity;
      if (replacesStatement) clearGroundedTurns();
    },
    [clearGroundedTurns],
  );

  return createElement(
    AskContext.Provider,
    {
      value: {
        turns,
        phases,
        isPending,
        error,
        scrollTargetId,
        clearScrollTarget,
        syncStatementIdentity,
        ask: async (question) => {
          await run({ question }, "ungrounded");
        },
        askGrounded: async (question, statementGrounding) => {
          await run({ question, statementGrounding }, "grounded");
        },
        rerun: (question, selection, requestOrigin) => {
          if (!question.trim() || isPending) return Promise.resolve(false);
          const match = [...turns]
            .reverse()
            .find(
              (turn) =>
                turn.response?.responseClass === "success" &&
                turn.response.selection &&
                selectionsEqual(turn.response.selection, selection),
            );
          if (!match) return run({ question, selection, origin: requestOrigin }, "ungrounded", true);
          setScrollTargetId(match.id);
          return continueTurn(match.id, match.question, selection, "clear-on-refusal", requestOrigin);
        },
        continueTurn,
      },
    },
    children,
  );
}

function resolveContinueResponse(
  turn: AskTurn & { response: AskResponse },
  response: AskResponse,
  failurePolicy: ContinueTurnFailurePolicy,
): AskTurn {
  if (response.responseClass === "success")
    return { id: turn.id, origin: turn.origin, question: turn.question, response };
  if (
    response.responseClass === "clarification_needed" &&
    (response.plantChoice !== undefined || response.periodChoice !== undefined)
  ) {
    return { id: turn.id, origin: turn.origin, question: turn.question, response };
  }
  if (
    response.responseClass === "blocked_by_policy" &&
    (failurePolicy === "clear-on-refusal" || response.refusal !== undefined)
  ) {
    return { id: turn.id, origin: turn.origin, question: turn.question, response };
  }
  return {
    ...turn,
    isPending: false,
    error:
      failurePolicy === "clear-on-refusal"
        ? (response.message ?? "This report could not be reopened. Try again.")
        : "That period could not be loaded. Choose a period to try again.",
  };
}

function resolveContinueError(
  turn: AskTurn & { response: AskResponse },
  error: unknown,
  failurePolicy: ContinueTurnFailurePolicy,
): AskTurn {
  if (failurePolicy === "clear-on-refusal" && isAccessRefusal(error)) {
    return {
      id: turn.id,
      origin: turn.origin,
      question: turn.question,
      response: {
        responseClass: "blocked_by_policy" as AskResponse["responseClass"],
        sessionId: turn.response.sessionId,
        message: "Sign in again to reopen this report.",
        viewInReport: { available: false, reason: "Sign in again to reopen this report." },
      },
    };
  }
  if (isAbort(error)) return { ...turn, isPending: false, error: undefined };
  return {
    ...turn,
    isPending: false,
    error:
      failurePolicy === "clear-on-refusal"
        ? "This report could not be reopened. Try again."
        : "The period could not be loaded. Try again.",
  };
}

function isAbort(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function isAccessRefusal(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "status" in error && (error.status === 401 || error.status === 403)
  );
}

export function useAsk(): AskContextValue {
  const value = useContext(AskContext);
  if (!value) throw new Error("useAsk must be used within AskProvider");
  return value;
}
