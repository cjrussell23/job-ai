import { type Answer, pickOption } from "./classify";
import { type Field, optionLabel } from "./fields";

/**
 * Puts a value into a field the way typing would, so React, Vue and plain forms all
 * notice it. Never submits anything.
 */

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fire(el: HTMLElement, type: string) {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

/** React tracks an input's value itself; setting it through the prototype's setter updates both. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  fire(el, "input");
  fire(el, "change");
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.focus();
  setNativeValue(el, value);
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
  el.blur();
  fire(el, "blur");
  fire(el, "focusout");
}

function selectOption(select: HTMLSelectElement, text: string): boolean {
  const option = [...select.options].find((o) => o.text.trim() === text);
  if (!option) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, option.value);
  else select.value = option.value;
  fire(select, "input");
  fire(select, "change");
  return true;
}

function clickRadio(group: HTMLInputElement[], text: string): boolean {
  const input = group.find((g) => optionLabel(g).trim() === text);
  if (!input) return false;
  (input.labels?.[0] ?? input).click();
  if (!input.checked) {
    input.checked = true;
    fire(input, "change");
  }
  return true;
}

const optionSelector = '[role="option"], [class*="option" i]:not(select *), li[data-value]';

/** The visible choices of an open dropdown list. */
function openOptions(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>(optionSelector)].filter(
    (o) => o.offsetParent !== null || o.getClientRects().length > 0,
  );
}

/**
 * A custom dropdown (react-select, Workday, Ashby): open it, optionally type to filter,
 * then click the choice that fits.
 */
async function fillCombobox(el: HTMLElement, answer: Answer): Promise<boolean> {
  const doc = el.ownerDocument;
  el.focus();
  el.click();
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  const input =
    el instanceof HTMLInputElement
      ? el
      : el.querySelector<HTMLInputElement>("input:not([type=hidden])");
  if (input && answer.type === "text") {
    setNativeValue(input, answer.value);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    await wait(250);
    const options = openOptions(doc);
    if (options.length === 0) continue;
    const pick = pickOption(
      options.map((o) => o.textContent ?? ""),
      answer,
    );
    const chosen = options.find((o) => (o.textContent ?? "").trim() === pick);
    if (chosen) {
      chosen.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      chosen.click();
      return true;
    }
    // Typed text that matched nothing: a free-text location box is still filled.
    break;
  }
  doc.body.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  return input !== null && answer.type === "text" && input.value === answer.value;
}

export function fillFile(input: HTMLInputElement, file: File): boolean {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  fire(input, "input");
  fire(input, "change");
  return (input.files?.length ?? 0) > 0;
}

/** Fills one field with an answer. Returns whether it took. */
export async function fillField(field: Field, answer: Answer): Promise<boolean> {
  const el = field.element;
  switch (field.hint.kind) {
    case "text":
    case "textarea": {
      if (answer.type === "yesNo") return fillText(el, answer.value ? "Yes" : "No");
      if (answer.type === "decline") return false;
      if (answer.type !== "text") return false;
      return fillText(el, answer.value);
    }
    case "select": {
      const pick = pickOption(field.options, answer);
      return pick !== null && selectOption(el as HTMLSelectElement, pick);
    }
    case "radio": {
      const pick = pickOption(field.options, answer);
      return pick !== null && clickRadio(field.group, pick);
    }
    case "checkbox": {
      const tick =
        answer.type === "yesNo"
          ? answer.value
          : answer.type === "text" && /^yes$/i.test(answer.value);
      const input = el as HTMLInputElement;
      if (tick && !input.checked) input.click();
      return tick;
    }
    case "combobox":
      return fillCombobox(el, answer);
    case "file":
      return false;
  }
}

function fillText(el: HTMLElement, value: string): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  const max = el.maxLength > 0 ? el.maxLength : undefined;
  typeInto(el, max ? value.slice(0, max) : value);
  return el.value !== "";
}

/**
 * The choices a custom dropdown offers, read by opening it and closing it again, so the
 * AI can be asked to pick one of them.
 */
export async function comboboxOptions(el: HTMLElement): Promise<string[]> {
  const doc = el.ownerDocument;
  el.focus();
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.click();
  let options: string[] = [];
  for (let attempt = 0; attempt < 4 && options.length === 0; attempt++) {
    await wait(250);
    options = openOptions(doc)
      .map((o) => (o.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  el.blur();
  return [...new Set(options)].slice(0, 80);
}
