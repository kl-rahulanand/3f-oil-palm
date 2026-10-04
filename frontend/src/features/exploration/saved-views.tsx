"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAsk } from "@/src/features/assistant/use-ask";
import { selectionLabel } from "./selection-label";
import { useSavedViews } from "./use-exploration";

export function SavedViews() {
  const router = useRouter();
  const { isPending: isAskPending, rerun } = useAsk();
  const { items, isPending, loadError, deleteError, deletingId, remove } = useSavedViews();
  const [openErrorId, setOpenErrorId] = useState<string>();

  return (
    <section className="exploration-page" aria-labelledby="saved-views-heading">
      <header className="exploration-header">
        <p className="mis-eyebrow">Explore</p>
        <h1 id="saved-views-heading">Saved views</h1>
        <p>Selections you can reopen without rebuilding the filter row.</p>
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
            <p className="exploration-empty">Loading saved views…</p>
          ) : items.length === 0 ? (
            <p className="exploration-empty">Save a successful Ask answer to reopen it here.</p>
          ) : (
            <div className="exploration-list">
              {items.map((item) => {
                const label = selectionLabel(item.selection);
                return (
                  <article
                    className="exploration-row"
                    data-unavailable={!item.status.runnable || undefined}
                    key={item.id}
                  >
                    <div className="exploration-copy">
                      <h2>{label.title}</h2>
                      {label.summary && <p>{label.summary}</p>}
                      {!item.status.runnable && <p className="exploration-refusal">{item.status.message}</p>}
                      {openErrorId === item.id && (
                        <p className="exploration-refusal" role="alert">
                          Another question is still running. Try opening this view when it finishes.
                        </p>
                      )}
                    </div>
                    <div className="exploration-actions">
                      {item.status.runnable && (
                        <button
                          className="exploration-open"
                          type="button"
                          onClick={() => {
                            setOpenErrorId(undefined);
                            if (isAskPending) {
                              setOpenErrorId(item.id);
                              return;
                            }
                            router.push("/ask");
                            void rerun(label.title, item.selection, "saved-view");
                          }}
                        >
                          Open
                        </button>
                      )}
                      <button
                        className="exploration-delete"
                        type="button"
                        aria-busy={deletingId === item.id}
                        disabled={Boolean(deletingId)}
                        onClick={() => remove(item.id)}
                      >
                        {deletingId === item.id ? "Deleting…" : "Delete"}
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
