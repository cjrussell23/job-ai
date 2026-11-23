/** The small box autofill shows in the corner of the form, in its own shadow DOM. */

export type PanelState = {
  status: string;
  error: string | null;
  filled: number;
  aiFilled: number;
  needsYou: string[];
  looksSubmitted: boolean;
  finished: boolean;
  busy: boolean;
  hasForm: boolean;
};

export type PanelActions = {
  fillAgain: () => void;
  submitted: (remember: boolean) => void;
};

const css = `
:host { all: initial; }
.box { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 320px;
  max-height: 70vh; overflow: auto; font: 13px/1.45 system-ui, -apple-system, sans-serif;
  color: #111; background: #fff; border: 1px solid #d4d4d8; border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,.18); padding: 12px 14px; }
@media (prefers-color-scheme: dark) { .box { color: #f4f4f5; background: #18181b; border-color: #3f3f46; } }
.head { display: flex; justify-content: space-between; align-items: center; font-weight: 600; margin-bottom: 6px; }
.x { background: none; border: 0; cursor: pointer; font-size: 16px; color: inherit; opacity: .6; }
.row { margin: 4px 0; }
.key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
ul { margin: 4px 0 0 18px; padding: 0; }
.err { color: #dc2626; }
.note { opacity: .75; font-size: 12px; margin-top: 8px; }
.actions { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
button.b { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid #d4d4d8; background: transparent; color: inherit; cursor: pointer; }
button.primary { background: #111; color: #fff; border-color: #111; }
@media (prefers-color-scheme: dark) { button.primary { background: #f4f4f5; color: #111; border-color: #f4f4f5; } }
.mini { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font: 12px system-ui, sans-serif;
  padding: 6px 10px; border-radius: 999px; background: #111; color: #fff; border: 0; cursor: pointer; }
`;

export function createPanel(actions: PanelActions) {
  const host = document.createElement("job-ai-autofill");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const root = document.createElement("div");
  shadow.append(style, root);
  document.documentElement.append(host);
  let collapsed = false;
  let last: PanelState | null = null;
  let remember = true;

  const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Record<string, unknown> = {},
    ...children: (Node | string)[]
  ) => {
    const node: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };

  const render = (state: PanelState) => {
    last = state;
    root.replaceChildren();
    if (collapsed) {
      root.append(
        el("button", {
          className: "mini",
          textContent: "Autofill",
          onclick: () => {
            collapsed = false;
            render(state);
          },
        }),
      );
      return;
    }
    const box = el("div", { className: "box" });
    box.append(
      el(
        "div",
        { className: "head" },
        "Job Search autofill",
        el("button", {
          className: "x",
          title: "Minimize",
          textContent: "–",
          onclick: () => {
            collapsed = true;
            render(state);
          },
        }),
      ),
    );
    if (state.error) box.append(el("div", { className: "row err", textContent: state.error }));
    box.append(el("div", { className: "row", textContent: state.status }));
    if (state.hasForm) {
      const swatch = (color: string) => {
        const s = el("span", { className: "key" });
        s.style.background = color;
        return s;
      };
      box.append(
        el(
          "div",
          { className: "row" },
          swatch("#16a34a"),
          `${state.filled} filled from your profile`,
        ),
        el(
          "div",
          { className: "row" },
          swatch("#ca8a04"),
          `${state.aiFilled} answered by AI, check these`,
        ),
      );
      if (state.needsYou.length > 0) {
        box.append(
          el(
            "div",
            { className: "row" },
            swatch("#dc2626"),
            `${state.needsYou.length} required for you:`,
          ),
          el("ul", {}, ...state.needsYou.slice(0, 8).map((q) => el("li", { textContent: q }))),
        );
      }
    }
    const actionsBox = el("div", { className: "actions" });
    if (state.finished) {
      actionsBox.append(
        el("div", { textContent: "Marked applied in Job Search. You can close this tab." }),
      );
    } else {
      actionsBox.append(
        el("button", {
          className: "b",
          textContent: state.busy ? "Working…" : "Fill again",
          disabled: state.busy,
          onclick: () => actions.fillAgain(),
        }),
      );
      if (state.hasForm || state.looksSubmitted) {
        const box = el("input", { type: "checkbox", checked: remember });
        box.onchange = () => {
          remember = box.checked;
        };
        actionsBox.append(
          el("label", {}, box, " Remember my answers to this form's questions"),
          el("button", {
            className: state.looksSubmitted ? "b primary" : "b",
            textContent: state.looksSubmitted ? "Looks sent: mark applied" : "I submitted it",
            onclick: () => actions.submitted(remember),
          }),
        );
      }
    }
    box.append(actionsBox);
    box.append(
      el("div", {
        className: "note",
        textContent:
          "Autofill never presses submit. Review every highlighted field, then submit on this page yourself.",
      }),
    );
    root.append(box);
  };

  return {
    render,
    current: () => last,
  };
}
