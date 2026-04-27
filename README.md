# Roman Task Manager — v4.0

PWA task manager per sociologia Sapienza e mediatori creditizi.  
Stack: HTML · CSS · JetBrains Mono · Vanilla JS · localStorage · Service Worker

---

## Deploy su GitHub Pages

1. Crea un repository pubblico su GitHub (es. `roman-tasks`)
2. Carica **tutti i file** nella root del repo (inclusa la cartella `icons/`)
3. Vai in **Settings → Pages → Source: Deploy from branch → main / root**
4. Attendi ~60 secondi → `https://tuousername.github.io/roman-tasks/`

---

## Installazione su iPhone (PWA)

1. Apri l'URL in **Safari** (non Chrome)
2. Tocca **Condividi** (rettangolo con freccia)
3. Scorri → **"Aggiungi alla schermata Home"**
4. Conferma → l'app appare come icona nativa senza barra Safari

---

## Struttura file

```
/
├── index.html          ← shell HTML, layout, markup
├── app.js              ← tutta la logica JS (nessun inline handler)
├── sw.js               ← Service Worker (cache-first, offline)
├── manifest.json       ← PWA manifest
├── README.md
└── icons/
    ├── icon-180.png    ← apple-touch-icon (iOS home screen)
    ├── icon-192.png    ← Android / PWA
    ├── icon-512.png    ← splash / store
    └── icon-152.png    ← iPad
```

---

## Sezioni

| Sezione | Descrizione |
|---------|-------------|
| **Home** | Tutte le task, ricerca, ordinamento, stats |
| **Università** | Filtro categoria `university`, progress bar |
| **Mediazione** | Filtro `credit` + calcolatore DSR/PTI/LTV integrato |
| **Pomodoro** | Timer 25/5/15 min, ring SVG, streak, beep |
| **Impostazioni** | Tema dark/light/auto, notifiche, auto-delete, export/import |

## Scorciatoie tastiera (desktop)

| Tasto | Azione |
|-------|--------|
| `Ctrl+N` | Nuova task |
| `Ctrl+F` | Focus ricerca |
| `Ctrl+1-4` | Cambia sezione |
| `Ctrl+Enter` | Salva modal aperto |
| `Esc` | Chiudi modal / drawer |
| `↑ ↓` | Naviga task |
| `Enter` | Apri task selezionata |
| `Delete` | Elimina task selezionata |

---

## Changelog

- **v4.0** — Refactor completo: JetBrains Mono, stile minimal b/n, zero inline handlers, event delegation, ES5-safe, iOS safe areas, dark/light auto, drag & drop, snooze, auto-delete, export JSON/PDF, calcolatore creditizio integrato
- **v3.4** (Roman originale) — Base features, DM Mono/Syne, multi-accent, icon picker
