import { safeFolder, suggestMatch } from "./lib.js";

const $ = (id) => document.getElementById(id);
const MAX_RECENT = 8;

let state = { activeFolder: "", rules: [], recent: [] };
let pageMatch = "";

function render() {
  const on = Boolean(state.activeFolder);
  $("status").classList.toggle("on", on);
  $("statusText").innerHTML = on
    ? `Everything goes to <b></b>`
    : "Off — downloads go to the usual place";
  if (on) $("statusText").querySelector("b").textContent = state.activeFolder;
  $("stop").hidden = !on;

  $("recent").innerHTML = "";
  for (const f of state.recent) {
    const opt = document.createElement("option");
    opt.value = f;
    $("recent").appendChild(opt);
  }

  const list = $("rules");
  list.innerHTML = "";
  for (const [i, rule] of state.rules.entries()) {
    const li = document.createElement("li");
    const match = Object.assign(document.createElement("span"), { className: "match", textContent: rule.match, title: rule.match });
    const arrow = Object.assign(document.createElement("span"), { className: "arrow", textContent: "→" });
    const folder = Object.assign(document.createElement("span"), { className: "folder", textContent: rule.folder });
    const remove = Object.assign(document.createElement("button"), { className: "remove", textContent: "✕", title: "Remove rule" });
    remove.addEventListener("click", () => {
      state.rules.splice(i, 1);
      save();
    });
    li.append(match, arrow, folder, remove);
    list.appendChild(li);
  }
  $("noRules").hidden = state.rules.length > 0;

  $("pageMatch").textContent = pageMatch || "this page";
  $("addRule").disabled = !pageMatch;
}

async function save() {
  await chrome.storage.local.set(state);
  render();
}

// Folder names are cleaned up front, so what the popup shows is exactly where files will land.
function currentFolder() {
  return safeFolder($("folder").value) || state.activeFolder;
}

function setActive() {
  const folder = safeFolder($("folder").value);
  if (!folder) return;
  state.activeFolder = folder;
  state.recent = [folder, ...state.recent.filter((f) => f !== folder)].slice(0, MAX_RECENT);
  save();
}

$("set").addEventListener("click", setActive);
$("folder").addEventListener("keydown", (e) => {
  if (e.key === "Enter") setActive();
});

$("stop").addEventListener("click", () => {
  state.activeFolder = "";
  save();
});

$("addRule").addEventListener("click", () => {
  const folder = currentFolder();
  if (!folder || !pageMatch) {
    $("folder").focus();
    return;
  }
  state.rules = state.rules.filter((r) => r.match !== pageMatch);
  state.rules.unshift({ match: pageMatch, folder });
  save();
});

(async () => {
  const stored = await chrome.storage.local.get(["activeFolder", "rules", "recent"]);
  state = { ...state, ...stored };

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  pageMatch = suggestMatch(tab?.url);

  $("folder").value = state.activeFolder;
  render();
})();
