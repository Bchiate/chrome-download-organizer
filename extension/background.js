// State lives in chrome.storage.local:
//   activeFolder: "BIO 101"             -> every download goes here while set
//   rules: [{ match: "canvas.example.edu/courses/123", folder: "BIO 101" }, ...]
//   recent: ["BIO 101", "Taxes 2026", ...]

import { basename, folderFor, safeFolder } from "./lib.js";

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  chrome.storage.local.get(["activeFolder", "rules"], (cfg) => {
    const name = basename(item.filename);
    const folder = safeFolder(folderFor(item, cfg));
    if (!name || !folder) return suggest();
    // "uniquify" matches Chrome's normal behaviour: report.pdf -> report (1).pdf
    suggest({ filename: `${folder}/${name}`, conflictAction: "uniquify" });
  });
  return true; // tells Chrome we'll call suggest() asynchronously
});

// Green "ON" badge on the toolbar icon while a folder is active,
// so it's obvious when downloads are being redirected.
async function updateBadge() {
  const { activeFolder } = await chrome.storage.local.get("activeFolder");
  await chrome.action.setBadgeBackgroundColor({ color: "#2ea043" });
  await chrome.action.setBadgeText({ text: activeFolder ? "ON" : "" });
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.activeFolder) updateBadge();
});
