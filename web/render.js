export function renderSmallTalkExamples(listEl, examples = []) {
  if (!listEl) return;
  const rows = Array.isArray(examples) ? examples.filter((x) => typeof x === "string" && x.trim()) : [];
  if (rows.length === 0) {
    listEl.innerHTML = "";
    return;
  }
  const normalized = rows
    .map((x) => String(x).trim().replace(/^[・•●\-\s]+/u, ""))
    .filter(Boolean);
  listEl.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const text of normalized) {
    const item = document.createElement("li");
    item.className = "small-talk-item";
    item.textContent = text;
    fragment.append(item);
  }
  listEl.append(fragment);
}
