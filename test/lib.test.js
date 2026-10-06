import { test } from "node:test";
import assert from "node:assert/strict";
import { basename, folderFor, parseMatch, safeFolder, suggestMatch, urlMatches } from "../extension/lib.js";

test("basename takes the last segment of either path style", () => {
  assert.equal(basename("C:\\Users\\me\\Downloads\\notes.pdf"), "notes.pdf");
  assert.equal(basename("/home/me/Downloads/notes.pdf"), "notes.pdf");
  assert.equal(basename(undefined), "");
});

test("safeFolder keeps nested folders but never escapes Downloads", () => {
  assert.equal(safeFolder("BIO 101/Week 3"), "BIO 101/Week 3");
  assert.equal(safeFolder("../../etc"), "etc");
  assert.equal(safeFolder("a/./b/../c"), "a/b/c");
  assert.equal(safeFolder("\\\\server\\share"), "server/share");
  assert.equal(safeFolder("  /Taxes 2026/  "), "Taxes 2026");
  assert.equal(safeFolder(""), "");
});

test("safeFolder produces names Windows accepts", () => {
  assert.equal(safeFolder("BIO 101: Week 3"), "BIO 101 - Week 3");
  assert.equal(safeFolder('Q&A <draft> "final"?'), "Q&A -draft- -final--");
  assert.equal(safeFolder("Notes..."), "Notes");
  assert.equal(safeFolder("con"), "con_");
  assert.equal(safeFolder("Archive/NUL.txt"), "Archive/NUL.txt_");
  assert.equal(safeFolder("tab\there"), "tab here");
});

test("parseMatch splits a rule into host and path", () => {
  assert.deepEqual(parseMatch("canvas.example.edu/courses/123"), { host: "canvas.example.edu", path: "/courses/123" });
  assert.deepEqual(parseMatch("https://Example.com/"), { host: "example.com", path: "" });
});

test("urlMatches respects host boundaries", () => {
  assert.ok(urlMatches("https://example.com/a.pdf", "example.com"));
  assert.ok(urlMatches("https://files.example.com/a.pdf", "example.com"));
  assert.ok(!urlMatches("https://notexample.com/a.pdf", "example.com"));
  assert.ok(!urlMatches("https://example.com.evil.test/a.pdf", "example.com"));
});

test("urlMatches respects path boundaries", () => {
  const rule = "canvas.example.edu/courses/123";
  assert.ok(urlMatches("https://canvas.example.edu/courses/123", rule));
  assert.ok(urlMatches("https://canvas.example.edu/courses/123/files/9", rule));
  assert.ok(!urlMatches("https://canvas.example.edu/courses/1234/files/9", rule));
  assert.ok(!urlMatches("https://canvas.example.edu/", rule));
});

test("urlMatches ignores junk", () => {
  assert.ok(!urlMatches("not a url", "example.com"));
  assert.ok(!urlMatches("https://example.com", ""));
});

test("folderFor prefers the active folder over site rules", () => {
  const rules = [{ match: "example.com", folder: "Site" }];
  assert.equal(folderFor({ url: "https://example.com/a.pdf" }, { activeFolder: "Now", rules }), "Now");
  assert.equal(folderFor({ url: "https://example.com/a.pdf" }, { activeFolder: "", rules }), "Site");
});

test("folderFor matches Canvas files through the referrer, course by course", () => {
  // Canvas hands course files out from a separate file host; the referrer names the course.
  const item = {
    url: "https://files.instructure-cdn.test/abc/notes.pdf",
    referrer: "https://canvas.example.edu/courses/1234/files/9",
  };
  const rules = [
    { match: "canvas.example.edu/courses/123", folder: "BIO 101" },
    { match: "canvas.example.edu/courses/1234", folder: "CHEM 110" },
  ];
  // A plain substring check would file course 1234's notes under course 123.
  assert.equal(folderFor(item, { rules }), "CHEM 110");
});

test("folderFor checks the final URL after redirects", () => {
  const item = { url: "https://short.link/x", finalUrl: "https://example.com/a.pdf" };
  assert.equal(folderFor(item, { rules: [{ match: "example.com", folder: "Site" }] }), "Site");
});

test("folderFor leaves downloads alone when nothing applies", () => {
  assert.equal(folderFor({ url: "https://other.test/a.pdf" }, { rules: [] }), "");
  assert.equal(folderFor({ url: "https://other.test/a.pdf" }), "");
});

test("suggestMatch covers a whole Canvas course or a host", () => {
  assert.equal(suggestMatch("https://canvas.example.edu/courses/123/modules/45"), "canvas.example.edu/courses/123");
  assert.equal(suggestMatch("https://www.example.com/reports/q3"), "www.example.com");
  assert.equal(suggestMatch("chrome://extensions"), "");
  assert.equal(suggestMatch(undefined), "");
});
