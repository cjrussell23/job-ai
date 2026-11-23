import type { FieldHint } from "./classify";

/** One question on the page: an input, a radio group, a dropdown or an upload. */
export type Field = {
  /** The element to fill, or the first radio or checkbox of a group. */
  element: HTMLElement;
  /** Every radio or checkbox in a group; just the element otherwise. */
  group: HTMLInputElement[];
  hint: FieldHint;
  autocomplete: string;
  options: string[];
  required: boolean;
};

const skippedTypes = new Set([
  "hidden",
  "submit",
  "button",
  "reset",
  "image",
  "password",
  "search",
]);

const textOf = (el: Element | null | undefined) =>
  (el?.textContent ?? "").replace(/\s+/g, " ").trim();

const cleanLabel = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s*[*✱]\s*$/, "")
    .replace(/^[*✱]\s*/, "")
    .replace(/\s*✱\s*/g, " ")
    .trim()
    .slice(0, 500);

function byIds(ids: string, root: Document): string {
  return ids
    .split(/\s+/)
    .map((id) => textOf(root.getElementById(id)))
    .filter(Boolean)
    .join(" ");
}

/**
 * The question above a radio or checkbox group whose markup has no legend: the nearest
 * label-like element around the group that isn't one of the options.
 */
function groupHeading(el: HTMLInputElement): string {
  const members = el.name
    ? [...el.ownerDocument.querySelectorAll<HTMLInputElement>(`input[type="${el.type}"]`)].filter(
        (i) => i.name === el.name,
      )
    : [el];
  let container: HTMLElement | null = el.parentElement;
  while (container && !members.every((m) => container?.contains(m)))
    container = container.parentElement;
  for (let depth = 0; container && depth < 4; depth++) {
    const candidates = container.querySelectorAll<HTMLElement>(
      'legend, label, [class*="label" i], [class*="question" i], [class*="title" i]',
    );
    for (const candidate of candidates) {
      if (candidate.querySelector("input")) continue;
      const text = textOf(candidate);
      if (text) return text;
    }
    container = container.parentElement;
  }
  return "";
}

/** The text a person reads as this field's question. */
export function labelFor(el: HTMLElement): string {
  const doc = el.ownerDocument;
  if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
    // For a group, the question is the fieldset's legend or the group's heading.
    const fieldset = el.closest("fieldset");
    const legend = fieldset?.querySelector("legend");
    if (legend && textOf(legend)) return cleanLabel(textOf(legend));
    const group = el.closest('[role="radiogroup"], [role="group"]');
    const labelledBy = group?.getAttribute("aria-labelledby");
    if (labelledBy) return cleanLabel(byIds(labelledBy, doc));
    if (group?.getAttribute("aria-label"))
      return cleanLabel(group.getAttribute("aria-label") ?? "");
    const heading = groupHeading(el);
    if (heading) return cleanLabel(heading);
  }
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = byIds(labelledBy, doc);
    if (text) return cleanLabel(text);
  }
  if ("labels" in el) {
    const labels = (el as HTMLInputElement).labels;
    const first = labels?.[0];
    if (first && textOf(first)) return cleanLabel(textOf(first));
  }
  const aria = el.getAttribute("aria-label");
  if (aria) return cleanLabel(aria);
  // Many forms put the label in a sibling or a wrapper rather than a <label>.
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < 4; depth++) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    const candidate = parent.querySelector(
      'label, legend, [class*="label" i], [class*="question" i], [data-automation-id*="label" i]',
    );
    if (candidate && !candidate.contains(el) && textOf(candidate))
      return cleanLabel(textOf(candidate));
    node = parent;
  }
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return cleanLabel(placeholder);
  return cleanLabel(el.getAttribute("name") ?? el.id ?? "");
}

/** The text beside one radio button or checkbox: its option. */
export function optionLabel(input: HTMLInputElement): string {
  const label = input.labels?.[0];
  if (label && textOf(label)) return textOf(label);
  const aria = input.getAttribute("aria-label");
  if (aria) return aria;
  const next = input.nextElementSibling;
  if (next && textOf(next)) return textOf(next);
  return textOf(input.parentElement) || input.value;
}

function attributesOf(el: HTMLElement): string {
  return ["name", "id", "data-automation-id", "data-qa", "data-testid", "aria-describedby"]
    .map((a) => el.getAttribute(a) ?? "")
    .filter(Boolean)
    .join(" ");
}

function visible(el: HTMLElement): boolean {
  // Upload inputs are usually hidden behind a styled button but still take files.
  if (el instanceof HTMLInputElement && el.type === "file") return true;
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !(style && (style.display === "none" || style.visibility === "hidden"));
}

