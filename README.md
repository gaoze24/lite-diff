# Lite Diff

A lightweight, dependency-free text diff tool that runs entirely in the browser. No build step — the `site/` folder is the whole app (~40 KB unminified).

- Side-by-side and unified views, with word- or character-level highlights inside changed lines (CJK split per character)
- Ignore whitespace / ignore case, fold unchanged regions, jump between changes (`j` / `k`)
- Open or drag in files (drop two at once to fill both sides); UTF-8 with GB18030 fallback
- Copy or download the result as a unified diff that `git apply` accepts
- Share link: both texts are deflate-compressed into the URL fragment (`#d=…`), which browsers never send to the server

Nothing is uploaded. The only things stored are view preferences (`localStorage`) and the current draft for this tab (`sessionStorage`).

## Run locally

ES modules don't load from `file://`, so serve the folder:

```sh
npm run dev   # python3 -m http.server 8000 -d site
```

Then open http://localhost:8000.

## Tests

```sh
npm test
```

The diff is checked against a brute-force LCS on random inputs for minimality, and patches are round-tripped.

## Deploy to GitHub Pages

1. Push this repo to GitHub on the `main` branch.
2. In the repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` runs the tests and publishes `site/` on every push to `main`.

## How it works

`site/diff.js` implements Myers' O(ND) diff in its linear-space (middle-snake) form. Lines are interned to integers, and lines that appear on only one side are marked up front, since they can't be part of any common subsequence. A 2-second budget guards pathological inputs: past it, the remaining region is reported as a whole replacement and the UI says the result may not be minimal.
