"use client";

import {
  ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  ApiError,
  Diagnosis,
  EDITABLE_FIELDS,
  EditableField,
  FieldChangeCounts,
  FieldDiff,
  GetPatientResponse,
  Medication,
  Patient,
  PatientDocument,
  PatientState,
  PlanItem,
  PlanItemCategory,
  PLAN_ITEM_CATEGORIES,
  PublishEditsResponse,
  Visit,
  Vitals,
  getFieldChangeCounts,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Lab, mockLabs, mockVitalsSeries, VitalSeries } from "@/lib/mockClinical";
import RecordingView from "./RecordingView";
import Sparkline from "./Sparkline";
import { FieldHistoryPopup } from "./FieldHistoryPopup";
import TopBar from "@/components/TopBar";

type Props = { params: Promise<{ id: string }> };

// Vitals stays as raw JSON (5 flat string fields, structure rarely changes).
// Medications and active problems use per-item form modals where each row
// has labeled text inputs — schema-preserving, easy to edit one field at
// a time without rewriting the whole list.
type EditorSpec =
  | { kind: "vitals"; initialRaw: string }
  | { kind: "medications"; initial: Medication[] }
  | { kind: "problems"; initial: Diagnosis[] };

function structurallyEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function buildPublishPayload(
  draft: PatientState,
  current: PatientState
): Partial<Record<EditableField, unknown>> {
  const payload: Partial<Record<EditableField, unknown>> = {};
  for (const f of EDITABLE_FIELDS) {
    if (!structurallyEqual(draft[f], current[f])) payload[f] = draft[f];
  }
  return payload;
}

