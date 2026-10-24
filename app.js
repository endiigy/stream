const STORAGE_KEY = "wavecast/v1";
const RATES = [0.8, 1, 1.2, 1.5, 1.8, 2];
const ICONS = {
  headphones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="3.5" y="12.5" width="4" height="7" rx="1.4"/><rect x="16.5" y="12.5" width="4" height="7" rx="1.4"/></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2-5"/><path d="M4.5 4.5V9H9"/></svg>`,
  forward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2-5"/><path d="M19.5 4.5V9H15"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zm13 .5L9.5 12 19 18.5z"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM5 5.5 14.5 12 5 18.5z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 5.8c0-.8.9-1.3 1.6-.9l9 5.2c.7.4.7 1.4 0 1.8l-9 5.2c-.7.4-1.6-.1-1.6-.9z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.2v14H7zm6.8 0H17v14h-3.2z"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.2L6 20V5.5a1 1 0 0 1 1-1z"/></svg>`,
  bookmarkOn: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5V21L12 17.6 3.5 21V5A1.5 1.5 0 0 1 5 3.5z"/></svg>`,
};

const state = {
  feeds: [],
  saved: [],
  positions: {},
  current: null,
  speed: 1,
  view: "episodes",
  filter: "",
  seeking: false,
  pendingSeek: null,
};

const $ = (id) => document.getElementById(id);
const audio = $("audio");

function icon(name) {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = ICONS[name];
  return span;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === false || value == null) continue;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value, location.href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch { /* ignore invalid urls */ }
  return "";
}

function normalizeFeedUrl(raw) {
  const url = new URL(String(raw).trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Use an http or https feed URL.");
  if (location.protocol === "https:" && url.protocol === "http:") url.protocol = "https:";
  url.hash = "";
  return url.href;
}

function episodeKey(episode) {
  return `${episode.feedUrl}\n${episode.guid}`;
}

function feedByUrl(url) {
  return state.feeds.find((feed) => feed.url === url) || null;
}

function allEpisodes() {
  return state.feeds
    .flatMap((feed) => feed.episodes.map((episode) => ({ ...episode, show: feed.title })))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

function currentEpisode() {
  if (!state.current) return null;
  return allEpisodes().find((episode) => episode.feedUrl === state.current.feedUrl && episode.guid === state.current.guid) || null;
}

function showEpisodes() {
  const feed = feedByUrl(state.current?.feedUrl);
  return feed?.episodes || [];
}

function adjacent(direction) {
  const episode = currentEpisode();
  if (!episode) return null;
  const list = showEpisodes();
  const index = list.findIndex((item) => item.guid === episode.guid);
  return list[index + direction] || null;
}

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.feeds = Array.isArray(data.feeds) ? data.feeds.filter((feed) => feed && typeof feed.url === "string" && Array.isArray(feed.episodes)) : [];
    for (const feed of state.feeds) {
      feed.episodes = feed.episodes.filter((episode) => episode && safeHttpUrl(episode.audio) && episode.guid);
    }
    state.saved = Array.isArray(data.saved) ? data.saved.filter((item) => typeof item === "string") : [];
    state.positions = data.positions && typeof data.positions === "object" ? data.positions : {};
    state.current = data.current && typeof data.current.feedUrl === "string" ? data.current : null;
    state.speed = RATES.includes(data.speed) ? data.speed : 1;
    state.view = ["podcasts", "episodes", "saved"].includes(data.view) ? data.view : "episodes";
    if (state.current && !currentEpisode()) state.current = null;
  } catch { /* keep the empty player */ }
}

function persist() {
  const { feeds, saved, positions, current, speed, view } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ feeds, saved, positions, current, speed, view }));
  } catch { /* private mode or a full disk can refuse storage */ }
}

