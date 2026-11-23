import type { Packet } from "@/features/autofill/packet";

/** Messages from the filler in a page to the extension's background worker. */
export type FillerRequest =
  | { type: "packet" }
  | { type: "document"; kind: "resume" | "cover_letter" }
  | { type: "answers"; questions: FormQuestion[] }
  | { type: "finish"; submitted: boolean; filledCount: number; save: SavedPair[] };

export type FormQuestion = {
  key: string;
  label: string;
  kind: "text" | "textarea" | "select" | "radio" | "checkbox";
  options: string[];
  required: boolean;
};
export type DraftedAnswer = { key: string; answer: string | null; sourceIds: string[] };
export type SavedPair = { question: string; answer: string };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

export type FillerReplies = {
  packet: Packet;
  document: { base64: string; fileName: string; type: string };
  answers: DraftedAnswer[];
  finish: { saved: number };
};

/** Messages from the app's page, through the bridge script, to the background worker. */
export type BridgeRequest = { type: "autofill"; ticket: string; applyUrl: string };
