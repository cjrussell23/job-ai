import { type Answer, answerFor, classify, type FieldKey, questionKey } from "./classify";
import { collectFields, currentValue, type Field, hasValue } from "./fields";
import { comboboxOptions, fillField, fillFile } from "./fill";
import type { FillerReplies, FillerRequest, FormQuestion, Reply, SavedPair } from "./messages";
import { createPanel, type PanelState } from "./panel";

/**
 * Injected into the tabs autofill opened (ADR 0005). Fills what it can from the packet,
 * asks the AI about the rest, highlights everything it touched and never submits.
 */

const flag = "__jobAiAutofill";

function send<T extends FillerRequest["type"]>(
  request: Extract<FillerRequest, { type: T }>,
): Promise<Reply<FillerReplies[T]>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(request, (reply: Reply<FillerReplies[T]> | undefined) => {
      resolve(reply ?? { ok: false, error: "The extension didn't answer. Reload the page." });
    });
  });
}

const highlightCss = `
[data-job-ai="filled"] { outline: 2px solid #16a34a !important; outline-offset: 2px !important; }
[data-job-ai="ai"] { outline: 2px solid #ca8a04 !important; outline-offset: 2px !important; }
[data-job-ai="needs"] { outline: 2px dashed #dc2626 !important; outline-offset: 2px !important; }
`;

/** Contact and standard fields are known; only the form's own questions are worth saving. */
const notSaved = new Set<FieldKey>([
  "firstName",
  "lastName",
  "fullName",
  "preferredName",
  "email",
  "phone",
  "city",
  "province",
  "country",
  "location",
  "linkedin",
  "github",
  "website",
  "resume",
  "coverLetterFile",
  "coverLetterText",
  "consent",
]);

const yesNoKeys = new Set<FieldKey>(["workAuthorized", "needsSponsorship", "willingToRelocate"]);