function isRequired(el: HTMLElement, label: string): boolean {
  return (
    (el as HTMLInputElement).required === true ||
    el.getAttribute("aria-required") === "true" ||
    /\*\s*$/.test(textOf(el.closest("label")) || "") ||
    /\*/.test(label)
  );
}

/** Every question on the page that a person could answer. */
export function collectFields(root: Document | HTMLElement): Field[] {
  const fields: Field[] = [];
  const seenGroups = new Set<string>();
  const elements = root.querySelectorAll<HTMLElement>(
    'input, textarea, select, [role="combobox"]:not(input), button[aria-haspopup="listbox"]',
  );
  for (const el of elements) {
    if ((el as HTMLInputElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
    if (el instanceof HTMLInputElement) {
      if (skippedTypes.has(el.type)) continue;
      if (!visible(el)) continue;
      if (el.type === "radio" || el.type === "checkbox") {
        const groupName = el.name || el.id;
        const form = el.form ?? el.ownerDocument;
        const group = el.name
          ? [...form.querySelectorAll<HTMLInputElement>(`input[type="${el.type}"]`)].filter(
              (i) => i.name === el.name,
            )
          : [el];
        const key = `${el.type}:${groupName}`;
        if (seenGroups.has(key)) continue;
        seenGroups.add(key);
        const isGroup = group.length > 1 || el.type === "radio";
        const label = isGroup ? labelFor(el) : labelFor(el) || optionLabel(el);
        fields.push({
          element: el,
          group,
          hint: { label, attributes: attributesOf(el), kind: isGroup ? "radio" : "checkbox" },
          autocomplete: "",
          options: isGroup ? group.map(optionLabel) : [],
          required: group.some((g) => g.required) || isRequired(el, label),
        });
        continue;
      }
      const label = labelFor(el);
      fields.push({
        element: el,
        group: [],
        hint: {
          label,
          attributes: attributesOf(el),
          kind:
            el.type === "file"
              ? "file"
              : el.getAttribute("role") === "combobox"
                ? "combobox"
                : "text",
        },
        autocomplete: el.getAttribute("autocomplete") ?? "",
        options: [],
        required: isRequired(el, label),
      });
      continue;
    }
    if (!visible(el)) continue;
    const label = labelFor(el);
    if (el instanceof HTMLTextAreaElement) {
      fields.push({
        element: el,
        group: [],
        hint: { label, attributes: attributesOf(el), kind: "textarea" },
        autocomplete: el.getAttribute("autocomplete") ?? "",
        options: [],
        required: isRequired(el, label),
      });
    } else if (el instanceof HTMLSelectElement) {
      fields.push({
        element: el,
        group: [],
        hint: { label, attributes: attributesOf(el), kind: "select" },
        autocomplete: el.getAttribute("autocomplete") ?? "",
        options: [...el.options].map((o) => o.text.trim()),
        required: isRequired(el, label),
      });
    } else {
      // A custom dropdown: a button or div that opens a listbox.
      fields.push({
        element: el,
        group: [],
        hint: { label, attributes: attributesOf(el), kind: "combobox" },
        autocomplete: "",
        options: [],
        required: isRequired(el, label),
      });
    }
  }
  return fields.filter((f) => f.hint.label !== "" || f.hint.kind === "file");
}

/** Whether a field already holds an answer, so it is never overwritten. */
export function hasValue(field: Field): boolean {
  const el = field.element;
  if (field.hint.kind === "radio") return field.group.some((g) => g.checked);
  if (field.hint.kind === "checkbox") return (el as HTMLInputElement).checked;
  if (el instanceof HTMLInputElement && el.type === "file") return (el.files?.length ?? 0) > 0;
  if (el instanceof HTMLSelectElement) {
    const option = el.options[el.selectedIndex];
    return (
      !!option && option.value !== "" && !/^(select|choose|please|--)/i.test(option.text.trim())
    );
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
    return el.value.trim() !== "";
  // A custom dropdown shows its choice as text; a placeholder means it's empty.
  const shown = textOf(el);
  return shown !== "" && !/^(select|choose|please select|--)/i.test(shown);
}

/** The field's current answer as text, for saving answers the member chose. */
export function currentValue(field: Field): string {
  const el = field.element;
  if (field.hint.kind === "radio") {
    const checked = field.group.find((g) => g.checked);
    return checked ? optionLabel(checked) : "";
  }
  if (field.hint.kind === "checkbox") return (el as HTMLInputElement).checked ? "yes" : "no";
  if (el instanceof HTMLSelectElement) return el.options[el.selectedIndex]?.text.trim() ?? "";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return textOf(el);
}
