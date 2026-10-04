"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAsk } from "@/src/features/assistant/use-ask";
import { selectionLabel } from "./selection-label";
import { usePinnedReports } from "./use-exploration";

export function PinnedReports() {
  const router = useRouter();
  const { isPending: isAskPending, rerun } = useAsk();
  const { items, isPending, loadError, deleteError, deletingId, remove } = usePinnedReports();
  const pins = [...items].sort((left, right) => left.position - right.position);
  const [openErrorId, setOpenErrorId] = useState<string>();

  return (
    <section className="exploration-page" aria-labelledby="pinned-reports-heading">
      <header className="exploration-header">
        <p className="mis-eyebrow">Dashboard</p>
        <h1 id="pinned-reports-heading">Pinned reports</h1>
        <p>Open a pin to run its saved selection against the current governed data.</p>
      </header>
      {loadError ? (
        <p className="exploration-error" role="alert">
          {loadError}
        </p>
      ) : (
        <>
          {deleteError && (
            <p className="exploration-error" role="alert">
              {deleteError}
            </p>
          )}
          {isPending ? (
            <p className="exploration-empty">Loading pinned reports…</p>
          ) : pins.length === 0 ? (
            <p className="exploration-empty">Pin a successful Ask answer to keep it on this dashboard.</p>
          ) : (
            <div className="exploration-list">
              {pins.map((pin) => {
                const label = selectionLabel(pin.selection);
                return (
                  <article
                    className="exploration-row"
                    data-definition-changed={pin.definitionChanged || undefined}
                    data-unavailable={!pin.status.runnable || undefined}
                    key={pin.id}
                  >
                    <div className="exploration-copy">
                      <h2>{pin.title}</h2>
                      {label.summary && <p>{label.summary}</p>}
                      {pin.definitionChanged && <p className="exploration-changed">Definition changed</p>}
                      {!pin.status.runnable && <p className="exploration-refusal">{pin.status.message}</p>}
                      {openErrorId === pin.id && (
                        <p className="exploration-refusal" role="alert">
                          Another question is still running. Try opening this report when it finishes.
                        </p>
                      )}
                    </div>
                    <div className="exploration-actions">
                      {pin.status.runnable && (
                        <button
                          className="exploration-open"
                          type="button"
                          onClick={() => {
                            setOpenErrorId(undefined);
                            if (isAskPending) {
                              setOpenErrorId(pin.id);
                              return;
                            }
                            router.push("/ask");
                            void rerun(label.title, pin.selection, "pin");
                          }}
                        >
                          Open
                        </button>
                      )}
                      <button
                        className="exploration-delete"
                        type="button"
                        aria-busy={deletingId === pin.id}
                        disabled={Boolean(deletingId)}
                        onClick={() => remove(pin.id)}
                      >
                        {deletingId === pin.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
