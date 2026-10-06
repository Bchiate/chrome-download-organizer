// Pure helpers shared by the service worker, the popup and the tests. Nothing here touches the
// chrome.* APIs, so it runs unchanged under Node.

export function basename(path) {
  return (path || "").split(/[\\/]/).pop();
}

// Characters Windows refuses in file and folder names, plus control characters.
const INVALID_CHARS = /[<>"|?*\u0000-\u001f]/g;
// Names Windows reserves for devices, with or without an extension ("con", "nul.txt", "com1").
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// Turns whatever the user typed into a relative folder path that's valid on every OS.
// Nested folders ("CSCI 201/Week 3") are allowed, but "." and ".." segments are dropped so a path
// can never escape the Downloads folder.
export function safeFolder(folder) {
  return (folder || "")
    .split(/[\\/]/)
    .map((segment) =>
      segment
        .replace(/\s*:\s*/g, " - ") // "CSCI 201: Week 3" -> "CSCI 201 - Week 3"
        .replace(/\s+/g, " ") // tabs and newlines become spaces
        .replace(INVALID_CHARS, "-")
        .trim()
        .replace(/[. ]+$/, ""), // Windows strips trailing dots and spaces
    )
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => (RESERVED_NAME.test(segment) ? `${segment}_` : segment))
    .join("/");
}

// "canvas.example.edu/courses/123" -> { host: "canvas.example.edu", path: "/courses/123" }
export function parseMatch(match) {
  const [host = "", ...path] = (match || "").trim().replace(/^https?:\/\//i, "").split("/");
  const segments = path.filter(Boolean);
  return { host: host.toLowerCase(), path: segments.length ? `/${segments.join("/")}` : "" };
}

// True when `url` is on the rule's host (or a subdomain of it) and, if the rule has a path, at
// or under that path. Matching respects boundaries: "courses/123" doesn't match "courses/1234",
// and "example.com" doesn't match "notexample.com".
export function urlMatches(url, match) {
  const rule = parseMatch(match);
  if (!rule.host) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.host.toLowerCase();
  const onHost = host === rule.host || host.endsWith(`.${rule.host}`);
  const underPath = !rule.path || u.pathname === rule.path || u.pathname.startsWith(`${rule.path}/`);
  return onHost && underPath;
}

// The folder a download should go to, or "" to leave it alone. An explicitly chosen folder wins
// over site rules; among rules, the first match wins (new rules are added at the top).
// Canvas serves course files from a separate file host, so the referrer is what identifies the
// course; redirects can change the final URL, so that's checked too.
export function folderFor(item, { activeFolder, rules } = {}) {
  if (activeFolder) return activeFolder;
  const urls = [item.url, item.finalUrl, item.referrer].filter(Boolean);
  const rule = (rules || []).find((r) => r.match && urls.some((url) => urlMatches(url, r.match)));
  return rule ? rule.folder : "";
}

// Turns the current tab's URL into something worth matching on.
// Canvas (any school): host + /courses/<id>, which covers every file in that course.
// Anything else: just the host.
export function suggestMatch(url) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return "";
    const course = u.pathname.match(/^\/courses\/\d+/);
    return u.host + (course ? course[0] : "");
  } catch {
    return "";
  }
}
