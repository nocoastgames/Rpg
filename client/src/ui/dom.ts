/** Tiny DOM helper: h("div.class#id", {attrs}, ...children). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | `${K}.${string}` | `${K}#${string}`,
  attrs: Record<string, string | number | boolean | EventListener | undefined> | null = null,
  ...children: Array<Node | string | null | undefined | false>
): HTMLElementTagNameMap[K] {
  const [base, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(base as K);
  for (const r of rest) {
    if (r.startsWith(".")) el.classList.add(r.slice(1));
    else if (r.startsWith("#")) el.id = r.slice(1);
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      if (typeof v === "function") el.addEventListener(k.replace(/^on/, ""), v);
      else if (k === "style") el.setAttribute("style", String(v));
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode etc.) - non-essential.
  }
}
