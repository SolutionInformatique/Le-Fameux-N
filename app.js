"use strict";

// Le fameux N : dit si un produit appartient au groupe Nestlé.
// La liste des marques vit dans marques-nestle.json (à mettre à jour sans toucher au code).

const OFF_FIELDS = "code,product_name,product_name_fr,brands,brands_tags,brand_owner,owner,image_front_small_url";
const BARCODE_RE = /^\d{8,14}$/;

const $ = (sel) => document.querySelector(sel);
const resultEl = $("#result");

let data = { marques: [], proprietaires: [] };
let terms = []; // [{ norm, compact, exact, marque }] trié du plus long au plus court
let formerTerms = []; // anciennes marques Nestlé (vendues)
let scanner = null;

// ---------- Normalisation & correspondance ----------

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[a-z]{2}:/, "")       // préfixe de langue des tags Open Food Facts (« fr:nestle »)
    .replace(/[^\p{L}\p{N}]+/gu, " ") // garde les lettres non latines (Делта, Δέλτα)
    .trim();
}

function termsOf(list) {
  const out = [];
  for (const m of list) {
    for (const t of [m.nom, ...(m.alias || [])]) {
      const n = norm(t.replace(/\(.*\)/, "")); // « Mövenpick (glaces) » → « movenpick »
      if (n) out.push({ norm: n, compact: n.replace(/ /g, ""), exact: !!m.exact, marque: m });
    }
  }
  return out.sort((a, b) => b.norm.length - a.norm.length);
}

function buildTerms() {
  terms = termsOf(data.marques);
  formerTerms = termsOf(data.anciennes || []);
}

// Une marque « exact » ne correspond qu'à l'identique (évite que « Lion » attrape « Lion d'Or »),
// les autres correspondent aussi si elles apparaissent comme mots entiers (« Nescafé Gold »).
function termMatches(text, t) {
  if (text === t.norm || text.replace(/ /g, "") === t.compact) return true;
  return !t.exact && (" " + text + " ").includes(" " + t.norm + " ");
}

// Les marques « ambigu » portent un nom courant (« Tango », « Club »…) : sur un produit scanné,
// elles ne comptent que si Nestlé apparaît aussi comme propriétaire.
function findBrand(texts, allowAmbigu = true, list = terms) {
  for (const t of list) {
    if (t.marque.ambigu && !allowAmbigu) continue;
    for (const text of texts) {
      if (text && termMatches(text, t)) return { marque: t.marque, source: text };
    }
  }
  return null;
}

function findFormer(texts) {
  const hit = findBrand(texts, true, formerTerms);
  return hit && hit.marque;
}

function findOwner(texts) {
  for (const p of data.proprietaires) {
    for (const k of p.motsCles) {
      const kn = norm(k);
      if (texts.some((t) => (" " + t + " ").includes(" " + kn + " "))) return p;
    }
  }
  return null;
}

// ---------- Open Food Facts ----------

async function lookupBarcode(code) {
  showLoading("Recherche du produit…", code);
  let product;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`);
    if (res.status === 404) product = null;
    else if (!res.ok) throw new Error("HTTP " + res.status);
    else {
      const json = await res.json();
      product = json.status === 1 ? json.product : null;
    }
  } catch (err) {
    showUnknown({
      title: "Pas de connexion",
      sub: "Impossible de joindre Open Food Facts.",
      extra: `<p class="note">Vérifiez votre connexion et réessayez, ou tapez la marque à la main.</p>`,
      actions: [{ label: "Réessayer", onClick: () => lookupBarcode(code) }],
    });
    return;
  }

  if (!product) {
    showUnknown({
      title: "Produit inconnu",
      sub: `Le code ${code} n'est pas dans Open Food Facts.`,
      extra: `<p class="note">Tapez la marque inscrite sur l'emballage dans le champ de recherche.</p>`,
      actions: [
        { label: "Taper la marque", onClick: focusSearch },
        { label: "Ajouter le produit à Open Food Facts", href: `https://world.openfoodfacts.org/cgi/product.pl?type=search_or_add&action=process&code=${code}` },
      ],
    });
    return;
  }

  const brands = (product.brands || "").split(",").map((b) => b.trim()).filter(Boolean);
  const texts = [
    ...brands.map(norm),
    ...(product.brands_tags || []).map(norm),
    norm(product.brand_owner),
    norm((product.owner || "").replace(/^org-/, "")),
  ].filter(Boolean);

  const owner = findOwner(texts);
  const hit = findBrand(texts, !!owner);
  const info = {
    code,
    name: product.product_name_fr || product.product_name || "Produit sans nom",
    brands: brands.join(", ") || "Marque non renseignée",
    image: product.image_front_small_url,
    owner: product.brand_owner,
  };

  if (hit && hit.marque.partiel) showMaybe(info, hit.marque);
  else if (hit) showNestle(info, hit.marque);
  else if (owner) showNestle(info, ownerAsMarque(owner), true);
  else if (!brands.length && !product.brand_owner) {
    showUnknown({
      title: "Marque inconnue",
      sub: "La marque n'est pas renseignée pour ce produit.",
      product: info,
      actions: [{ label: "Taper la marque", onClick: focusSearch }],
    });
  } else showClean(info, [], findFormer(texts));
}