const submittedPattern =
  /thank you for (applying|your (application|interest))|application (has been |was )?(submitted|received)|we('ve| have) received your application|your application is complete/i;

async function main() {
  if (Reflect.get(window, flag)) return;
  Reflect.set(window, flag, true);

  const isTop = window.top === window;
  const packetReply = await send({ type: "packet" });
  if (!packetReply.ok) {
    if (isTop) {
      createPanel({ fillAgain: () => location.reload(), submitted: () => {} }).render({
        status: "",
        error: packetReply.error,
        filled: 0,
        aiFilled: 0,
        needsYou: [],
        looksSubmitted: false,
        finished: false,
        busy: false,
        hasForm: false,
      });
    }
    return;
  }
  const packet = packetReply.data;

  const style = document.createElement("style");
  style.textContent = highlightCss;
  document.documentElement.append(style);

  /** Fields the member typed in: never touched again. */
  const touched = new WeakSet<HTMLElement>();
  document.addEventListener(
    "input",
    (e) => {
      if (e.isTrusted && e.target instanceof HTMLElement) touched.add(e.target);
    },
    true,
  );
  const filledBy = new Map<HTMLElement, "filled" | "ai">();
  const asked = new Set<string>();
  const files = new Map<string, File>();
  let panel: ReturnType<typeof createPanel> | null = null;
  let state: PanelState = {
    status: "Looking for the application form…",
    error: null,
    filled: 0,
    aiFilled: 0,
    needsYou: [],
    looksSubmitted: false,
    finished: false,
    busy: false,
    hasForm: false,
  };
  let lastFields: Field[] = [];

  const update = (patch: Partial<PanelState>) => {
    state = { ...state, ...patch };
    panel?.render(state);
  };

  const markTarget = (field: Field) =>
    field.group.length > 1
      ? ((field.element.closest(
          "fieldset, [role=radiogroup], [role=group]",
        ) as HTMLElement | null) ??
        field.element.parentElement ??
        field.element)
      : field.element;

  const fileFor = async (kind: "resume" | "cover_letter"): Promise<File | null> => {
    const cached = files.get(kind);
    if (cached) return cached;
    const reply = await send({ type: "document", kind });
    if (!reply.ok) return null;
    const bytes = Uint8Array.from(atob(reply.data.base64), (c) => c.charCodeAt(0));
    const file = new File([bytes], reply.data.fileName, { type: reply.data.type });
    files.set(kind, file);
    return file;
  };

  const savedAnswer = (field: Field): Answer | null => {
    const key = questionKey(field.hint.label);
    const saved = packet.saved.find((s) => s.key === key);
    return saved ? { type: "text", value: saved.answer } : null;
  };

  const record = (field: Field, how: "filled" | "ai") => {
    filledBy.set(field.element, how);
    markTarget(field).setAttribute("data-job-ai", how);
  };

  const refreshCounts = (fields: Field[]) => {
    let filled = 0;
    let aiFilled = 0;
    for (const how of filledBy.values()) {
      if (how === "filled") filled++;
      else aiFilled++;
    }
    const needsYou: string[] = [];
    for (const field of fields) {
      if (!field.required || hasValue(field)) {
        if (markTarget(field).getAttribute("data-job-ai") === "needs")
          markTarget(field).removeAttribute("data-job-ai");
        continue;
      }
      markTarget(field).setAttribute("data-job-ai", "needs");
      needsYou.push(field.hint.label || "An upload");
    }
    update({ filled, aiFilled, needsYou });
  };

  /** One pass over the page: fill every empty field we know the answer to. */
  const fillPass = async () => {
    const fields = collectFields(document);
    lastFields = fields;
    const looksSubmitted = submittedPattern.test(document.body?.textContent ?? "");
    if (fields.length < 2 && !looksSubmitted) {
      if (isTop && !panel) panel = createPanel(actions);
      update({
        hasForm: false,
        looksSubmitted,
        status:
          "Waiting for the application form. Sign in or press the site's Apply button if needed; autofill fills the form when it appears.",
      });
      return;
    }
    if (!panel) panel = createPanel(actions);
    update({
      hasForm: fields.length >= 2,
      looksSubmitted,
      busy: true,
      status: "Filling the form…",
    });
    const unknown: { field: Field; question: FormQuestion }[] = [];
    for (const field of fields) {
      if (touched.has(field.element) || filledBy.has(field.element) || hasValue(field)) continue;
      const key = classify(field.hint, field.autocomplete);
      if (field.hint.kind === "file") {
        if (/photo|picture|image|avatar|headshot|transcript|certificate/i.test(field.hint.label))
          continue;
        // Only uploads labelled as a resume or cover letter: "fill from resume" boxes and
        // the like would overwrite the form.
        const kind =
          key === "coverLetterFile" ? "cover_letter" : key === "resume" ? "resume" : null;
        const wanted =
          kind === "resume" ? packet.documents.resume : kind ? packet.documents.coverLetter : null;
        if (!kind || !wanted) continue;
        const file = await fileFor(kind);
        if (file && fillFile(field.element as HTMLInputElement, file)) record(field, "filled");
        continue;
      }
      let answer = savedAnswer(field) ?? (key ? answerFor(key, packet) : null);
      // "If your work permit is temporary, when does it end?" mentions authorization but
      // wants more than a yes or no: the AI reads it with the standard answers instead.
      const freeText = field.hint.kind === "text" || field.hint.kind === "textarea";
      if (answer?.type === "yesNo" && freeText) answer = null;
      if (answer) {
        if (await fillField(field, answer)) record(field, "filled");
        continue;
      }
      // A question we recognise but leave for the member (consent, a blank standard answer).
      if (key && !(freeText && yesNoKeys.has(key))) continue;
      // A lone tick box with a one-word label ("Custom") isn't a question.
      if (field.hint.kind === "checkbox" && field.hint.label.length < 15) continue;
      const qkey = `${questionKey(field.hint.label)}|${field.hint.kind}`;
      if (asked.has(qkey) || !field.hint.label) continue;
      const isCombobox = field.hint.kind === "combobox";
      const options = isCombobox ? await comboboxOptions(field.element) : field.options;
      unknown.push({
        field,
        question: {
          key: qkey,
          label: field.hint.label,
          kind: isCombobox
            ? options.length > 0
              ? "select"
              : "text"
            : (field.hint.kind as FormQuestion["kind"]),
          options,
          required: field.required,
        },
      });
    }
    refreshCounts(fields);
    if (unknown.length > 0) {
      for (const u of unknown) asked.add(u.question.key);
      update({
        status: `Asking the AI about ${unknown.length} question${unknown.length === 1 ? "" : "s"} from your profile…`,
      });
      const reply = await send({
        type: "answers",
        questions: unknown.map((u) => u.question).slice(0, 40),
      });
      if (reply.ok) {
        for (const drafted of reply.data) {
          if (!drafted.answer) continue;
          const target = unknown.find((u) => u.question.key === drafted.key);
          if (!target || touched.has(target.field.element) || hasValue(target.field)) continue;
          if (await fillField(target.field, { type: "text", value: drafted.answer }))
            record(target.field, "ai");
        }
      } else {
        update({ error: reply.error });
      }
      refreshCounts(collectFields(document));
    }
    update({
      busy: false,
      status: looksSubmitted
        ? "This page looks like a confirmation. Mark the application applied below."
        : "Done. Check the highlighted fields, fill any red ones, then submit on the page yourself.",
    });
  };

  let running = false;
  let again = false;
  const run = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await fillPass();
    } finally {
      running = false;
      if (again) {
        again = false;
        void run();
      }
    }
  };

  const actions = {
    fillAgain: () => void run(),
    submitted: async (remember: boolean) => {
      const save: SavedPair[] = [];
      if (remember) {
        for (const field of lastFields) {
          if (field.hint.kind === "file" || !field.hint.label) continue;
          const key = classify(field.hint, field.autocomplete);
          if (key && notSaved.has(key)) continue;
          const value = currentValue(field).trim();
          if (value && !(field.hint.kind === "checkbox" && value === "no"))
            save.push({ question: field.hint.label, answer: value });
        }
      }
      const reply = await send({
        type: "finish",
        submitted: true,
        filledCount: filledBy.size,
        save: save.slice(0, 60),
      });
      if (reply.ok) update({ finished: true, error: null });
      else update({ error: reply.error });
    },
  };

  await run();

  // Sites rewrite fields after we fill them (Lever's location picker does); keep the red
  // "needs you" marks and counts true to what the form holds now.
  let recount: number | undefined;
  const scheduleRecount = () => {
    window.clearTimeout(recount);
    recount = window.setTimeout(() => {
      if (!running && !state.finished) refreshCounts(lastFields);
    }, 400);
  };
  document.addEventListener("change", scheduleRecount, true);
  document.addEventListener("input", scheduleRecount, true);

  // Multi-step forms and late-loading pages add fields after the first pass.
  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (state.finished) return;
      const count = collectFields(document).length;
      if (count !== lastFields.length || submittedPattern.test(document.body?.textContent ?? ""))
        void run();
    }, 900);
  });
  observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true });
}

void main();
