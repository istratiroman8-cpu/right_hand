# Roman — Task Manager

Task manager personale per studio universitario e mediazione creditizia. App web progressiva (PWA), zero server, dati in `localStorage`.

---

## Struttura repository

```
/
├── index.html       ← app principale
├── manifest.json    ← manifest PWA (installazione su homescreen)
├── sw.js            ← service worker (offline support)
├── 404.html         ← redirect per GitHub Pages
├── _config.yml      ← config GitHub Pages (disabilita Jekyll)
└── README.md
```

> **Nota:** le icone PWA sono opzionali. Se vuoi aggiungerle, crea una cartella `icons/` con `icon-192.png` e `icon-512.png`.

---

## Deploy su GitHub Pages (5 minuti)

### 1. Crea il repository

Vai su https://github.com/new e crea un repo pubblico, ad esempio `roman-tasks`.

### 2. Carica i file

**Via interfaccia web:**
1. Apri il repo appena creato
2. Clicca Add file → Upload files
3. Trascina tutti i file di questa cartella
4. Clicca Commit changes

**Via Git (terminale):**
```bash
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/TUO_USERNAME/roman-tasks.git
git push -u origin main
```

### 3. Attiva GitHub Pages

1. Vai su Settings (tab in alto nel repo)
2. Sezione Pages nel menu laterale sinistro
3. Source: seleziona Deploy from a branch
4. Branch: main / root
5. Clicca Save

### 4. Accedi all'app

Dopo 1-2 minuti l'app sarà disponibile su:
```
https://TUO_USERNAME.github.io/roman-tasks/
```

---

## Installa come app (PWA)

### iOS (Safari)
1. Apri l'URL in Safari
2. Tocca il pulsante Condividi
3. Seleziona Aggiungi a schermata Home

### Android (Chrome)
1. Apri l'URL in Chrome
2. Tocca i tre puntini in alto a destra
3. Seleziona Aggiungi a schermata Home

### Desktop (Chrome/Edge)
1. Apri l'URL
2. Clicca sull'icona di installazione nella barra degli indirizzi
3. Clicca Installa

---

## Aggiornare l'app

Modifica index.html, fai commit e push. GitHub Pages si aggiorna automaticamente. Per forzare l'aggiornamento sui dispositivi con app installata, aggiorna il numero di versione in sw.js (CACHE_NAME = 'roman-tasks-v2').

---

*Roman Task Manager · Studio & Credito*