// ---------- Recherche manuelle ----------

function searchBrand(query) {
  const q = norm(query);
  if (!q) return;
  if (BARCODE_RE.test(query.replace(/\s/g, ""))) return lookupBarcode(query.replace(/\s/g, ""));

  const hit = findBrand([q]) || matchOwnerAsBrand(q);
  if (hit && (hit.marque.partiel || hit.marque.ambigu)) return showMaybe({ query }, hit.marque);
  if (hit) return showNestle({ query }, hit.marque);

  const former = findFormer([q]);
  if (former) return showClean({ query }, [], former);

  // Pas de correspondance : une faute de frappe (« Vitel ») ne doit pas donner un faux « non »
  const qc = q.replace(/ /g, "");
  const close = [...new Set(
    terms.filter((t) => !t.marque.ambigu && qc.length >= 4 && distance(qc, t.compact) <= (qc.length >= 7 ? 2 : 1))
      .map((t) => t.marque.nom)
  )].slice(0, 6);
  if (close.length) {
    showUnknown({
      title: "Vous vouliez dire… ?",
      sub: `« ${query} » ressemble à une marque Nestlé`,
      extra: chipsHtml(close),
    });
    return;
  }

  // Sinon, proposer les marques qui commencent pareil
  const suggestions = [...new Set(
    terms.filter((t) => q.length >= 2 && (t.norm.startsWith(q) || t.compact.startsWith(qc))).map((t) => t.marque.nom)
  )].slice(0, 6);
  showClean({ query }, suggestions);
}

// Distance de Levenshtein (nombre de lettres à changer)
function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function chipsHtml(names) {
  return `<div class="suggest">${names.map((s) => `<button class="chip" type="button" data-brand="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
}

function matchOwnerAsBrand(q) {
  const p = findOwner([q]);
  return p ? { marque: ownerAsMarque(p) } : null;
}

function ownerAsMarque(p) {
  return { nom: p.nom, categorie: "Propriétaire", note: p.note, alternatives: p.alternatives };
}

// ---------- Affichage ----------

