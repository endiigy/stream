# stream

A static [GitHub Pages](https://pages.github.com/) app that plays a podcast from a feed URL you provide. Nothing is hardcoded: paste a feed, load its episodes, and listen in the browser.

## Pages

The site is `index.html` at the repository root. After the first push to `main`:

1. Open **Settings → Pages**.
2. Set the source to **Deploy from a branch**.
3. Choose the `main` branch and the `/ (root)` folder.

The site is then published at `https://endiigy.github.io/stream/`.

## Local preview

Open `index.html` in a browser, or serve the folder:

```powershell
python -m http.server 8080
```

Then visit `http://localhost:8080`.