export default function PatientDetailPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const { doctor, isLoading: authLoading, setDoctor } = useAuth();
  const [data, setData] = useState<GetPatientResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [isStartingVisit, setIsStartingVisit] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [noteText, setNoteText] = useState<string | null>(null);
  const [noteSourceVisitId, setNoteSourceVisitId] = useState<string | null>(null);
  const [isDraftingNote, setIsDraftingNote] = useState(false);

  // Edit-mode state. draftState is a working copy of current_state. For the
  // three jsonb fields we keep the user's raw textarea text alongside the
  // parsed value so they can type temporarily-invalid JSON without losing it.
  const [isEditing, setIsEditing] = useState(false);
  const [draftState, setDraftState] = useState<PatientState | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);
  const [openEditor, setOpenEditor] = useState<EditorSpec | null>(null);

  // Per-editable-field counts of historical edits, used to badge the history
  // trigger buttons. Loaded once per patient view; refreshed after a publish.
  const [changeCounts, setChangeCounts] = useState<FieldChangeCounts | null>(
    null
  );
  const [historyField, setHistoryField] = useState<EditableField | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!doctor) router.replace("/login");
  }, [authLoading, doctor, router]);

  const loadPatient = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await api<GetPatientResponse>(`/api/patients/${id}`);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setDoctor(null);
        router.replace("/login");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load patient");
    } finally {
      setIsLoading(false);
    }
  }, [id, router, setDoctor]);

  // Refresh field-change counts. Called on patient load and after a publish
  // so the history badges stay in sync with the changelog.
  const loadChangeCounts = useCallback(async () => {
    try {
      const res = await getFieldChangeCounts(id);
      setChangeCounts(res.counts);
    } catch {
      // Counts are a UI nicety — don't surface errors to the user.
      setChangeCounts(null);
    }
  }, [id]);

  useEffect(() => {
    if (!doctor) return;
    loadPatient();
    loadChangeCounts();
  }, [doctor, loadPatient, loadChangeCounts]);

  const hasUnsavedChanges = useMemo(() => {
    if (!isEditing || !draftState || !data?.current_state) return false;
    const payload = buildPublishPayload(draftState, data.current_state);
    return Object.keys(payload).length > 0;
  }, [isEditing, draftState, data?.current_state]);

  function enterEditMode() {
    if (!data?.current_state) return;
    setDraftState({ ...data.current_state });
    setPublishError(null);
    setIsEditing(true);
  }

  function exitEditMode() {
    setIsEditing(false);
    setDraftState(null);
    setPublishError(null);
    setIsPublishing(false);
    setOpenEditor(null);
  }

  function updateDraftField<F extends EditableField>(
    field: F,
    value: PatientState[F]
  ) {
    setDraftState((d) => (d ? { ...d, [field]: value } : d));
  }

  // Publishes the draft. If `andThen` is provided, runs it after the
  // patient refetch — used by the modal's "Save & continue" path so the
  // pending navigation runs only after the save lands.
  async function publish(andThen?: () => void) {
    if (!draftState || !data?.current_state) return;
    const payload = buildPublishPayload(draftState, data.current_state);
    if (Object.keys(payload).length === 0) {
      // Nothing actually changed — just exit edit mode.
      exitEditMode();
      andThen?.();
      return;
    }
    setIsPublishing(true);
    setPublishError(null);
    try {
      await api<PublishEditsResponse>(`/api/patients/${id}/edits`, {
        method: "POST",
        body: JSON.stringify({ fields: payload }),
      });
      exitEditMode();
      await loadPatient();
      loadChangeCounts();
      andThen?.();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setDoctor(null);
        router.replace("/login");
        return;
      }
      setPublishError(
        err instanceof Error ? err.message : "Failed to publish changes"
      );
    } finally {
      setIsPublishing(false);
    }
  }

  // Wrap any in-app navigation/action that should be blocked while there
  // are unsaved edits. If clean, runs immediately; if dirty, stashes the
  // action and opens the unsaved-changes modal.
  function requestNavigation(action: () => void) {
    if (!hasUnsavedChanges) {
      action();
      return;
    }
    setPendingNav(() => action);
  }

  // Browser-level fallback for tab close / hard refresh / address-bar
  // navigation. The browser shows its own native confirmation — we cannot
  // render the custom modal at this point (browser security restriction).
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  async function startRecording() {
    setError(null);
    setIsStartingVisit(true);
    try {
      const { visit_id } = await api<{ visit_id: string }>(
        "/api/visits/start",
        {
          method: "POST",
          body: JSON.stringify({ patient_id: id }),
        }
      );
      setActiveVisitId(visit_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start visit");
    } finally {
      setIsStartingVisit(false);
    }
  }

  const latestVisit = data?.visits?.[0] ?? null;

  async function draftAdmissionNote() {
    if (!latestVisit) return;
    setError(null);
    setIsDraftingNote(true);
    try {
      const result = await api<{ note: string; error?: string }>(
        `/api/visits/${latestVisit.id}/note`,
        { method: "POST" }
      );
      if (result.error) {
        setError(result.error);
      } else {
        setNoteText(result.note);
        setNoteSourceVisitId(latestVisit.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to draft note");
    } finally {
      setIsDraftingNote(false);
    }
  }

  function handleLogout() {
    setDoctor(null);
    router.replace("/login");
  }

  if (authLoading || !doctor) return null;

  if (activeVisitId && data?.patient) {
    return (
      <RecordingView
        patient={data.patient}
        visitId={activeVisitId}
        onDone={() => {
          setActiveVisitId(null);
          loadPatient();
        }}
      />
    );
  }

  const backLink = (
    <Link
      href="/patients"
      onNavigate={(e) => {
        if (!hasUnsavedChanges) return;
        e.preventDefault();
        setPendingNav(() => () => router.push("/patients"));
      }}
      className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-70"
      style={{ color: "var(--accent)" }}
    >
      ← All patients
    </Link>
  );

  const actionButtons = (
    <>
      {!isEditing ? (
        <button
          onClick={enterEditMode}
          disabled={!data?.current_state}
          title={!data?.current_state ? "Patient state not loaded yet" : "Edit this patient's record"}
          className="rounded-lg border px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
          style={{ borderColor: "var(--border-strong)", color: "var(--text-1)" }}
        >
          Edit record
        </button>
      ) : (
        <>
          <button
            onClick={() => requestNavigation(exitEditMode)}
            disabled={isPublishing}
            className="rounded-lg border px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
            style={{ borderColor: "var(--border-strong)", color: "var(--text-1)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => publish()}
            disabled={isPublishing || !hasUnsavedChanges}
            title={!hasUnsavedChanges ? "No changes to publish" : "Publish changes to this record"}
            className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {isPublishing ? "Publishing…" : "Publish changes"}
          </button>
        </>
      )}
      <button
        onClick={draftAdmissionNote}
        disabled={isDraftingNote || !latestVisit}
        title={!latestVisit ? "Record an interaction first" : "Draft an admission note from the latest visit"}
        className="rounded-lg border px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
        style={{ borderColor: "var(--border-strong)", color: "var(--text-1)" }}
      >
        {isDraftingNote ? "Drafting…" : "Admission note"}
      </button>
      <button
        onClick={() => requestNavigation(() => setIsChatOpen((o) => !o))}
        disabled={!data?.patient}
        className="rounded-lg border px-3 py-1.5 text-[13px] font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
        style={{ borderColor: "var(--border-strong)", color: "var(--text-1)" }}
      >
        {isChatOpen ? "Close chat" : "Ask Clair"}
      </button>
      <button
        onClick={() => requestNavigation(startRecording)}
        disabled={isStartingVisit || !data?.patient}
        className="rounded-lg px-3 py-1.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {isStartingVisit ? "Starting…" : "Record interaction"}
      </button>
    </>
  );

  return (
    <>
      <div className="min-h-screen flex flex-col">
        <TopBar
          doctorName={doctor.name}
          onLogout={handleLogout}
          leftAction={backLink}
          rightActions={actionButtons}
        />
        <div
          className={`flex flex-col flex-1 transition-[margin-right] duration-200 ${
            isChatOpen ? "mr-[420px]" : ""
          }`}
        >
          {publishError && (
            <div
              className="mx-6 mt-3 inline-flex items-center gap-2 self-start rounded-md px-3 py-1.5 text-sm"
              style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />
              {publishError}
            </div>
          )}

          <main className="flex-1 px-6 py-5">
            {isLoading ? (
              <div className="text-center text-sm" style={{ color: "var(--text-1)" }}>Loading…</div>
            ) : error ? (
              <div
                className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
                style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
              >
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
                <span>{error}</span>
              </div>
            ) : data?.patient ? (
              <Bento
                data={data}
                onChange={loadPatient}
                isEditing={isEditing}
                draftState={draftState}
                onTextFieldChange={updateDraftField}
                onOpenEditor={setOpenEditor}
                changeCounts={changeCounts}
                onOpenHistory={setHistoryField}
              />
            ) : null}
          </main>
        </div>
      </div>

      <ChatSidebar
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        patientId={id}
        patientName={data?.patient?.name ?? ""}
      />

      {openEditor?.kind === "vitals" && draftState && (
        <VitalsEditModal
          initialRaw={openEditor.initialRaw}
          onSave={(parsed) => {
            updateDraftField("recent_vitals", parsed);
            setOpenEditor(null);
          }}
          onClose={() => setOpenEditor(null)}
        />
      )}

      {openEditor?.kind === "medications" && draftState && (
        <MedicationsEditModal
          initial={openEditor.initial}
          onSave={(list) => {
            updateDraftField("current_medications", list);
            setOpenEditor(null);
          }}
          onClose={() => setOpenEditor(null)}
        />
      )}

      {openEditor?.kind === "problems" && draftState && (
        <ProblemsEditModal
          initial={openEditor.initial}
          onSave={(list) => {
            updateDraftField("active_diagnoses", list);
            setOpenEditor(null);
          }}
          onClose={() => setOpenEditor(null)}
        />
      )}

      {pendingNav && (
        <UnsavedChangesModal
          isPublishing={isPublishing}
          onSaveAndContinue={() => {
            const action = pendingNav;
            setPendingNav(null);
            publish(action);
          }}
          onDiscardAndContinue={() => {
            const action = pendingNav;
            setPendingNav(null);
            exitEditMode();
            action();
          }}
          onStay={() => setPendingNav(null)}
        />
      )}

      {historyField && data?.patient && (
        <FieldHistoryPopup
          patientId={id}
          field={historyField}
          viewerSnapshotValue={
            data.viewer_snapshot?.snapshot?.[historyField] ?? null
          }
          currentValue={data.current_state?.[historyField] ?? null}
          onClose={() => setHistoryField(null)}
        />
      )}

      {noteText !== null && noteSourceVisitId && (
        <NoteModal
          note={noteText}
          doctorName={
            data?.visits?.find((v) => v.id === noteSourceVisitId)?.doctor_name ??
            ""
          }
          date={(() => {
            const v = data?.visits?.find((v) => v.id === noteSourceVisitId);
            return v
              ? new Date(v.started_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "";
          })()}
          onClose={() => {
            setNoteText(null);
            setNoteSourceVisitId(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat sidebar
// ---------------------------------------------------------------------------

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
};

function ChatSidebar({
  open,
  onClose,
  patientId,
  patientName,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ESC: cancel confirm dialog if open, otherwise close the sidebar
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showClearConfirm) {
        setShowClearConfirm(false);
      } else {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, showClearConfirm]);

  // Load saved history when opened (or patient changes)
  useEffect(() => {
    if (!open || !patientId) return;
    let cancelled = false;
    setError(null);
    setIsLoadingHistory(true);
    api<{ messages: ChatMessage[] }>(`/api/patients/${patientId}/chat`)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.messages || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load chat");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, patientId]);

  // Auto-scroll to bottom when messages or sending state change
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending]);

  // Focus input on open
  useEffect(() => {
    if (open && !isLoadingHistory) inputRef.current?.focus();
  }, [open, isLoadingHistory]);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;
    setError(null);
    setIsSending(true);
    setInput("");
    // Optimistic: render user turn immediately
    setMessages((m) => [...m, { role: "user", content: text }]);
    try {
      const res = await api<{ messages: ChatMessage[] }>(
        `/api/patients/${patientId}/chat`,
        {
          method: "POST",
          body: JSON.stringify({ message: text }),
        }
      );
      setMessages(res.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
      // Roll back optimistic add and restore the input so the user can retry
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function startNewChat() {
    if (isSending) return;
    if (messages.length === 0 && !input) return;
    if (messages.length === 0) {
      // Nothing persisted yet — just clear the draft, no confirm needed.
      setInput("");
      inputRef.current?.focus();
      return;
    }
    setShowClearConfirm(true);
  }

  async function confirmClearChat() {
    if (isClearing) return;
    setIsClearing(true);
    setError(null);
    try {
      await api(`/api/patients/${patientId}/chat`, { method: "DELETE" });
      setMessages([]);
      setInput("");
      setShowClearConfirm(false);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear chat");
    } finally {
      setIsClearing(false);
    }
  }

  return (
    <aside
      aria-hidden={!open}
      className={`fixed right-0 top-0 z-40 flex h-full w-full max-w-[420px] flex-col overflow-hidden shadow-xl transition-transform duration-200 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ background: "var(--surface)", borderLeft: "1px solid var(--border)" }}
    >
      <header
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-1)" }}>
            Ask Clair
          </div>
          <div className="truncate font-bold" style={{ color: "var(--text-1)" }}>
            {patientName || "Patient"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={startNewChat}
            disabled={isSending || (messages.length === 0 && !input)}
            aria-label="Start new chat"
            title="New chat"
            className="rounded-lg p-1.5 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: "var(--text-1)" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
            style={{ color: "var(--text-1)" }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M3 3l12 12M15 3L3 15" />
            </svg>
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {isLoadingHistory ? (
          <p className="mt-6 text-center text-sm" style={{ color: "var(--text-1)" }}>
            Loading conversation…
          </p>
        ) : messages.length === 0 ? (
          <div className="mt-10 flex flex-col items-center px-4 text-center">
            <p className="text-sm font-bold" style={{ color: "var(--text-1)" }}>Ask anything about this patient.</p>
            <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-1)" }}>
              Answers are grounded in the structured record, uploaded documents,
              and visit transcripts. Nothing is invented.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6"
                  style={
                    m.role === "user"
                      ? { background: "var(--accent)", color: "white", borderBottomRightRadius: "4px" }
                      : { background: "var(--bg)", color: "var(--text-1)", borderBottomLeftRadius: "4px", border: "1px solid var(--border)" }
                  }
                >
                  {m.content}
                </div>
              </li>
            ))}
            {isSending && (
              <li className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 text-sm italic" style={{ background: "var(--bg)", color: "var(--text-1)", borderBottomLeftRadius: "4px", border: "1px solid var(--border)" }}>
                  Thinking…
                </div>
              </li>
            )}
          </ul>
        )}
      </div>

      {error && (
        <p
          className="px-4 py-2 text-xs border-t flex items-center gap-1.5"
          style={{ background: "#FEF2F2", borderColor: "#FECACA", color: "#0F172A" }}
        >
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="flex items-end gap-2 p-3 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this patient…"
          rows={1}
          disabled={isSending}
          className="max-h-32 flex-1 resize-none rounded-lg px-3 py-2 text-sm leading-5 outline-none disabled:opacity-60"
          style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)", background: "var(--bg)" }}
        />
        <button
          type="submit"
          disabled={isSending || !input.trim()}
          className="shrink-0 rounded-lg px-3 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >
          Send
        </button>
      </form>

      {showClearConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-chat-title"
          className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/30 px-4 backdrop-blur-[2px]"
          onClick={() => {
            if (!isClearing) setShowClearConfirm(false);
          }}
        >
          <div
            className="w-full max-w-[320px] rounded-xl p-4"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              boxShadow: "0 8px 32px rgba(15,23,42,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="clear-chat-title" className="text-sm font-bold" style={{ color: "var(--text-1)" }}>
              Start a new chat?
            </h3>
            <p className="mt-1 text-xs leading-5" style={{ color: "var(--text-1)" }}>
              Your saved chat history for this patient will be deleted. This
              cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="rounded-lg px-3 py-1.5 text-sm font-bold transition-colors hover:bg-slate-100 disabled:opacity-50"
                style={{ color: "var(--text-1)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmClearChat}
                disabled={isClearing}
                autoFocus
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: "#DC2626" }}
              >
                {isClearing ? "Clearing…" : "Clear chat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Bento layout
// ---------------------------------------------------------------------------

type BentoEditProps = {
  isEditing: boolean;
  draftState: PatientState | null;
  onTextFieldChange: <F extends EditableField>(
    field: F,
    value: PatientState[F]
  ) => void;
  onOpenEditor: (spec: EditorSpec) => void;
  changeCounts: FieldChangeCounts | null;
  onOpenHistory: (field: EditableField) => void;
};

function Bento({
  data,
  onChange,
  isEditing,
  draftState,
  onTextFieldChange,
  onOpenEditor,
  changeCounts,
  onOpenHistory,
}: {
  data: GetPatientResponse;
  onChange: () => void;
} & BentoEditProps) {
  const { patient } = data;
  // When editing, the cards render from draftState so the user sees their
  // in-progress edits. When not editing, they render from current truth.
  const state = isEditing && draftState ? draftState : data.current_state;
  const vitalsSeries = useMemo(() => mockVitalsSeries(patient.id), [patient.id]);
  const labs = useMemo(() => mockLabs(patient.id), [patient.id]);

  // Build a history-trigger button for one editable field. Always rendered
  // (per the design), badge only when there's at least one prior edit.
  const history = (field: EditableField) => (
    <HistoryButton
      count={changeCounts?.[field] ?? 0}
      onClick={() => onOpenHistory(field)}
    />
  );

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Row 1: header (left) + what's-changed (right) — 50/50 */}
      <div className="lg:col-span-6">
        <PatientHeaderCard
          patient={patient}
          synopsis={state?.synopsis ?? ""}
          editing={isEditing}
          onSynopsisChange={(v) => onTextFieldChange("synopsis", v)}
          historyAction={history("synopsis")}
          watchFor={data.watch_for ?? []}
        />
      </div>
      <div className="lg:col-span-6">
        <ChangedCard
          narrative={data.narrative}
          fieldDiffs={data.field_diffs ?? []}
          isFirstView={data.is_first_view}
        />
      </div>

      {/* Row 2: active problems · medications · (subjective stacked over long-term goals) */}
      <div className="lg:col-span-4">
        <ProblemsCard
          diagnoses={state?.active_diagnoses ?? []}
          editing={isEditing}
          onOpenEditor={() =>
            onOpenEditor({
              kind: "problems",
              initial: state?.active_diagnoses ?? [],
            })
          }
          historyAction={history("active_diagnoses")}
        />
      </div>
      <div className="lg:col-span-4">
        <TextCard
          title="Subjective"
          content={state?.current_presentation ?? ""}
          emptyText="Nothing reported yet."
          editing={isEditing}
          onChange={(v) => onTextFieldChange("current_presentation", v)}
          headerAction={history("current_presentation")}
          highlightContent
        />
      </div>
      <div className="lg:col-span-4">
        <LongTermGoalCard
          patientId={patient.id}
          admittedAt={patient.admitted_at}
          content={state?.long_term_goals ?? ""}
          editing={isEditing}
          onChange={(v) => onTextFieldChange("long_term_goals", v)}
          headerAction={history("long_term_goals")}
        />
      </div>

      {/* Row 3: medications · vitals · labs · documents — 25/25/25/25 */}
      <div className="lg:col-span-3">
        <MedicationsCard
          medications={state?.current_medications ?? []}
          editing={isEditing}
          onOpenEditor={() =>
            onOpenEditor({
              kind: "medications",
              initial: state?.current_medications ?? [],
            })
          }
          historyAction={history("current_medications")}
        />
      </div>
      <div className="lg:col-span-3">
        <VitalsCard
          vitals={state?.recent_vitals ?? null}
          series={vitalsSeries}
          editing={isEditing}
          onOpenEditor={() => {
            const v = state?.recent_vitals ?? null;
            const synthesized: Vitals = {
              bp:
                v?.bp ||
                `${last(vitalsSeries.bp_sys)}/${last(vitalsSeries.bp_dia)}`,
              hr: v?.hr || String(last(vitalsSeries.hr)),
              temp_c: v?.temp_c || last(vitalsSeries.temp_c).toFixed(1),
              o2_sat: v?.o2_sat || String(last(vitalsSeries.o2_sat)),
              taken_at: v?.taken_at || new Date().toISOString(),
            };
            onOpenEditor({
              kind: "vitals",
              initialRaw: JSON.stringify(synthesized, null, 2),
            });
          }}
          historyAction={history("recent_vitals")}
        />
      </div>
      <div className="lg:col-span-3">
        <LabsCard labs={labs} />
      </div>
      <div className="lg:col-span-3">
        <DocumentsCard
          patientId={patient.id}
          documents={data.documents}
          onChange={onChange}
        />
      </div>

      {/* Row 4: visit history (full width) */}
      <div className="lg:col-span-12">
        <VisitHistoryCard visits={data.visits} />
      </div>

      {/* Row 5: plan & next steps (full width) */}
      <div className="lg:col-span-12">
        <PlanCard
          patientId={patient.id}
          items={data.plan_items}
          onChange={onChange}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

function BentoCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex h-full flex-col rounded-xl p-4 ${className}`}
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {children}
    </section>
  );
}

function CardHeader({
  title,
  action,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-2 flex items-center justify-between gap-2 ${className}`}>
      <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-1)", fontFamily: "PPNeueMontreal", fontWeight: 700 }}>
        {title}
      </h2>
      {action}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm italic" style={{ color: "var(--text-1)" }}>{children}</p>;
}

function EditFieldButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors hover:bg-slate-100"
      style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
    >
      Edit
    </button>
  );
}

// Small clock-icon button shown next to every editable field. Opens the
// per-field changelog popup. Badge shows how many prior edits exist (omitted
// when zero so the icon doesn't get visual noise for unchanged fields).
function HistoryButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  const title =
    count === 0
      ? "No prior edits. Click to view current vs. last visit"
      : count === 1
        ? "1 prior edit"
        : `${count} prior edits`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold transition-colors hover:bg-slate-100"
      style={{
        border: count > 0 ? "1px solid rgba(71,128,255,0.35)" : "1px solid var(--border-strong)",
        color: count > 0 ? "var(--accent)" : "var(--text-1)",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--text-1)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="6.4" />
        <path d="M8 4.5V8l2.4 1.6" />
      </svg>
      {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Patient header & What's changed
// ---------------------------------------------------------------------------

function PatientHeaderCard({
  patient,
  synopsis,
  editing,
  onSynopsisChange,
  historyAction,
  watchFor,
}: {
  patient: Patient;
  synopsis: string;
  editing: boolean;
  onSynopsisChange: (v: string | null) => void;
  historyAction?: ReactNode;
  watchFor?: string[];
}) {
  const meta: string[] = [];
  if (patient.dob) meta.push(`${calcAge(patient.dob)} years old`);
  if (patient.sex) meta.push(formatSex(patient.sex));
  if (patient.height_cm) meta.push(formatHeight(patient.height_cm));
  meta.push(`Admitted ${new Date(patient.admitted_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`);
  return (
    <section
      className="flex h-full flex-col rounded-xl p-6"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Identity + synopsis row */}
      <div className="flex items-center gap-5">
        {patient.photo_data ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={patient.photo_data}
            alt={patient.name}
            className="h-24 w-24 shrink-0 rounded-2xl object-cover"
            style={{ border: "1px solid var(--border)" }}
          />
        ) : (
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl text-2xl font-medium"
            style={{ background: "var(--accent-light)", color: "var(--text-1)" }}
          >
            {initials(patient.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1
            className="text-3xl font-medium tracking-tight capitalize leading-tight truncate"
            style={{ color: "var(--text-1)" }}
          >
            {patient.name}
          </h1>
          <p
            className="mt-1.5 text-sm"
            style={{ color: "var(--accent)" }}
          >
            {meta.join(" · ")}
          </p>

          {/* Synopsis lives here, anchored to the right column */}
          {editing ? (
            <div className="mt-3">
              <div
                className="mb-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Synopsis
              </div>
              <textarea
                value={synopsis}
                onChange={(e) => onSynopsisChange(e.target.value || null)}
                placeholder="Clinical one-liner"
                rows={3}
                className="w-full resize-y rounded-lg px-3 py-2 text-lg leading-7 outline-none"
                style={{
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-1)",
                  background: "var(--bg)",
                }}
              />
            </div>
          ) : synopsis ? (
            <div className="mt-3">
              <div
                className="mb-1 text-xs font-bold uppercase tracking-wider"
                style={{ color: "var(--text-1)", fontFamily: "PPNeueMontreal", fontWeight: 700 }}
              >
                Synopsis
              </div>
              <p
                className="text-xl leading-snug font-medium"
                style={{ color: "var(--text-1)" }}
              >
                {synopsis}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm italic" style={{ color: "var(--text-3)" }}>
              Synopsis will appear here after the first visit.
            </p>
          )}
        </div>
        {historyAction && <div className="self-start">{historyAction}</div>}
      </div>

      {/* Watch for — collapsible forward-looking risks */}
      <WatchForSection items={watchFor && watchFor.length > 0 ? watchFor : null} />
    </section>
  );
}

function WatchForSection({ items }: { items: string[] | null }) {
  const [open, setOpen] = useState(false);
  const hasItems = items !== null && items.length > 0;

  return (
    <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-2 text-left transition-colors hover:opacity-80"
      >
        <span
          className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "var(--accent)" }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path d="M3 1.5L7 5L3 8.5" />
          </svg>
          Watch for
          {hasItems && (
            <span
              className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums"
              style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
            >
              {items!.length}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="mt-2">
          {hasItems ? (
            <ul className="space-y-1.5">
              {items!.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[14px] leading-6"
                  style={{ color: "var(--text-1)" }}
                >
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "#EF4444" }}
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic" style={{ color: "var(--text-1)" }}>
              No risks flagged yet. The AI will surface forward-looking
              concerns here as the patient&rsquo;s condition evolves.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatSex(sex: string): string {
  const s = sex.trim().toUpperCase();
  if (s === "M") return "Male";
  if (s === "F") return "Female";
  if (s === "O") return "Other";
  return sex;
}

function ChangedCard({
  narrative,
  fieldDiffs,
  isFirstView,
}: {
  narrative: string | null;
  fieldDiffs: FieldDiff[];
  isFirstView?: boolean;
}) {
  const summary = (narrative ?? "").trim().replace(/ — /g, ", ").replace(/—/g, "");
  const totalChanges = fieldDiffs.reduce((acc, d) => acc + countChangesInDiff(d), 0);
  const [openField, setOpenField] = useState<string | null>(null);

  return (
    <section
      className="flex h-full flex-col rounded-xl p-5"
      style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: "#0F172A", fontFamily: "PPNeueMontreal", fontWeight: 700 }}
        >
          What&rsquo;s changed since you last saw this patient
        </h2>
        {totalChanges > 0 && (
          <span
            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-medium"
            style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid rgba(71,128,255,0.4)" }}
          >
            {totalChanges}
          </span>
        )}
      </div>

      {fieldDiffs.length === 0 ? (
        <p className="text-sm italic" style={{ color: "#92400E" }}>
          {isFirstView
            ? "First time viewing this patient. No prior baseline to compare against."
            : "Nothing new since your last visit."}
        </p>
      ) : (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          {summary && (
            <p className="text-sm leading-6" style={{ color: "#0F172A" }}>
              {summary}
            </p>
          )}
          <div className="flex flex-col gap-2">
            {fieldDiffs.map((diff) => (
              <FieldDiffAccordion
                key={diff.field}
                diff={diff}
                isOpen={openField === diff.field}
                onToggle={() =>
                  setOpenField((prev) => (prev === diff.field ? null : diff.field))
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function countChangesInDiff(d: FieldDiff): number {
  if (d.kind === "text") return 1;
  if (d.kind === "list") return d.added.length + d.removed.length + d.modified.length;
  if (d.kind === "vitals") return d.changes.length;
  return 0;
}

function FieldDiffAccordion({
  diff,
  isOpen,
  onToggle,
}: {
  diff: FieldDiff;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const count = countChangesInDiff(diff);
  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{ background: "rgba(255, 255, 255, 0.65)", border: "1px solid #FDE68A" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/60"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="text-[11px] uppercase tracking-wider leading-none"
            style={{ color: "#0F172A", fontFamily: "PPNeueMontreal", fontWeight: 600 }}
          >
            {diff.label}
          </span>
          <span
            className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none"
            style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid rgba(71,128,255,0.4)" }}
          >
            {count}
          </span>
        </div>
        <svg
          width="11"
          height="11"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          style={{
            transition: "transform 150ms ease",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <path
            d="M2 4l3 3 3-3"
            stroke="var(--accent)"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          className="flex flex-col gap-0.5 px-3 pb-3 font-mono text-[12.5px] leading-5"
          style={{ borderTop: "1px solid #FDE68A" }}
        >
          <div className="pt-3" />
          {diff.kind === "text" && (
            <>
              {diff.before.trim() && <DiffLine kind="removed">{diff.before}</DiffLine>}
              {diff.after.trim() && <DiffLine kind="added">{diff.after}</DiffLine>}
            </>
          )}
          {diff.kind === "list" && (
            <>
              {diff.removed.map((line, i) => (
                <DiffLine key={`r-${i}`} kind="removed">
                  {line}
                </DiffLine>
              ))}
              {diff.added.map((line, i) => (
                <DiffLine key={`a-${i}`} kind="added">
                  {line}
                </DiffLine>
              ))}
              {diff.modified.map((m, i) => (
                <div key={`m-${i}`} className="flex flex-col gap-0.5">
                  <DiffLine kind="removed">{m.before}</DiffLine>
                  <DiffLine kind="added">{m.after}</DiffLine>
                </div>
              ))}
            </>
          )}
          {diff.kind === "vitals" &&
            diff.changes.map((c, i) => (
              <div key={i} className="flex flex-col gap-0.5">
                {c.before && (
                  <DiffLine kind="removed">
                    {c.key} {c.before}
                  </DiffLine>
                )}
                {c.after && (
                  <DiffLine kind="added">
                    {c.key} {c.after}
                  </DiffLine>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function DiffLine({
  kind,
  children,
}: {
  kind: "added" | "removed";
  children: ReactNode;
}) {
  const isAdded = kind === "added";
  return (
    <div
      className="flex items-start gap-2 rounded px-2 py-0.5"
      style={{
        background: isAdded ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.10)",
        color: isAdded ? "#14532D" : "#7F1D1D",
      }}
    >
      <span aria-hidden="true" className="select-none font-bold" style={{ width: 12 }}>
        {isAdded ? "+" : "−"}
      </span>
      <span className="whitespace-pre-wrap break-words">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Problems / Medications
// ---------------------------------------------------------------------------

function ModalFrame({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      style={{ background: "rgba(15,23,42,0.4)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "0 20px 60px rgba(15,23,42,0.15)",
        }}
      >
        <div
          className="flex items-center justify-between gap-4 px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            id="editor-modal-title"
            className="text-base font-bold"
            style={{ color: "var(--text-1)" }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
            style={{ color: "var(--text-1)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
          {children}
        </div>
        <div
          className="flex items-center justify-end gap-2 px-5 py-3 border-t"
          style={{ borderColor: "var(--border)", background: "#f8fafc" }}
        >
          {footer}
        </div>
      </div>
    </div>
  );
}

function ModalFooterButtons({
  saveDisabled,
  saveTitle,
  onSave,
  onCancel,
}: {
  saveDisabled: boolean;
  saveTitle?: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-3.5 py-1.5 text-sm font-bold transition-colors hover:bg-slate-100"
        style={{ color: "var(--text-1)" }}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        title={saveTitle}
        className="rounded-lg px-3.5 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        Save
      </button>
    </>
  );
}

function VitalsEditModal({
  initialRaw,
  onSave,
  onClose,
}: {
  initialRaw: string;
  onSave: (parsed: Vitals | null) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState(initialRaw);
  const [error, setError] = useState<string | undefined>(undefined);
  const dirty = raw !== initialRaw;

  function handleChange(v: string) {
    setRaw(v);
    if (v.trim() === "") {
      setError("Cannot be empty");
      return;
    }
    try {
      JSON.parse(v);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  function handleSave() {
    if (error) return;
    try {
      const parsed = JSON.parse(raw) as Vitals | null;
      onSave(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    }
  }

  return (
    <ModalFrame
      title="Edit recent vitals"
      onClose={onClose}
      footer={
        <ModalFooterButtons
          saveDisabled={!!error || !dirty}
          saveTitle={
            error
              ? "Fix the JSON error first"
              : !dirty
                ? "No changes to save"
                : "Apply to draft (you still need to publish)"
          }
          onSave={handleSave}
          onCancel={onClose}
        />
      }
    >
      <p className="mb-2 text-xs" style={{ color: "var(--text-1)" }}>
        Edit the raw JSON. Changes only apply to your draft when you click
        Save. Cancel discards them.
      </p>
      <textarea
        value={raw}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        placeholder={
          initialRaw ||
          '{"bp": "...", "hr": "...", "temp_c": "...", "o2_sat": "...", "taken_at": "..."}'
        }
        autoFocus
        className="min-h-[280px] flex-1 resize-y rounded-lg px-2 py-1.5 font-mono text-xs leading-5 outline-none"
        style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)", background: "var(--bg)" }}
      />
      {error && (
        <p
          className="mt-1 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />
          JSON error: {error}
        </p>
      )}
    </ModalFrame>
  );
}

// Strips rows where every column is empty/whitespace — prevents the user
// from accidentally publishing an empty placeholder row they added but
// never filled in.
function nonEmptyRow<T extends Record<string, string>>(row: T): boolean {
  return Object.values(row).some((v) => v.trim() !== "");
}

function MedicationsEditModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Medication[];
  onSave: (list: Medication[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Medication[]>(
    initial.length > 0 ? initial : [{ name: "", dose: "", frequency: "" }]
  );
  const cleaned = list.filter(nonEmptyRow);
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(initial);

  function updateRow(i: number, patch: Partial<Medication>) {
    setList((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );
  }
  function removeRow(i: number) {
    setList((rows) => rows.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setList((rows) => [...rows, { name: "", dose: "", frequency: "" }]);
  }

  return (
    <ModalFrame
      title="Edit current medications"
      onClose={onClose}
      footer={
        <ModalFooterButtons
          saveDisabled={!dirty}
          saveTitle={
            !dirty
              ? "No changes to save"
              : "Apply to draft (you still need to publish)"
          }
          onSave={() => onSave(cleaned)}
          onCancel={onClose}
        />
      }
    >
      <p className="mb-3 text-xs text-[#0F172A]">
        Edit each medication&apos;s name, dose, and frequency. Empty rows are
        removed on save. Changes only apply to your draft when you click Save.
      </p>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-[#0F172A]">
          <span>Name</span>
          <span>Dose</span>
          <span>Frequency</span>
          <span className="sr-only">Remove</span>
        </div>
        {list.map((med, i) => (
          <div
            key={i}
            className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2"
          >
            <input
              value={med.name}
              onChange={(e) => updateRow(i, { name: e.target.value })}
              placeholder="Metformin"
              className="rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
            />
            <input
              value={med.dose}
              onChange={(e) => updateRow(i, { dose: e.target.value })}
              placeholder="500 mg"
              className="rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
            />
            <input
              value={med.frequency}
              onChange={(e) => updateRow(i, { frequency: e.target.value })}
              placeholder="Twice daily"
              className="rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label="Remove medication"
              className="rounded-md p-1.5 text-[#0F172A] transition hover:bg-zinc-100 hover:text-[#DC2626]"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="mt-1 self-start rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-slate-50" style={{ border: "1px dashed var(--border-strong)", color: "var(--text-1)" }}
        >
          + Add medication
        </button>
      </div>
    </ModalFrame>
  );
}

function ProblemsEditModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Diagnosis[];
  onSave: (list: Diagnosis[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Diagnosis[]>(
    initial.length > 0 ? initial : [{ condition: "", since: "", notes: "" }]
  );
  const cleaned = list.filter(nonEmptyRow);
  const dirty = JSON.stringify(cleaned) !== JSON.stringify(initial);

  function updateRow(i: number, patch: Partial<Diagnosis>) {
    setList((rows) =>
      rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    );
  }
  function removeRow(i: number) {
    setList((rows) => rows.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setList((rows) => [...rows, { condition: "", since: "", notes: "" }]);
  }

  return (
    <ModalFrame
      title="Edit active problems"
      onClose={onClose}
      footer={
        <ModalFooterButtons
          saveDisabled={!dirty}
          saveTitle={
            !dirty
              ? "No changes to save"
              : "Apply to draft (you still need to publish)"
          }
          onSave={() => onSave(cleaned)}
          onCancel={onClose}
        />
      }
    >
      <p className="mb-3 text-xs text-[#0F172A]">
        Edit each problem&apos;s condition, onset, and notes. Empty rows are
        removed on save. Changes only apply to your draft when you click Save.
      </p>
      <div className="flex flex-col gap-3">
        {list.map((dx, i) => (
          <div key={i} className="rounded-lg p-3" style={{ border: "1px solid var(--border)" }}>
            <div className="grid grid-cols-[1.4fr_1fr_auto] items-center gap-2">
              <input
                value={dx.condition}
                onChange={(e) => updateRow(i, { condition: e.target.value })}
                placeholder="Condition"
                className="rounded-lg px-2 py-1.5 text-sm font-bold outline-none" style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
              />
              <input
                value={dx.since}
                onChange={(e) => updateRow(i, { since: e.target.value })}
                placeholder="Since (e.g. 2018)"
                className="rounded-lg px-2 py-1.5 text-sm outline-none" style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
              />
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Remove problem"
                className="rounded-md p-1.5 text-[#0F172A] transition hover:bg-zinc-100 hover:text-[#DC2626]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>
            <textarea
              value={dx.notes}
              onChange={(e) => updateRow(i, { notes: e.target.value })}
              placeholder="Notes"
              rows={2}
              className="mt-2 w-full resize-y rounded-lg px-2 py-1.5 text-sm leading-6 outline-none" style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={addRow}
          className="mt-1 self-start rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-slate-50" style={{ border: "1px dashed var(--border-strong)", color: "var(--text-1)" }}
        >
          + Add problem
        </button>
      </div>
    </ModalFrame>
  );
}

function ProblemsCard({
  diagnoses,
  editing,
  onOpenEditor,
  historyAction,
}: {
  diagnoses: Diagnosis[];
  editing: boolean;
  onOpenEditor: () => void;
  historyAction?: ReactNode;
}) {
  return (
    <BentoCard>
      <CardHeader
        title="Active problems"
        action={
          <span className="flex items-center gap-1.5">
            {historyAction}
            {editing && <EditFieldButton onClick={onOpenEditor} />}
          </span>
        }
      />
      {diagnoses.length === 0 ? (
        <Empty>No active problems.</Empty>
      ) : (
        <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
          {diagnoses.map((d, i) => (
            <li key={i} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold" style={{ color: "var(--text-1)" }}>{d.condition}</span>
                {d.since && (
                  <span className="shrink-0 text-xs" style={{ color: "var(--accent)" }}>
                    since {d.since}
                  </span>
                )}
              </div>
              {d.notes && (
                <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-2)" }}>
                  {d.notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

function MedicationsCard({
  medications,
  editing,
  onOpenEditor,
  historyAction,
}: {
  medications: Medication[];
  editing: boolean;
  onOpenEditor: () => void;
  historyAction?: ReactNode;
}) {
  return (
    <BentoCard>
      <CardHeader
        title="Current medications"
        action={
          <span className="flex items-center gap-1.5">
            {historyAction}
            {editing && <EditFieldButton onClick={onOpenEditor} />}
          </span>
        }
      />
      {medications.length === 0 ? (
        <Empty>No medications recorded.</Empty>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {medications.map((m, i) => (
            <li key={i} className="py-2.5 first:pt-0 last:pb-0">
              <div className="text-sm font-bold leading-tight" style={{ color: "var(--text-1)" }}>
                {m.name}
              </div>
              {(m.dose || m.frequency) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-5">
                  {m.dose && <span className="tracking-tight font-medium" style={{ color: "var(--accent)" }}>{m.dose}</span>}
                  {m.dose && m.frequency && (
                    <span style={{ color: "var(--text-3)" }}>·</span>
                  )}
                  {m.frequency && <span style={{ color: "var(--text-1)" }}>{m.frequency}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

// ---------------------------------------------------------------------------
// Generic text card
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "the","a","an","and","or","but","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","could","should","may",
  "might","must","shall","can","to","of","in","on","at","by","for","with",
  "from","as","this","that","these","those","it","its","he","she","they",
  "we","i","you","her","his","our","their","my","your","not","no","nor",
  "so","yet","both","either","neither","each","few","more","most","other",
  "some","such","than","then","too","very","just","now","new","also","about",
  "adult","male","female","patient","reported","noted","denies","reports",
]);

function highlightClinical(text: string): ReactNode {
  const clauses = text.split(/(?<=[.;!?\n])\s*/);
  const out: ReactNode[] = [];

  clauses.forEach((clause, ci) => {
    if (!clause.trim()) return;
    const wordRegex = /[\w/'-]+/g;
    const words: { word: string; start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(clause)) !== null)
      words.push({ word: m[0], start: m.index, end: m.index + m[0].length });

    const topStarts = new Set(
      words
        .filter(w => !STOPWORDS.has(w.word.toLowerCase()) && w.word.length >= 5)
        .map(w => ({ ...w, score: w.word.length + (w.word.includes("/") ? 3 : 0) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 1)
        .map(w => w.start)
    );

    let pos = 0;
    const parts: ReactNode[] = [];
    words.forEach(({ word, start, end }) => {
      if (start > pos) parts.push(clause.slice(pos, start));
      if (topStarts.has(start)) {
        parts.push(
          <span
            key={start}
            style={{
              textDecoration: "underline",
              textDecorationColor: "var(--accent)",
              textDecorationThickness: 2,
              textUnderlineOffset: 3,
            }}
          >
            {word}
          </span>
        );
      } else {
        parts.push(word);
      }
      pos = end;
    });
    if (pos < clause.length) parts.push(clause.slice(pos));
    out.push(<span key={ci}>{parts}</span>);
    if (ci < clauses.length - 1) out.push(" ");
  });

  return <>{out}</>;
}

function TextCard({
  title,
  content,
  emptyText,
  editing,
  onChange,
  headerAction,
  highlightContent,
}: {
  title: ReactNode;
  content: string;
  emptyText: string;
  editing: boolean;
  onChange: (v: string | null) => void;
  headerAction?: ReactNode;
  highlightContent?: boolean;
}) {
  return (
    <BentoCard>
      <CardHeader title={title} action={headerAction} />
      {editing ? (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={emptyText}
          className="min-h-[120px] flex-1 resize-y rounded-lg px-2 py-1.5 text-sm leading-6 outline-none"
          style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)", background: "var(--bg)" }}
        />
      ) : content ? (
        <p className="whitespace-pre-wrap text-sm leading-6" style={{ color: "var(--text-1)" }}>
          {highlightContent ? highlightClinical(content) : content}
        </p>
      ) : (
        <Empty>{emptyText}</Empty>
      )}
    </BentoCard>
  );
}

// ---------------------------------------------------------------------------
// Long-term goal journey card
// ---------------------------------------------------------------------------

const TRACK_H = 360; // px — fixed height of the expanded timeline container

function LongTermGoalCard({
  patientId,
  admittedAt,
  content,
  editing,
  onChange,
  headerAction,
}: {
  patientId: string;
  admittedAt: string;
  content: string;
  editing: boolean;
  onChange: (v: string | null) => void;
  headerAction?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  // Deterministic mock progress (30–76%) seeded by patient ID so it's stable
  const progress = useMemo(() => {
    let h = 0;
    for (const ch of patientId) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
    return 30 + (h % 47);
  }, [patientId]);

  // Count-up animation for the % display inside the expanded timeline
  const [liveProgress, setLiveProgress] = useState(0);
  useEffect(() => {
    if (!expanded) { setLiveProgress(0); return; }
    const t0 = performance.now();
    const dur = 1100;
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / dur, 1);
      const ease = 1 - (1 - t) ** 3;
      setLiveProgress(Math.round(ease * progress));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [expanded, progress]);

  const admitDate = new Date(admittedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  // Track geometry (pixels)
  const PAD = 14; // top + bottom padding inside TRACK_H for dots
  const trackLen = TRACK_H - PAD * 2;
  // How far the filled line extends from the bottom node upward
  const fillH = trackLen * (progress / 100);
  // Y-coordinate from top of container for the "current" dot center
  const dotTopFromTop = PAD + trackLen * (1 - progress / 100);
  // Keep the % label below the goal text block (which can be 2–5 lines at maxWidth 160)
  const percentLabelTop = Math.max(dotTopFromTop - 14, 160);

  if (editing) {
    return (
      <BentoCard>
        <CardHeader title="Long-term goals" action={headerAction} />
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="No long-term goals set."
          className="min-h-[120px] flex-1 resize-y rounded-lg px-2 py-1.5 text-sm leading-6 outline-none"
          style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)", background: "var(--bg)" }}
        />
      </BentoCard>
    );
  }

  return (
    <BentoCard>
      <CardHeader title="Long-term goals" action={headerAction} />

      {!content ? (
        <Empty>No long-term goals set.</Empty>
      ) : (
        <div className="flex flex-col flex-1">
          {/* Goal text */}
          <p className="text-sm leading-6 mb-4" style={{ color: "var(--text-1)" }}>
            {content}
          </p>

          {/* ── Clickable progress bar ── */}
          <button
            type="button"
            onClick={() => setExpanded((o) => !o)}
            className="w-full text-left"
            aria-expanded={expanded}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                {progress}% toward goal
              </span>
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ color: "var(--text-3)", fontSize: 11, display: "inline-block" }}
              >
                ▾
              </motion.span>
            </div>

            {/* Bar track */}
            <div
              className="h-2 w-full rounded-full overflow-hidden"
              style={{ background: "var(--accent-light)" }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: "var(--accent)" }}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-1)" }}>
              {expanded ? "Collapse journey" : "See the full journey →"}
            </p>
          </button>

          {/* ── Expanded vertical timeline ── */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                key="goal-timeline"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: "hidden" }}
              >
                <div
                  className="relative mt-6"
                  style={{ height: TRACK_H }}
                >
                  {/* ── Track line (unfilled, full height) ── */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: 7, top: PAD, width: 2,
                      height: trackLen,
                      background: "var(--accent-light)",
                    }}
                  />

                  {/* ── Track fill (grows upward from start node) ── */}
                  <div
                    className="absolute rounded-full overflow-hidden"
                    style={{
                      left: 7,
                      bottom: PAD,
                      width: 2,
                      height: fillH,
                    }}
                  >
                    <motion.div
                      style={{
                        width: "100%", height: "100%",
                        background: "var(--accent)",
                        transformOrigin: "bottom",
                      }}
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                    />
                  </div>

                  {/* ── Goal node (top) ── */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.1 }}
                    className="absolute rounded-full"
                    style={{
                      left: 2, top: PAD - 6,
                      width: 14, height: 14,
                      background: "var(--accent)",
                    }}
                  />

                  {/* ── Current-position pulsing dot ── */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.55 }}
                    className="absolute rounded-full"
                    style={{
                      left: 0, top: dotTopFromTop - 9,
                      width: 18, height: 18,
                      background: "var(--accent)",
                      border: "3px solid white",
                    }}
                  >
                    {/* Ring pulse */}
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      animate={{
                        boxShadow: [
                          "0 0 0 0px rgba(71,128,255,0.45)",
                          "0 0 0 10px rgba(71,128,255,0)",
                          "0 0 0 0px rgba(71,128,255,0)",
                        ],
                      }}
                      transition={{ duration: 2.2, repeat: Infinity, delay: 0.9 }}
                    />
                  </motion.div>

                  {/* ── Start node (bottom) ── */}
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.2 }}
                    className="absolute rounded-full"
                    style={{
                      left: 2, bottom: PAD - 6,
                      width: 14, height: 14,
                      background: "#fff",
                      border: "2px solid var(--border-strong)",
                    }}
                  />

                  {/* ── Label: Goal (top-right) ── */}
                  <motion.div
                    initial={{ x: 10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute"
                    style={{ left: 28, top: 0 }}
                  >
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
                      style={{ color: "var(--accent)" }}
                    >
                      Goal
                    </div>
                    <p
                      className="text-sm font-medium leading-snug"
                      style={{ color: "var(--text-1)", maxWidth: 160 }}
                    >
                      {content}
                    </p>
                  </motion.div>

                  {/* ── Label: Current % (beside pulsing dot) ── */}
                  <motion.div
                    initial={{ x: 10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.6, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute flex items-baseline gap-1"
                    style={{ left: 28, top: percentLabelTop }}
                  >
                    <span
                      className="text-2xl font-bold tabular-nums leading-none"
                      style={{ color: "var(--accent)" }}
                    >
                      {liveProgress}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>%</span>
                  </motion.div>

                  {/* ── Label: Start (bottom-right) ── */}
                  <motion.div
                    initial={{ x: 10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute"
                    style={{ left: 28, bottom: 0 }}
                  >
                    <div
                      className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
                      style={{ color: "var(--text-3)" }}
                    >
                      Start · {admitDate}
                    </div>
                    <p className="text-sm leading-snug" style={{ color: "var(--text-2)" }}>
                      Baseline assessment on admission
                    </p>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </BentoCard>
  );
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

function VitalsCard({
  vitals,
  series,
  editing,
  onOpenEditor,
  historyAction,
}: {
  vitals: Vitals | null;
  series: VitalSeries;
  editing: boolean;
  onOpenEditor: () => void;
  historyAction?: ReactNode;
}) {
  const cards: { label: string; value: string; values: number[]; color: string }[] = [
    {
      label: "BP",
      value: vitals?.bp || `${last(series.bp_sys)}/${last(series.bp_dia)}`,
      values: series.bp_sys.map((s, i) => s - series.bp_dia[i]),
      color: "text-[#EF4444]",
    },
    {
      label: "HR",
      value: vitals?.hr || String(last(series.hr)),
      values: series.hr,
      color: "text-[#3B82F6]",
    },
    {
      label: "Temp",
      value: vitals?.temp_c
        ? `${vitals.temp_c}°C`
        : `${last(series.temp_c).toFixed(1)}°`,
      values: series.temp_c,
      color: "text-[#F59E0B]",
    },
    {
      label: "O₂",
      value: vitals?.o2_sat ? `${vitals.o2_sat}%` : `${last(series.o2_sat)}%`,
      values: series.o2_sat,
      color: "text-[#10B981]",
    },
  ];
  return (
    <BentoCard>
      <CardHeader
        title="Vitals · last 7 days"
        action={
          <span className="flex items-center gap-1.5">
            {historyAction}
            {editing && <EditFieldButton onClick={onOpenEditor} />}
          </span>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
        {cards.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
            style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          >
            <div className="min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-wider ${c.color}`}>
                {c.label}
              </div>
              <div className="text-lg font-bold leading-tight tracking-tight" style={{ color: "var(--text-1)" }}>
                {c.value}
              </div>
            </div>
            <Sparkline values={c.values} width={70} height={22} className={c.color} />
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

function last<T>(arr: T[]): T {
  return arr[arr.length - 1];
}

// ---------------------------------------------------------------------------
// Labs
// ---------------------------------------------------------------------------

function LabsCard({ labs }: { labs: Lab[] }) {
  const abnormalCount = labs.filter((l) => l.abnormal).length;
  return (
    <BentoCard>
      <CardHeader
        title="Labs"
        action={
          abnormalCount > 0 ? (
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--accent)" }}
            >
              {abnormalCount} abnormal
            </span>
          ) : undefined
        }
      />
      <ul className="min-h-0 flex-1 divide-y overflow-hidden text-sm" style={{ borderColor: "var(--border)" }}>
        {labs.map((l) => (
          <li
            key={l.name}
            className="flex items-center justify-between gap-2 py-1.5"
          >
            <span className="w-24 shrink-0" style={{ color: "var(--text-1)" }}>{l.name}</span>
            <span
              className="flex-1 truncate text-right tabular-nums font-bold inline-flex items-center justify-end gap-1.5"
              style={{ color: l.abnormal ? "#EF4444" : "var(--text-1)" }}
            >
              {l.abnormal && (
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#EF4444" }} />
              )}
              {l.value} {l.unit}
            </span>
            <span className="hidden w-16 shrink-0 text-right text-xs sm:block" style={{ color: "var(--accent)" }}>
              {l.range}
            </span>
            <Sparkline
              values={l.trend}
              width={48}
              height={18}
              className={l.abnormal ? "text-[#EF4444]" : "text-[#94A3B8]"}
            />
          </li>
        ))}
      </ul>
    </BentoCard>
  );
}

// ---------------------------------------------------------------------------
// Visit history
// ---------------------------------------------------------------------------

const TIMELINE_SLOTS = 10;

function VisitHistoryCard({ visits }: { visits: Visit[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => [...visits].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()),
    [visits]
  );

  const slots = Math.max(sorted.length, TIMELINE_SLOTS);
  const selectedVisit = visits.find((v) => v.id === selectedId) ?? null;

  return (
    <BentoCard>
      <CardHeader title="Visit history" />

      {visits.length === 0 ? (
        <Empty>No prior visits recorded.</Empty>
      ) : (
        <>
          {/* ── Horizontal timeline ── */}
          <div className="relative mt-1 mb-2" style={{ height: 52, overflow: "visible" }}>
            {/* Track */}
            <div
              className="absolute rounded-full"
              style={{
                top: 18, left: 0, right: 0,
                height: 2,
                background: "var(--accent-light)",
              }}
            />

            {/* Slots */}
            {Array.from({ length: slots }).map((_, i) => {
              const visit = sorted[i] ?? null;
              const frac = slots === 1 ? 0.5 : i / (slots - 1);
              const isSelected = visit ? visit.id === selectedId : false;
              const isHovered = hoveredIdx === i;

              // Tooltip horizontal anchor: flip near edges to stay in bounds
              const tooltipStyle: React.CSSProperties =
                frac < 0.15
                  ? { left: 0 }
                  : frac > 0.85
                  ? { right: 0 }
                  : { left: "50%", transform: "translateX(-50%)" };

              return (
                <div
                  key={i}
                  className="absolute"
                  style={{ left: `${frac * 100}%`, top: 0, transform: "translateX(-50%)", zIndex: isHovered ? 20 : isSelected ? 10 : 1 }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <button
                    type="button"
                    onClick={() => visit && setSelectedId(visit.id === selectedId ? null : visit.id)}
                    className="rounded-full transition-all duration-150 block"
                    style={{
                      marginTop: visit ? (isSelected ? 11 : 13) : 13,
                      width: visit ? (isSelected ? 14 : 10) : 10,
                      height: visit ? (isSelected ? 14 : 10) : 10,
                      background: visit ? "var(--accent)" : "var(--border-strong)",
                      boxShadow: isSelected ? "0 0 0 3px var(--accent-light), 0 0 0 5px var(--accent)" : "none",
                      cursor: visit ? "pointer" : "default",
                    }}
                  />

                  {/* Hover tooltip */}
                  {isHovered && (
                    <div
                      className="absolute rounded-lg px-2.5 py-1.5 shadow-md whitespace-nowrap"
                      style={{
                        top: 40,
                        ...tooltipStyle,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        pointerEvents: "none",
                      }}
                    >
                      {visit ? (
                        <>
                          <div className="text-xs font-bold" style={{ color: "var(--text-1)" }}>
                            {visit.doctor_name}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                            {new Date(visit.started_at).toLocaleDateString(undefined, {
                              month: "short", day: "numeric", year: "numeric",
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs italic" style={{ color: "var(--text-3)" }}>
                          No appointment
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Selected visit popup ── */}
          <AnimatePresence>
            {selectedVisit && (
              <motion.div
                key={selectedVisit.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="mb-3 rounded-xl p-4"
                style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-bold truncate" style={{ color: "var(--text-1)" }}>
                      {selectedVisit.doctor_name}
                    </span>
                    {(selectedVisit.status === "active" || selectedVisit.status === "processing") && (
                      <span
                        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: "var(--accent-light)", color: "var(--accent)" }}
                      >
                        {selectedVisit.status}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs" style={{ color: "var(--text-3)" }}>
                    {new Date(selectedVisit.started_at).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                    })}
                  </span>
                </div>
                {selectedVisit.summary ? (
                  <p className="text-sm leading-snug" style={{ color: "var(--text-2)" }}>
                    {selectedVisit.summary}
                  </p>
                ) : (
                  <p className="text-xs italic" style={{ color: "var(--text-3)" }}>
                    {selectedVisit.transcript ? "No summary available for this visit." : "No transcript saved."}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Expand toggle ── */}
          <button
            type="button"
            onClick={() => setExpanded((o) => !o)}
            className="text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-60"
            style={{ color: "var(--accent)" }}
          >
            {expanded ? "Collapse history" : "Expand history"}
          </button>

          {/* ── Full list ── */}
          <AnimatePresence>
            {expanded && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: "hidden", borderColor: "var(--border)" }}
                className="mt-3 divide-y text-sm"
              >
                {visits.map((v) => (
                  <li key={v.id} className="py-3 first:pt-0 last:pb-0">
                    <VisitRowInline visit={v} />
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </BentoCard>
  );
}

function VisitRowInline({ visit }: { visit: Visit }) {
  const date = new Date(visit.started_at).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-bold" style={{ color: "var(--text-1)" }}>
            {visit.doctor_name}
          </span>
          {(visit.status === "active" || visit.status === "processing") && (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "var(--accent-light)", color: "var(--accent)" }}
            >
              {visit.status}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs" style={{ color: "var(--text-3)" }}>
          {date}
        </span>
      </div>
      {visit.summary ? (
        <p className="mt-1 text-sm leading-snug" style={{ color: "var(--text-2)" }}>
          {visit.summary}
        </p>
      ) : (
        <p className="mt-1 text-xs italic" style={{ color: "var(--text-3)" }}>
          {visit.transcript ? "No summary available for this visit." : "No transcript saved."}
        </p>
      )}
    </>
  );
}

function NoteModal({
  note,
  doctorName,
  date,
  onClose,
}: {
  note: string;
  doctorName: string;
  date: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(note);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      style={{ background: "rgba(15,23,42,0.4)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(15,23,42,0.15)" }}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--text-1)" }}>Draft note</h2>
            <p className="text-xs" style={{ color: "var(--text-1)" }}>{doctorName} · {date}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-lg px-3 py-1.5 text-xs font-bold transition-colors hover:bg-slate-100"
              style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 transition-colors hover:bg-slate-100"
              style={{ color: "var(--text-1)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-sm leading-6" style={{ color: "var(--text-1)" }}>
          {note}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unsaved-changes confirmation modal
// ---------------------------------------------------------------------------

function UnsavedChangesModal({
  isPublishing,
  onSaveAndContinue,
  onDiscardAndContinue,
  onStay,
}: {
  isPublishing: boolean;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onStay: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPublishing) onStay();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isPublishing, onStay]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(15,23,42,0.4)" }}
      onClick={() => { if (!isPublishing) onStay(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] rounded-2xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 20px 60px rgba(15,23,42,0.15)" }}
      >
        <h3 id="unsaved-title" className="text-base font-bold" style={{ color: "var(--text-1)" }}>
          You have unsaved changes
        </h3>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-1)" }}>
          You haven&apos;t published your edits to this patient&apos;s record.
          What would you like to do?
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onSaveAndContinue}
            disabled={isPublishing}
            autoFocus
            className="rounded-lg px-3 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {isPublishing ? "Publishing…" : "Save & continue"}
          </button>
          <button
            type="button"
            onClick={onDiscardAndContinue}
            disabled={isPublishing}
            className="rounded-lg px-3 py-2 text-sm font-bold transition-colors hover:bg-slate-50 disabled:opacity-50"
            style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
          >
            Discard & continue
          </button>
          <button
            type="button"
            onClick={onStay}
            disabled={isPublishing}
            className="rounded-lg px-3 py-2 text-sm font-bold transition-colors hover:bg-slate-100 disabled:opacity-50"
            style={{ color: "var(--text-1)" }}
          >
            Stay on page
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function DocumentsCard({
  patientId,
  documents,
  onChange,
}: {
  patientId: string;
  documents: PatientDocument[];
  onChange: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const file_data = await fileToBase64(file);
      await api(`/api/patients/${patientId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          file_data,
        }),
      });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleView(doc: PatientDocument) {
    try {
      const result = await api<{
        document: { file_data: string; mime_type: string | null; filename: string };
      }>(`/api/patients/${patientId}/documents/${doc.id}`);
      const blob = base64ToBlob(
        result.document.file_data,
        result.document.mime_type || "application/octet-stream"
      );
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open document");
    }
  }

  async function handleDelete(doc: PatientDocument) {
    if (!window.confirm(`Delete ${doc.filename}?`)) return;
    try {
      await api(`/api/patients/${patientId}/documents/${doc.id}`, {
        method: "DELETE",
      });
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <BentoCard>
      <CardHeader
        title="Past medical documents"
        action={
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="rounded-lg px-2.5 py-1 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-60"
            style={{ border: "1px solid rgba(71,128,255,0.35)", color: "var(--accent)" }}
          >
            {busy ? "Uploading…" : "+ Upload"}
          </button>
        }
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      {error && (
        <p
          className="mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />
          {error}
        </p>
      )}
      {documents.length === 0 ? (
        <Empty>No documents uploaded yet.</Empty>
      ) : (
        <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="group flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <DocIcon />
              <button
                type="button"
                onClick={() => handleView(doc)}
                className="min-w-0 flex-1 truncate text-left font-bold hover:underline"
                style={{ color: "var(--text-1)" }}
              >
                {doc.filename}
              </button>
              <span className="shrink-0 text-xs" style={{ color: "var(--text-1)" }}>
                {new Date(doc.uploaded_at).toLocaleDateString()}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(doc)}
                aria-label={`Delete ${doc.filename}`}
                className="shrink-0 opacity-0 transition group-hover:opacity-100 hover:text-[#DC2626]"
                style={{ color: "var(--text-1)" }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </BentoCard>
  );
}

function DocIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="shrink-0" style={{ color: "var(--text-1)" }}
    >
      <path d="M3 1.5h6.5L13 5v9.5H3z" />
      <path d="M9.5 1.5V5H13" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Plan & next steps
// ---------------------------------------------------------------------------

const PLAN_CATEGORY_STYLES: Record<
  PlanItemCategory,
  { bg: string; border: string; fg: string; dot: string }
> = {
  URGENT:       { bg: "#FEF2F2", border: "#FECACA", fg: "#991B1B", dot: "#EF4444" },
  "Follow-up":  { bg: "#FFFBEB", border: "#FDE68A", fg: "#92400E", dot: "#F59E0B" },
  "Tests/Labs": { bg: "#F5F3FF", border: "#DDD6FE", fg: "#5B21B6", dot: "#8B5CF6" },
  Medication:   { bg: "#EFF6FF", border: "#BFDBFE", fg: "#1E40AF", dot: "#3B82F6" },
  Monitoring:   { bg: "#F1F5F9", border: "#CBD5E1", fg: "#334155", dot: "#64748B" },
  Lifestyle:    { bg: "#ECFDF5", border: "#A7F3D0", fg: "#065F46", dot: "#10B981" },
};

function PlanCard({
  patientId,
  items,
  onChange,
}: {
  patientId: string;
  items: PlanItem[];
  onChange: () => void;
}) {
  const [draftCategory, setDraftCategory] = useState<PlanItemCategory>("Follow-up");
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingCategory, setEditingCategory] = useState<PlanItemCategory>("Follow-up");

  // Local mirror of plan items so toggle/edit/delete update instantly without
  // a full patient refetch (which would flash isLoading=true on the whole
  // page). Synced from props whenever the parent loads fresh data.
  const [localItems, setLocalItems] = useState<PlanItem[]>(items);
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const grouped = useMemo(() => {
    const map = new Map<PlanItemCategory, PlanItem[]>();
    for (const cat of PLAN_ITEM_CATEGORIES) map.set(cat, []);
    for (const it of localItems) map.get(it.category)?.push(it);
    for (const cat of PLAN_ITEM_CATEGORIES) {
      const list = map.get(cat)!;
      list.sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.created_at.localeCompare(b.created_at);
      });
    }
    return map;
  }, [localItems]);

  async function handleAdd() {
    const text = draftText.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ plan_item: PlanItem }>(
        `/api/patients/${patientId}/plan-items`,
        {
          method: "POST",
          body: JSON.stringify({ category: draftCategory, text }),
        }
      );
      setLocalItems((prev) => [...prev, result.plan_item]);
      setDraftText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleDone(item: PlanItem) {
    const next = !item.done;
    setLocalItems((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              done: next,
              done_source: next ? "user" : null,
              done_during_visit_id: next ? i.done_during_visit_id : null,
            }
          : i
      )
    );
    try {
      await api(`/api/patients/${patientId}/plan-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: next }),
      });
    } catch (err) {
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                done: item.done,
                done_source: item.done_source,
                done_during_visit_id: item.done_during_visit_id,
              }
            : i
        )
      );
      setError(err instanceof Error ? err.message : "Failed to update item");
    }
  }

  async function handleDelete(item: PlanItem) {
    if (!window.confirm(`Delete "${item.text}"?`)) return;
    setLocalItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await api(`/api/patients/${patientId}/plan-items/${item.id}`, {
        method: "DELETE",
      });
    } catch (err) {
      // Couldn't delete on the server — re-sync from parent so the item
      // reappears, and surface the error.
      setError(err instanceof Error ? err.message : "Failed to delete item");
      onChange();
    }
  }

  function startEdit(item: PlanItem) {
    setEditingId(item.id);
    setEditingText(item.text);
    setEditingCategory(item.category);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText("");
  }

  async function saveEdit(item: PlanItem) {
    const text = editingText.trim();
    if (!text) return;
    const nextCategory = editingCategory;
    setLocalItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, text, category: nextCategory } : i
      )
    );
    cancelEdit();
    try {
      await api(`/api/patients/${patientId}/plan-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ text, category: nextCategory }),
      });
    } catch (err) {
      setLocalItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, text: item.text, category: item.category }
            : i
        )
      );
      setError(err instanceof Error ? err.message : "Failed to save changes");
    }
  }

  return (
    <BentoCard>
      <CardHeader title="Plan & next steps" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={draftCategory}
          onChange={(e) => setDraftCategory(e.target.value as PlanItemCategory)}
          className="rounded-lg px-2 py-1.5 text-xs font-bold outline-none"
          style={{
            border: "1px solid var(--border-strong)",
            background: PLAN_CATEGORY_STYLES[draftCategory].bg,
            color: PLAN_CATEGORY_STYLES[draftCategory].fg,
          }}
        >
          {PLAN_ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a plan item…"
          className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm outline-none"
          style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)", background: "var(--bg)" }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={busy || !draftText.trim()}
          className="rounded-lg px-2.5 py-1 text-xs font-bold transition-colors hover:bg-slate-100 disabled:opacity-60"
          style={{ border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {error && (
        <p
          className="mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#0F172A" }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#EF4444" }} />
          {error}
        </p>
      )}
      {localItems.length === 0 ? (
        <Empty>No plan items yet.</Empty>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          {PLAN_ITEM_CATEGORIES.map((cat) => {
            const list = grouped.get(cat) ?? [];
            if (list.length === 0) return null;
            const style = PLAN_CATEGORY_STYLES[cat];
            return (
              <section key={cat}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-bold"
                    style={{ background: style.bg, border: `1px solid ${style.border}`, color: style.fg }}
                  >
                    {cat}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-1)" }}>
                    {list.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {list.map((item) => (
                    <PlanItemRow
                      key={item.id}
                      item={item}
                      isEditing={editingId === item.id}
                      editingText={editingText}
                      editingCategory={editingCategory}
                      onEditTextChange={setEditingText}
                      onEditCategoryChange={setEditingCategory}
                      onStartEdit={() => startEdit(item)}
                      onCancelEdit={cancelEdit}
                      onSaveEdit={() => saveEdit(item)}
                      onToggleDone={() => handleToggleDone(item)}
                      onDelete={() => handleDelete(item)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </BentoCard>
  );
}

function PlanItemRow({
  item,
  isEditing,
  editingText,
  editingCategory,
  onEditTextChange,
  onEditCategoryChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleDone,
  onDelete,
}: {
  item: PlanItem;
  isEditing: boolean;
  editingText: string;
  editingCategory: PlanItemCategory;
  onEditTextChange: (v: string) => void;
  onEditCategoryChange: (c: PlanItemCategory) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const style = PLAN_CATEGORY_STYLES[item.category];

  if (isEditing) {
    return (
      <li
        className="flex flex-wrap items-center gap-2 rounded-lg p-2"
        style={{ background: "var(--bg)", borderTop: `2px solid ${style.dot}` }}
      >
        <select
          value={editingCategory}
          onChange={(e) => onEditCategoryChange(e.target.value as PlanItemCategory)}
          className="rounded-md px-1.5 py-1 text-xs font-bold outline-none"
          style={{
            border: `1px solid ${style.border}`,
            background: "white",
            color: PLAN_CATEGORY_STYLES[editingCategory].fg,
          }}
        >
          {PLAN_ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          value={editingText}
          onChange={(e) => onEditTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onSaveEdit(); }
            if (e.key === "Escape") { e.preventDefault(); onCancelEdit(); }
          }}
          autoFocus
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-sm outline-none"
          style={{ border: `1px solid ${style.border}`, color: "var(--text-1)", background: "white" }}
        />
        <button
          type="button"
          onClick={onSaveEdit}
          className="rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors hover:bg-white"
          style={{ border: `1px solid ${style.border}`, color: style.fg }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancelEdit}
          className="rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors hover:bg-white"
          style={{ border: `1px solid ${style.border}`, color: style.fg }}
        >
          Cancel
        </button>
      </li>
    );
  }

  const isAutoCompleted = item.done && item.done_source === "ai";

  return (
    <li
      className="group flex items-center gap-2 rounded-lg p-2"
      style={{
        background: "var(--bg)",
        borderTop: `2px solid ${style.dot}`,
      }}
    >
      <input
        type="checkbox"
        checked={item.done}
        onChange={onToggleDone}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer"
        style={{ accentColor: style.dot }}
        aria-label={item.done ? "Mark as not done" : "Mark as done"}
        title={
          isAutoCompleted
            ? "Auto-completed from a visit transcript. Uncheck to undo."
            : undefined
        }
      />
      <button
        type="button"
        onClick={onStartEdit}
        className="min-w-0 flex-1 truncate text-left text-sm"
        style={{
          color: "var(--text-1)",
          textDecoration: item.done ? "line-through" : "none",
          opacity: item.done ? 0.5 : 1,
        }}
        title={item.text}
      >
        {item.text}
      </button>
      {isAutoCompleted ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: "var(--bg)", border: "1px dashed var(--border-strong)", color: "var(--text-2)" }}
          title="Clair inferred this was completed during a visit. Uncheck to undo."
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M2 5l2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          auto
        </span>
      ) : (
        item.created_during_visit_id && (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: "var(--bg)", border: "1px solid var(--border-strong)", color: "var(--text-1)" }}
            title="Added from a visit transcript"
          >
            from visit
          </span>
        )
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete plan item"
        className="shrink-0 opacity-0 transition group-hover:opacity-100 hover:text-[#DC2626]"
        style={{ color: style.fg }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 4h8M5.5 4V2.5h3V4M4.5 4l.5 8h4l.5-8" />
        </svg>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function formatHeight(cm: number): string {
  const totalInches = cm / 2.54;
  const ft = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches - ft * 12);
  return `${ft}′${inches}″`;
}

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
