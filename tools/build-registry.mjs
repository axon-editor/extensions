#!/usr/bin/env node
/**
 * Builds the Axon extension registry.
 *
 * Scans extensions/ for package folders, zips each one into dist/, computes
 * sha256 digests, and writes registry.json at the repository root. The editor
 * fetches that index from raw.githubusercontent.com and installs each download
 * entry only after verifying the stored checksum, so a package must be
 * re-generated and committed after any source change.
 *
 * Layout of one package folder:
 *   extensions/<id>/axon.extension.json   required manifest (id must match)
 *   extensions/<id>/webview/...           opt-in assets served by the editor
 *   extensions/<id>/themes/...            opt-in themes
 *
 * Usage: npm run build:registry
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const EXTENSIONS_ROOT = path.join(REPO_ROOT, "extensions");
const DIST_ROOT = path.join(REPO_ROOT, "dist");
const REGISTRY_PATH = path.join(REPO_ROOT, "registry.json");
const REPOSITORY_URL = "https://github.com/axon-editor/extensions";
// Package archives must stay reachable through raw.githubusercontent.com, which
// is the host the editor allowlists for registry and package downloads.
const RAW_BASE_URL = "https://raw.githubusercontent.com/axon-editor/extensions/main";

const VALID_KINDS = new Set([
  "theme",
  "icon-theme",
  "language",
  "tool",
  "view",
  "agent",
  "terminal",
  "debugger",
  "mixed",
]);

function asString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`extension manifest field "${label}" must be a non-empty string`);
  }
  return value.trim();
}

function asStringArray(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`expected an array of strings`);
  }
  return value;
}

// Mirrors the host's inferExtensionKind so the published kind never contradicts
// what the editor would infer from the installed manifest.
function inferKind(manifest) {
  if (VALID_KINDS.has(manifest.kind)) return manifest.kind;

  const contributes = manifest.contributes ?? {};
  const kinds = new Set();
  const count = (field) => (Array.isArray(contributes[field]) ? contributes[field].length : 0);
  if (count("themes") > 0) kinds.add("theme");
  if (count("iconThemes") > 0 || count("icons") > 0) kinds.add("icon-theme");
  if (count("languages") > 0 || count("snippets") > 0) kinds.add("language");
  if (count("views") > 0) kinds.add("view");
  if (count("agents") > 0) kinds.add("agent");
  if (count("terminalProfiles") > 0) kinds.add("terminal");
  if (count("debuggerProviders") > 0) kinds.add("debugger");
  if (
    count("commands") > 0 ||
    count("taskProviders") > 0 ||
    count("workspaceIndexProviders") > 0
  ) {
    kinds.add("tool");
  }
  if (kinds.size === 1) return [...kinds][0];
  if (kinds.size > 1) return "mixed";
  return "tool";
}

function collectFiles(root, prefix = "") {
  return readdir(root, { withFileTypes: true }).then((entries) =>
    Promise.all(
      entries.flatMap((entry) => {
        const entryPath = path.join(root, entry.name);
        const entryPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return collectFiles(entryPath, entryPrefix);
        return [{ path: entryPath, zipName: entryPrefix }];
      }),
    ),
  ).then((groups) => groups.flat());
}

async function buildPackage(extensionPath) {
  const manifestPath = path.join(extensionPath, "axon.extension.json");
  const raw = JSON.parse(await readFile(manifestPath, "utf-8"));

  const id = asString(raw.id, "id");
  const name = asString(raw.name, "name");
  const publisher = asString(raw.publisher, "publisher");
  const version = asString(raw.version, "version");

  const sourceFolder = path.dirname(manifestPath);
  const files = await collectFiles(sourceFolder);
  if (files.length === 0) {
    throw new Error(`${id}: package folder contains no files`);
  }

  const zip = new AdmZip();
  for (const file of files) {
    zip.addLocalFile(file.path, undefined, file.zipName);
  }

  await mkdir(DIST_ROOT, { recursive: true });
  const archiveName = `${id}-${version}.zip`;
  const archivePath = path.join(DIST_ROOT, archiveName);
  await new Promise((resolve, reject) => {
    zip.writeZip(archivePath, (err) => (err ? reject(err) : resolve()));
  });

  const archiveStats = await stat(archivePath);
  const digest = createHash("sha256");
  digest.update(await readFile(archivePath));
  const sha256 = digest.digest("hex");

  return {
    id,
    name,
    publisher,
    version,
    description: typeof raw.description === "string" ? raw.description : undefined,
    kind: inferKind(raw),
    source: "marketplace",
    repositoryUrl: typeof raw.repository === "string" ? raw.repository : REPOSITORY_URL,
    homepageUrl: typeof raw.homepage === "string" ? raw.homepage : undefined,
    packageUrl: `${RAW_BASE_URL}/dist/${archiveName}`,
    installMode: "download",
    categories: asStringArray(raw.categories),
    tags: asStringArray(raw.tags),
    icon: typeof raw.icon === "string" ? raw.icon : undefined,
    sha256,
    size: archiveStats.size,
  };
}

async function main() {
  await rm(DIST_ROOT, { recursive: true, force: true });
  await mkdir(DIST_ROOT, { recursive: true });

  const folders = (await readdir(EXTENSIONS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(EXTENSIONS_ROOT, entry.name));

  const extensions = [];
  for (const folder of folders) {
    const packageEntry = await buildPackage(folder);
    extensions.push(packageEntry);
    console.log(`packaged ${packageEntry.id}@${packageEntry.version} (${(packageEntry.size / 1024).toFixed(1)} KiB)`);
  }

  extensions.sort((left, right) => left.id.localeCompare(right.id));

  const registry = {
    version: 1,
    generatedAt: new Date().toISOString(),
    extensions,
  };
  await writeFile(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`wrote registry.json with ${extensions.length} extension${extensions.length === 1 ? "" : "s"}`);
}

main().catch((err) => {
  console.error(`registry build failed: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});