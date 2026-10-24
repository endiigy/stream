# stream

Wavecast is a static GitHub Pages podcast player. Paste any feed URL, or open `?feed=` with one, and the episodes play in the browser. Feeds are stored in this browser only. None are built into the site.

## Use it

1. Open the page and choose the search icon.
2. Paste a podcast RSS URL and add it.
3. Play from the episode list. Back skips 15 seconds, forward skips 30, and the speed control cycles the rate.
4. Podcasts, Episodes, and Saved switch the library. The bookmark on an episode keeps it in Saved.
5. The share icon copies a link that reopens the current feed.

The feed file has to be readable from the browser. Audio files are played directly from the enclosure URL.

## Pages

`index.html` is the site root. In **Settings → Pages**, deploy the `main` branch from `/ (root)`. The site is published at `https://endiigy.github.io/stream/`.

## Local preview

```powershell
python -m http.server 8080
```

Open `http://localhost:8080`.