const ICONS = {
  nestle: `<svg class="verdict-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 8l8 8M16 8l-8 8"/></svg>`,
  clean: `<svg class="verdict-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>`,
  maybe: `<svg class="verdict-icon" viewBox="0 0 24 24"><path d="M12 3 2.5 20h19z"/><path d="M12 10v4.5M12 17.3v.2"/></svg>`,
  unknown: `<svg class="verdict-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.3v.2"/></svg>`,
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function productHtml(p) {
  if (!p || !p.name) return "";
  const img = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<div class="product">${img}<div>
    <p class="product-name">${esc(p.name)}</p>
    <p class="product-brand">${esc(p.brands)}${p.code ? ` · ${esc(p.code)}` : ""}</p>
  </div></div>`;
}

function render(kind, { title, sub, body = "", actions = [] }) {
  if (kind === "nestle") startFlames();
  else stopFlames();
  resultEl.innerHTML = `<article class="verdict verdict--${kind}">
    <div class="verdict-head">${kind === "loading" ? `<div class="spinner"></div>` : ICONS[kind]}
      <p class="verdict-title">${esc(title)}</p>
      ${sub ? `<p class="verdict-sub">${esc(sub)}</p>` : ""}
    </div>
    ${body || actions.length ? `<div class="verdict-body">${body}<div class="verdict-links"></div></div>` : ""}
  </article>`;
  const links = resultEl.querySelector(".verdict-links");
  for (const a of actions) {
    const el = document.createElement(a.href ? "a" : "button");
    el.textContent = a.label;
    if (a.href) Object.assign(el, { href: a.href, target: "_blank", rel: "noopener" });
    else { el.type = "button"; el.addEventListener("click", a.onClick); }
    links.appendChild(el);
  }
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function offLink(p) {
  return p && p.code ? [{ label: "Voir sur Open Food Facts", href: `https://world.openfoodfacts.org/product/${p.code}` }] : [];
}

// Bouton « Signaler » : ouvre un ticket GitHub pré-rempli avec ce que l'app a affiché
function reportAction(label, verdict, p, marque) {
  if (!window.lienSignalement) return [];
  const sujet = p.query || p.name || p.code || "";
  const lignes = [
    `**Résultat affiché** : ${verdict}`,
    p.query ? `**Recherche** : ${p.query}` : "",
    p.code ? `**Code-barres** : ${p.code}` : "",
    p.name ? `**Produit** : ${p.name}` : "",
    p.brands ? `**Marques indiquées** : ${p.brands}` : "",
    marque ? `**Marque reconnue par l'app** : ${marque.nom}` : "",
    "",
    "**Ce qui est faux, ou la marque qui manque** :",
    "",
    "**Source qui le prouve (lien)** :",
    "",
  ].filter((l, i, all) => l !== "" || all[i - 1] !== "");
  return [{ label, href: window.lienSignalement(`${label} : ${sujet}`, lignes.join("\n")) }];
}

function showLoading(title, sub) {
  render("loading", { title, sub });
}

function showNestle(p, marque, viaOwner) {
  buzz([80, 60, 80]);
  const why = viaOwner
    ? `Propriétaire : <strong>${esc(p.owner || marque.nom)}</strong>`
    : `Marque Nestlé : <strong>${esc(marque.nom)}</strong> ${detailHtml(marque)}`;
  render("nestle", {
    title: "Oui, c'est Nestlé",
    sub: p.query ? `« ${p.query} » fait partie du groupe` : "Ce produit fait partie du groupe",
    body: productHtml(p) + `<p class="match">${why}</p>` + (marque.note ? `<p class="note">${esc(marque.note)}</p>` : "")
      + alternativesHtml(marque),
    actions: [...offLink(p), ...reportAction("Signaler une erreur", "Oui, c'est Nestlé", p, marque)],
  });
}

// Orange : marque Nestlé seulement dans certains pays ou sous licence, ou nom porté par plusieurs marques
function showMaybe(p, marque) {
  buzz([60, 40, 60]);
  const homonyme = marque.ambigu && !marque.partiel
    ? `<p class="note">Plusieurs marques portent ce nom. ${marque.pays ? `Celle de Nestlé est vendue dans ce(s) pays : ${esc(marque.pays)}.` : "Seule l'une d'elles appartient à Nestlé."} Vérifiez le nom du fabricant sur l'emballage.</p>`
    : "";
  render("maybe", {
    title: "Ça dépend",
    sub: p.query ? `« ${p.query} » n'est Nestlé que dans certains cas` : "Ce produit n'est Nestlé que dans certains cas",
    body: productHtml(p) + `<p class="match">Marque concernée : <strong>${esc(marque.nom)}</strong> ${detailHtml(marque)}</p>`
      + homonyme + (marque.note ? `<p class="note">${esc(marque.note)}</p>` : "") + alternativesHtml(marque),
    actions: [...offLink(p), ...reportAction("Signaler une erreur", "Ça dépend", p, marque)],
  });
}

function detailHtml(marque) {
  const d = [marque.categorie, marque.pays].filter(Boolean).join(" · ");
  return d ? `<span class="note">(${esc(d)})</span>` : "";
}

function alternativesHtml(marque) {
  const byCat = (data.alternativesParCategorie || {})[marque.categorie];
  const alts = (marque.alternatives && marque.alternatives.length ? marque.alternatives : byCat || data.alternativesParDefaut || []).slice(0, 2);
  if (!alts.length) return "";
  const conseil = (data.conseilsAlternatives || {})[marque.categorie];
  return `<div class="alts">
    <p class="alts-title">Deux alternatives hors Nestlé</p>
    <ul class="alts-list">${alts.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
    ${conseil ? `<p class="note">${esc(conseil)}</p>` : ""}
  </div>`;
}

function showClean(p, suggestions = [], former = null) {
  buzz(40);
  confetti();
  const sugg = suggestions.length
    ? `<p class="note">Vous pensiez peut-être à une de ces marques Nestlé :</p>${chipsHtml(suggestions)}`
    : "";
  const formerHtml = former
    ? `<p class="match">Ancienne marque Nestlé : <strong>${esc(former.nom)}</strong></p>` + (former.note ? `<p class="note">${esc(former.note)}</p>` : "")
    : "";
  render("clean", {
    title: "Non, pas Nestlé",
    sub: former ? "Ce n'est plus Nestlé aujourd'hui" : p.query ? `« ${p.query} » n'est pas dans la liste` : "Aucune marque Nestlé détectée",
    body: productHtml(p) + formerHtml + sugg + `<p class="note">D'après notre liste de marques du groupe Nestlé.</p>`,
    actions: [...offLink(p), ...reportAction("C'est Nestlé ? Signaler une marque manquante", "Non, pas Nestlé", p, former)],
  });
}

function showUnknown({ title, sub, extra = "", product, actions = [] }) {
  render("unknown", { title, sub, body: productHtml(product) + extra, actions: [...actions, ...offLink(product)] });
}

// Pluie de confettis pour fêter un produit qui n'est pas Nestlé (désactivée si l'utilisateur limite les animations)
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll(".confetti").forEach((c) => c.remove());
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = (canvas.width = innerWidth * dpr);
  const h = (canvas.height = innerHeight * dpr);
  const colors = ["#2fd18b", "#2e7d4f", "#f6c445", "#ff6b6b", "#5b8def", "#fbf8f1"];
  const pieces = Array.from({ length: 160 }, (_, i) => {
    const fromLeft = i % 2 === 0; // deux canons, un de chaque côté
    return {
      x: fromLeft ? 0 : w,
      y: h * 0.75,
      vx: (fromLeft ? 1 : -1) * (6 + Math.random() * 10) * dpr,
      vy: -(14 + Math.random() * 12) * dpr,
      size: (6 + Math.random() * 6) * dpr,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      color: colors[i % colors.length],
      round: Math.random() < 0.3,
    };
  });
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of pieces) {
      p.vy += 0.45 * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.spin;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2200) / 600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < 2800) requestAnimationFrame(frame);
    else canvas.remove();
  })(start);
}