function plain(value) {
  const doc = new DOMParser().parseFromString(value || "", "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function directChildren(parent, name) {
  return [...parent.getElementsByTagName(name)].filter((node) => node.parentElement === parent);
}

function childText(parent, name) {
  return (directChildren(parent, name)[0]?.textContent || "").trim();
}

function parseDuration(raw) {
  if (!raw) return 0;
  const value = raw.trim();
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function channelImage(channel) {
  return directChildren(channel, "itunes:image")[0]?.getAttribute("href")
    || childText(directChildren(channel, "image")[0] || channel, "url")
    || "";
}

function itemAudio(item) {
  const enclosures = directChildren(item, "enclosure");
  const match = enclosures.find((node) => {
    const url = node.getAttribute("url") || "";
    const type = node.getAttribute("type") || "";
    return type.startsWith("audio/") || /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(url);
  }) || enclosures[0];
  if (match?.getAttribute("url")) return match.getAttribute("url");
  const link = directChildren(item, "link").find((node) => (node.getAttribute("type") || "").startsWith("audio/") || node.getAttribute("rel") === "enclosure");
  return link?.getAttribute("href") || "";
}

function parseRss(channel, feedUrl) {
  const image = channelImage(channel);
  const episodes = directChildren(channel, "item").map((item) => {
    const audioUrl = safeHttpUrl(itemAudio(item));
    if (!audioUrl) return null;
    const date = Date.parse(childText(item, "pubDate"));
    return {
      feedUrl,
      guid: childText(item, "guid") || audioUrl,
      title: plain(childText(item, "title")) || "Untitled episode",
      description: plain(childText(item, "itunes:summary") || childText(item, "description")).slice(0, 600),
      date: Number.isNaN(date) ? "" : new Date(date).toISOString(),
      duration: parseDuration(childText(item, "itunes:duration")),
      audio: audioUrl,
      image: safeHttpUrl(directChildren(item, "itunes:image")[0]?.getAttribute("href") || image),
    };
  }).filter(Boolean);
  episodes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return {
    title: plain(childText(channel, "title")) || "Untitled podcast",
    description: plain(childText(channel, "description")).slice(0, 600),
    image: safeHttpUrl(image),
    episodes: episodes.slice(0, 200),
  };
}

function parseAtom(feed, feedUrl) {
  const image = channelImage(feed);
  const episodes = directChildren(feed, "entry").map((entry) => {
    const audioUrl = safeHttpUrl(itemAudio(entry));
    if (!audioUrl) return null;
    const date = Date.parse(childText(entry, "published") || childText(entry, "updated"));
    return {
      feedUrl,
      guid: childText(entry, "id") || audioUrl,
      title: plain(childText(entry, "title")) || "Untitled episode",
      description: plain(childText(entry, "summary") || childText(entry, "content")).slice(0, 600),
      date: Number.isNaN(date) ? "" : new Date(date).toISOString(),
      duration: parseDuration(childText(entry, "itunes:duration")),
      audio: audioUrl,
      image: safeHttpUrl(image),
    };
  }).filter(Boolean);
  episodes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return {
    title: plain(childText(feed, "title")) || "Untitled podcast",
    description: plain(childText(feed, "subtitle")).slice(0, 600),
    image: safeHttpUrl(image),
    episodes: episodes.slice(0, 200),
  };
}

function parseFeed(xml, feedUrl) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("That address did not return a podcast feed.");
  const channel = doc.querySelector("channel");
  const atom = doc.querySelector("feed");
  const parsed = channel ? parseRss(channel, feedUrl) : atom ? parseAtom(atom, feedUrl) : null;
  if (!parsed) throw new Error("That address did not return a podcast feed.");
  if (!parsed.episodes.length) throw new Error("That feed has no playable episodes.");
  return parsed;
}

async function fetchFeedXml(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The feed responded with ${response.status}.`);
    const text = await response.text();
    if (!/<(rss|feed)\b/i.test(text)) throw new Error("That address did not return a podcast feed.");
    return text;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("The browser could not read that feed. The host did not allow access from this site.");
    throw error;
  }
}

function upsertFeed(feed) {
  const index = state.feeds.findIndex((item) => item.url === feed.url);
  if (index >= 0) state.feeds[index] = feed;
  else state.feeds.push(feed);
}

function armAudio(episode) {
  const key = episodeKey(episode);
  if (audio.dataset.key === key) {
    audio.playbackRate = state.speed;
    return;
  }
  state.pendingSeek = null;
  audio.dataset.key = key;
  audio.src = episode.audio;
  audio.playbackRate = state.speed;
}

async function ingest(raw, select) {
  const url = normalizeFeedUrl(raw);
  const parsed = parseFeed(await fetchFeedXml(url), url);
  const feed = { ...parsed, url, fetchedAt: Date.now() };
  upsertFeed(feed);
  const missing = state.current && !currentEpisode();
  if (select || !state.current || missing) {
    const latest = feed.episodes[0];
    state.current = { feedUrl: url, guid: latest.guid };
    armAudio(latest);
  }
  if (select) {
    state.view = "episodes";
    state.filter = url;
  }
  persist();
  render();
}

function setStatus(message, kind = "") {
  const status = $("status");
  status.textContent = message || "";
  status.classList.toggle("is-error", kind === "error");
  status.dataset.kind = kind;
}

function toast(message) {
  const node = $("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;
  const clock = `${hours ? String(minutes).padStart(2, "0") : minutes}:${String(remain).padStart(2, "0")}`;
  return hours ? `${hours}:${clock}` : clock;
}

function formatMinutes(seconds) {
  if (!seconds) return "";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatSpeed(rate) {
  return `${Number.isInteger(rate) ? rate.toFixed(1) : rate}× speed`;
}

function usableDuration(episode) {
  if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.dataset.key === (episode ? episodeKey(episode) : "")) return audio.duration;
  return episode?.duration || 0;
}

function paintArt(container, src, small) {
  const safe = safeHttpUrl(src);
  const nextClass = small ? "art small" : "art";
  if (container.dataset.src === safe && container.className === nextClass && container.childElementCount) return;
  container.dataset.src = safe;
  container.className = nextClass;
  container.replaceChildren();
  if (!safe) {
    container.append(icon("headphones"));
    return;
  }
  const image = document.createElement("img");
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    container.dataset.src = "";
    container.replaceChildren(icon("headphones"));
  });
  image.src = safe;
  container.append(image);
}

function renderNow() {
  const episode = currentEpisode();
  const show = episode?.show || feedByUrl(episode?.feedUrl)?.title || "";
  $("ep-title").textContent = episode?.title || "Nothing playing";
  $("show-name").textContent = show || "Add a podcast feed";
  const minutes = formatMinutes(episode?.duration || (Number.isFinite(audio.duration) ? audio.duration : 0));
  $("ep-meta").textContent = [minutes, episode?.description || ""].filter(Boolean).join(" · ");
  paintArt($("art"), episode?.image || "", false);
  document.title = episode ? `${episode.title} — Wavecast` : "Wavecast";
  const playing = !audio.paused && !audio.ended;
  const play = $("play");
  play.setAttribute("aria-label", playing ? "Pause" : "Play");
  const iconName = playing ? "pause" : "play";
  if (play.dataset.icon !== iconName) {
    play.dataset.icon = iconName;
    play.replaceChildren(icon(iconName));
  }
  $("back").disabled = !episode;
  $("forward").disabled = !episode;
  $("prev").disabled = !episode || (!adjacent(-1) && audio.currentTime <= 3);
  $("next").disabled = !episode || !adjacent(1);
  $("speed").textContent = formatSpeed(state.speed);
  $("seek").disabled = !usableDuration(episode);
  renderTimes();
  updateMediaSession();
}

function renderTimes() {
  const episode = currentEpisode();
  const duration = usableDuration(episode);
  $("prev").disabled = !episode || (!adjacent(-1) && (audio.currentTime || 0) <= 3);
  const current = state.pendingSeek != null && audio.readyState < 1 ? state.pendingSeek : audio.currentTime || 0;
  $("time-now").textContent = formatClock(state.seeking ? (Number($("seek").value) / 1000) * duration : current);
  $("time-end").textContent = formatClock(duration);
  if (!state.seeking && duration) {
    const ratio = Math.min(1, Math.max(0, current / duration));
    $("seek").value = String(Math.round(ratio * 1000));
    $("seek").style.setProperty("--progress", `${ratio * 100}%`);
  }
}

function visibleEpisodes() {
  const episodes = allEpisodes();
  if (state.view === "saved") return episodes.filter((episode) => state.saved.includes(episodeKey(episode)));
  if (state.filter) return episodes.filter((episode) => episode.feedUrl === state.filter);
  return episodes;
}

function emptyState(title, copy) {
  return el("div", { class: "empty" },
    el("strong", {}, title),
    el("p", {}, copy),
    el("button", { class: "text-button", type: "button", onclick: openFeedDialog }, "Add a feed"));
}

function episodeRow(episode) {
  const current = currentEpisode();
  const key = episodeKey(episode);
  const saved = state.saved.includes(key);
  return el("div", { class: current && episodeKey(current) === key ? "row current" : "row" },
    el("button", {
      class: "episode-main",
      type: "button",
      onclick: () => onEpisode(episode),
    },
      artNode(episode.image),
      el("span", { class: "copy" },
        el("strong", {}, episode.title),
        el("em", {}, [episode.show, formatDate(episode.date), formatMinutes(episode.duration)].filter(Boolean).join(" · ")),
        episode.description ? el("p", {}, episode.description) : null)),
    el("button", {
      class: "bookmark",
      type: "button",
      "aria-label": saved ? "Remove from saved" : "Save episode",
      "aria-pressed": saved ? "true" : "false",
      onclick: () => toggleSaved(episode),
    }, icon(saved ? "bookmarkOn" : "bookmark")));
}

function artNode(src) {
  const node = el("span", { class: "art small" });
  paintArt(node, src, true);
  return node;
}

function renderLibrary() {
  for (const button of document.querySelectorAll(".view")) {
    button.setAttribute("aria-selected", button.dataset.view === state.view ? "true" : "false");
  }
  const body = $("library-body");
  body.replaceChildren();
  if (state.view === "podcasts") {
    if (!state.feeds.length) {
      body.append(emptyState("No podcasts yet.", "Add a feed URL to subscribe."));
      return;
    }
    const rows = el("div", { class: "rows" });
    for (const feed of [...state.feeds].sort((a, b) => a.title.localeCompare(b.title))) {
      const count = feed.episodes.length;
      rows.append(el("div", { class: "row" },
        el("button", { class: "episode-main", type: "button", onclick: () => openShow(feed.url) },
          artNode(feed.image),
          el("span", { class: "copy" },
            el("strong", {}, feed.title),
            el("em", {}, `${count} episode${count === 1 ? "" : "s"}`))),
        el("span", { class: "show-actions" },
          el("button", { class: "text-button", type: "button", onclick: () => refreshFeed(feed.url) }, "Refresh"),
          el("button", { class: "text-button danger", type: "button", onclick: () => removeFeed(feed) }, "Remove"))));
    }
    body.append(rows);
    return;
  }
  if (state.view === "episodes" && state.filter) {
    const feed = feedByUrl(state.filter);
    body.append(el("div", { class: "filter" },
      el("span", {}, feed?.title || "One podcast"),
      el("button", { class: "text-button", type: "button", onclick: () => { state.filter = ""; renderLibrary(); } }, "All podcasts")));
  }
  const episodes = visibleEpisodes();
  if (!episodes.length) {
    body.append(state.view === "saved"
      ? emptyState("Nothing saved.", "Bookmark an episode and it stays here.")
      : emptyState("No episodes yet.", "Add a feed URL to see the latest episodes."));
    return;
  }
  body.append(el("div", { class: "rows" }, episodes.map(episodeRow)));
}

function render() {
  renderNow();
  renderLibrary();
}

function onEpisode(episode) {
  const current = currentEpisode();
  if (current && episodeKey(current) === episodeKey(episode) && !audio.paused) audio.pause();
  else selectEpisode(episode, true);
}

function selectEpisode(episode, shouldPlay) {
  state.current = { feedUrl: episode.feedUrl, guid: episode.guid };
  armAudio(episode);
  persist();
  render();
  if (shouldPlay) {
    audio.play().catch(() => setStatus("Playback could not start.", "error"));
  }
}

function toggleSaved(episode) {
  const key = episodeKey(episode);
  state.saved = state.saved.includes(key) ? state.saved.filter((item) => item !== key) : [...state.saved, key];
  persist();
  renderLibrary();
}

function openShow(url) {
  state.view = "episodes";
  state.filter = url;
  if (!currentEpisode()) {
    const latest = feedByUrl(url)?.episodes[0];
    if (latest) {
      state.current = { feedUrl: url, guid: latest.guid };
      armAudio(latest);
    }
  }
  persist();
  render();
}

function removeFeed(feed) {
  if (!confirm(`Remove ${feed.title || "this podcast"}?`)) return;
  state.feeds = state.feeds.filter((item) => item.url !== feed.url);
  state.saved = state.saved.filter((key) => !key.startsWith(`${feed.url}\n`));
  if (state.filter === feed.url) state.filter = "";
  if (state.current?.feedUrl === feed.url) {
    audio.removeAttribute("src");
    delete audio.dataset.key;
    audio.load();
    const next = allEpisodes()[0];
    state.current = next ? { feedUrl: next.feedUrl, guid: next.guid } : null;
    if (next) armAudio(next);
  }
  persist();
  render();
}

async function refreshFeed(url) {
  setStatus("Refreshing…");
  try {
    await ingest(url, false);
    setStatus("");
    toast("Feed updated");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function seekTo(seconds) {
  const episode = currentEpisode();
  if (!episode) return;
  const duration = usableDuration(episode);
  const next = Math.max(0, duration ? Math.min(duration, seconds) : seconds);
  armAudio(episode);
  if (audio.readyState >= 1 && Number.isFinite(audio.duration)) audio.currentTime = next;
  else state.pendingSeek = next;
  renderTimes();
}

function playOrPause() {
  const episode = currentEpisode();
  if (!episode) {
    openFeedDialog();
    return;
  }
  if (audio.paused) selectEpisode(episode, true);
  else audio.pause();
}

function openFeedDialog() {
  $("feed-error").textContent = "";
  if (!$("feed-dialog").open) $("feed-dialog").showModal();
  $("feed-url").focus();
}

function updateMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const episode = currentEpisode();
  if (!episode) return;
  const artwork = episode.image ? [{ src: episode.image }] : [];
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: episode.title, artist: episode.show || "Wavecast", artwork });
  } catch { /* artwork from another site can be rejected */ }
  if (Number.isFinite(audio.duration)) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime || 0, audio.duration),
      });
    } catch { /* ignore while the duration is still settling */ }
  }
}

function bindMediaSession() {
  if (!("mediaSession" in navigator)) return;
  const set = (name, handler) => {
    try { navigator.mediaSession.setActionHandler(name, handler); } catch { /* this browser lacks the action */ }
  };
  set("play", () => playOrPause());
  set("pause", () => audio.pause());
  set("previoustrack", () => $("prev").click());
  set("nexttrack", () => $("next").click());
  set("seekbackward", (details) => seekTo((audio.currentTime || 0) - (details.seekOffset || 15)));
  set("seekforward", (details) => seekTo((audio.currentTime || 0) + (details.seekOffset || 30)));
  set("seekto", (details) => { if (details.seekTime != null) seekTo(details.seekTime); });
}

let lastPersist = 0;
function rememberPosition() {
  const episode = currentEpisode();
  if (!episode || !Number.isFinite(audio.currentTime)) return;
  state.positions[episodeKey(episode)] = audio.currentTime;
  persist();
}

function bind() {
  for (const button of document.querySelectorAll(".view")) {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.filter = "";
      persist();
      render();
    });
  }
  $("add-feed").addEventListener("click", openFeedDialog);
  $("feed-cancel").addEventListener("click", () => $("feed-dialog").close());
  $("feed-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = $("feed-submit");
    const error = $("feed-error");
    error.textContent = "";
    submit.disabled = true;
    submit.textContent = "Adding…";
    try {
      await ingest($("feed-url").value, true);
      $("feed-url").value = "";
      $("feed-dialog").close();
      setStatus("");
      toast("Podcast added");
    } catch (err) {
      error.textContent = err.message;
      error.classList.add("is-error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Add";
    }
  });
  $("share").addEventListener("click", shareLink);
  $("play").addEventListener("click", playOrPause);
  $("back").addEventListener("click", () => seekTo((audio.currentTime || 0) - 15));
  $("forward").addEventListener("click", () => seekTo((audio.currentTime || 0) + 30));
  $("prev").addEventListener("click", () => {
    if (audio.currentTime > 3) { seekTo(0); return; }
    const episode = adjacent(-1);
    if (episode) selectEpisode(episode, !audio.paused);
  });
  $("next").addEventListener("click", () => {
    const episode = adjacent(1);
    if (episode) selectEpisode(episode, !audio.paused);
  });
  $("speed").addEventListener("click", () => {
    const index = RATES.findIndex((rate) => Math.abs(rate - state.speed) < 0.01);
    state.speed = RATES[(index + 1) % RATES.length];
    audio.playbackRate = state.speed;
    persist();
    renderNow();
  });
  $("seek").addEventListener("input", () => {
    state.seeking = true;
    const duration = usableDuration(currentEpisode());
    const ratio = Number($("seek").value) / 1000;
    $("seek").style.setProperty("--progress", `${ratio * 100}%`);
    $("time-now").textContent = formatClock(ratio * duration);
  });
  $("seek").addEventListener("change", () => {
    const duration = usableDuration(currentEpisode());
    state.seeking = false;
    if (duration) seekTo((Number($("seek").value) / 1000) * duration);
  });
  audio.addEventListener("loadedmetadata", () => {
    const episode = currentEpisode();
    if (!episode) return;
    let target = state.pendingSeek;
    if (target == null) {
      const saved = state.positions[episodeKey(episode)] || 0;
      if (saved > 1 && saved < audio.duration - 1) target = saved;
    }
    state.pendingSeek = null;
    if (target != null && Number.isFinite(audio.duration)) audio.currentTime = Math.min(target, audio.duration);
    renderNow();
  });
  audio.addEventListener("timeupdate", () => {
    renderTimes();
    updateMediaSession();
    if (Date.now() - lastPersist > 2000) {
      lastPersist = Date.now();
      rememberPosition();
    }
  });
  audio.addEventListener("play", renderNow);
  audio.addEventListener("pause", () => { rememberPosition(); renderNow(); });
  audio.addEventListener("ended", () => {
    rememberPosition();
    const episode = adjacent(1);
    if (episode) selectEpisode(episode, true);
    else renderNow();
  });
  audio.addEventListener("error", () => {
    if (audio.getAttribute("src")) setStatus("The audio file could not be played.", "error");
  });
  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    const tag = event.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    event.preventDefault();
    playOrPause();
  });
  bindMediaSession();
}

async function shareLink() {
  const url = new URL(location.href);
  const feed = feedByUrl(state.current?.feedUrl) || state.feeds[0];
  if (feed) url.searchParams.set("feed", feed.url);
  else url.searchParams.delete("feed");
  try {
    await navigator.clipboard.writeText(url.href);
    toast("Link copied");
  } catch {
    setStatus("Could not copy the link.", "error");
  }
}

async function boot() {
  for (const id of ["back", "prev", "play", "next", "forward"]) {
    const names = { back: "back", prev: "prev", play: "play", next: "next", forward: "forward" };
    if (!$(id).childElementCount) $(id).append(icon(names[id]));
  }
  loadState();
  const episode = currentEpisode();
  if (episode) armAudio(episode);
  audio.playbackRate = state.speed;
  bind();
  render();
  const requested = new URLSearchParams(location.search).get("feed");
  if (requested) {
    $("feed-url").value = requested;
    setStatus("Loading feed…");
    try {
      await ingest(requested, true);
      setStatus("");
    } catch (error) {
      setStatus(error.message, "error");
    }
    return;
  }
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const feed of [...state.feeds]) {
    if (feed.fetchedAt > cutoff) continue;
    try { await ingest(feed.url, false); } catch (error) { setStatus(error.message, "error"); }
  }
}

boot();
