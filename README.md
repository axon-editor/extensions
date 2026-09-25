# Axon Extensions

Community extension packages for [Axon](https://github.com/axon-editor/axon), served to the editor through a hosted `registry.json`.

The editor fetches this index over HTTPS, downloads each `download` entry's zip package, verifies the published sha256 while streaming, and only unpacks it after the archive checksum and the `axon.extension.json` manifest id both match the registry entry.

## Layout

```
extensions/
  <id>/                     one folder per package
    axon.extension.json     required manifest (id matches the folder)
    webview/                optional assets served by an editor tab
    themes/                 optional theme contributions
dist/
  <id>-<version>.zip        generated packages (committed, served via raw.githubusercontent.com)
registry.json               generated index (committed)
tools/
  build-registry.mjs        the generator
```

## Adding an extension

1. Create `extensions/<id>/axon.extension.json` with at least `id`, `name`, `publisher`, and `version`.
2. Add any assets the extension needs (game/tooling webviews, themes, icons).
3. Regenerate the packaged artifacts:

   ```sh
   npm install && npm run build:registry
   ```

4. Commit the manifest, the generated `dist/` zips, and the regenerated `registry.json`.

Packages are pinned by content: `registry.json` stores each archive's sha256, so the editor refuses to install a package that does not hash to the published digest. The `packageUrl` uses `raw.githubusercontent.com`, which the editor allowlists for registry and package downloads.

## Layout of `registry.json`

```json
{
  "version": 1,
  "generatedAt": "2026-09-25T00:00:00.000Z",
  "extensions": [
    {
      "id": "axon.snake",
      "name": "Snake",
      "publisher": "axon",
      "version": "1.0.0",
      "kind": "view",
      "source": "marketplace",
      "installMode": "download",
      "packageUrl": "https://raw.githubusercontent.com/axon-editor/extensions/main/dist/axon.snake-1.0.0.zip",
      "sha256": "…",
      "size": 12345
    }
  ]
}
```