// Mur de flammes (image fixe) du bas de l'écran jusqu'au milieu, tant qu'un résultat Nestlé est affiché
function startFlames() {
  let el = document.querySelector(".flames");
  if (!el) {
    el = document.createElement("div");
    el.className = "flames";
    el.setAttribute("aria-hidden", "true");
    document.body.prepend(el);
  }
  el.classList.add("flames--on");
}

function stopFlames() {
  const el = document.querySelector(".flames");
  if (el) el.classList.remove("flames--on");
}

function buzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function focusSearch() {
  const input = $("#search-input");
  input.focus();
  input.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ---------- Scanner ----------

function scannerConfig() {
  const F = Html5QrcodeSupportedFormats;
  return {
    formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false,
  };
}

async function startScan() {
  if (typeof Html5Qrcode === "undefined") {
    showUnknown({ title: "Scanner indisponible", sub: "La librairie de scan n'a pas pu se charger.", actions: [{ label: "Taper la marque", onClick: focusSearch }] });
    return;
  }
  $("#scanner").hidden = false;
  resultEl.innerHTML = "";
  $("#btn-scan").disabled = true;
  scanner = scanner || new Html5Qrcode("reader", scannerConfig());
  try {
    await scanner.start(
      { facingMode: "environment" },
      {
        fps: 12,
        qrbox: (w, h) => ({ width: Math.floor(Math.min(w * 0.85, 360)), height: Math.floor(Math.min(h * 0.5, 160)) }),
        aspectRatio: 1.333,
      },
      onScan,
      () => {} // pas de code dans l'image : on continue
    );
    $("#scanner").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    await stopScan();
    const denied = /permission|notallowed/i.test(String(err && (err.name || err)));
    showUnknown({
      title: "Caméra inaccessible",
      sub: denied ? "L'accès à la caméra a été refusé." : "Impossible de démarrer la caméra.",
      extra: `<p class="note">${denied
        ? "Autorisez la caméra dans les réglages du navigateur (sur iPhone : Réglages › Safari › Caméra)."
        : "Essayez « Depuis une photo » ou tapez la marque."}</p>`,
      actions: [{ label: "Taper la marque", onClick: focusSearch }],
    });
  }
}

async function stopScan() {
  if (scanner && scanner.isScanning) {
    try { await scanner.stop(); } catch (_) { /* déjà arrêté */ }
  }
  $("#scanner").hidden = true;
  $("#btn-scan").disabled = false;
}

async function onScan(code) {
  if (!BARCODE_RE.test(code)) return;
  await stopScan();
  lookupBarcode(code);
}

async function scanPhoto(file) {
  if (!file) return;
  await stopScan();
  showLoading("Lecture de la photo…");
  try {
    const fileScanner = new Html5Qrcode("photo-reader", scannerConfig());
    const code = await fileScanner.scanFile(file, false);
    lookupBarcode(code);
  } catch (_) {
    showUnknown({
      title: "Code illisible",
      sub: "Aucun code-barres trouvé sur la photo.",
      extra: `<p class="note">Prenez la photo bien à plat, nette et en gros plan.</p>`,
      actions: [{ label: "Taper la marque", onClick: focusSearch }],
    });
  }
}

// ---------- Liste des marques ----------

function renderBrandList(filter = "") {
  const f = norm(filter);
  const groups = {};
  for (const m of data.marques) {
    if (f && !norm(m.nom).includes(f) && !(m.alias || []).some((a) => norm(a).includes(f))) continue;
    (groups[m.categorie] = groups[m.categorie] || []).push(m);
  }
  const former = (data.anciennes || []).filter((m) => !f || norm(m.nom).includes(f));
  if (former.length) groups["Anciennes marques (plus Nestlé)"] = former;
  $("#brand-groups").innerHTML = Object.entries(groups).map(([cat, list]) => `
    <div class="brand-group"><h3>${esc(cat)}</h3><div class="chips">${
      list.map((m) => {
        const title = [m.pays, m.note].filter(Boolean).join(" · ");
        return `<button class="chip" type="button" data-brand="${esc(m.nom)}"${m.note || m.partiel || m.ambigu ? " data-note" : ""}${title ? ` title="${esc(title)}"` : ""}>${esc(m.nom)}</button>`;
      }).join("")
    }</div></div>`).join("") || `<p class="note">Aucune marque ne correspond.</p>`;
}

// ---------- Démarrage ----------

async function init() {
  try {
    const res = await fetch("./marques-nestle.json", { cache: "no-cache" });
    data = await res.json();
  } catch (err) {
    showUnknown({ title: "Liste introuvable", sub: "Impossible de charger la liste des marques Nestlé." });
    return;
  }
  buildTerms();

  $("#brand-list").innerHTML = data.marques.map((m) => `<option value="${esc(m.nom)}">`).join("");
  $("#brand-count").textContent = `(${data.marques.length})`;
  if (data.miseAJour) {
    const d = new Date(data.miseAJour + "T12:00:00");
    $("#list-date").textContent = `Liste de marques mise à jour le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.`;
  }
  renderBrandList();

  $("#report-link").href = window.lienSignalement(
    "Signalement",
    "**Type** : erreur / marque manquante / autre\n\n**Marque ou produit concerné** :\n\n**Ce qui est faux, ou la marque qui manque** :\n\n**Source qui le prouve (lien)** :\n"
  );

  // Code-barres passé dans l'URL : ?code=3017620422003
  const code = new URLSearchParams(location.search).get("code");
  if (code && BARCODE_RE.test(code)) lookupBarcode(code);
}

$("#btn-scan").addEventListener("click", startScan);
$("#btn-stop").addEventListener("click", stopScan);
$("#photo-input").addEventListener("change", (e) => { scanPhoto(e.target.files[0]); e.target.value = ""; });
$("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  stopScan();
  searchBrand($("#search-input").value.trim());
  $("#search-input").blur();
});
$("#brand-filter").addEventListener("input", (e) => renderBrandList(e.target.value));
document.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-brand]");
  if (!chip) return;
  $("#search-input").value = chip.dataset.brand;
  searchBrand(chip.dataset.brand);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

init();
