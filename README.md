# 📏 Maßband-Challenge V3

Verwaltungs-App für die Maßband-Challenge — trackt Strafen, zeigt ein Leaderboard und synchronisiert alles live über Firebase Firestore.

## Setup

### 1. Repository klonen & Abhängigkeiten installieren

```bash
git clone https://github.com/DEIN-USERNAME/massband-challenge.git
cd massband-challenge
npm install
```

### 2. Firebase-Konfiguration

Erstelle eine `.env`-Datei im Projektroot (Vorlage: `.env.example`):

```bash
cp .env.example .env
```

Trage deine Firebase-Werte ein:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=dein-projekt.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dein-projekt-id
VITE_FIREBASE_STORAGE_BUCKET=dein-projekt.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

> ⚠️ Die `.env`-Datei ist in `.gitignore` — sie wird **nicht** auf GitHub hochgeladen.

### 3. Klassenliste anpassen

Die Datei `data/jahrgangsliste.csv` enthält einen Namen pro Zeile.  
Einfach bearbeiten — wird beim Chat-Import als Matching-Basis verwendet.

```
Karl Absmaier
Lenny Achatz
...
```

### 4. Entwicklungsserver starten

```bash
npm run dev
```

App läuft auf [http://localhost:5174](http://localhost:5174)

### 5. Für Produktion bauen

```bash
npm run build
```

Der `dist/`-Ordner kann auf GitHub Pages, Netlify, Vercel o.ä. deployed werden.

---

## Projektstruktur

```
massband-challenge/
├── data/
│   └── jahrgangsliste.csv     ← Klassenliste (ein Name pro Zeile)
├── public/
│   └── favicon.svg
├── src/
│   ├── lib/
│   │   ├── firebase.js        ← Firebase-Initialisierung
│   │   ├── matcher.js         ← Fuzzy-Name-Matching (Levenshtein)
│   │   ├── parser.js          ← WhatsApp-Chat-Parser
│   │   └── studentList.js     ← CSV-Loader
│   ├── main.js                ← App-Logik & Event-Binding
│   └── style.css              ← Styles
├── index.html                 ← Einstiegspunkt
├── vite.config.js
├── .env                       ← Firebase-Keys (nicht in Git!)
├── .env.example               ← Vorlage
└── package.json
```

## Admin-Bereich

Standard-Passwort: **`admin123`**  
Ändern unter: Admin → Einstellungen → Passwort ändern

## Features

- 🔥 **Firestore-Sync** — alle Daten live, kein localStorage
- 📋 **Leere Bestenliste** — wird erst durch Import befüllt
- 📤 **WhatsApp-Import** — `.txt`-Export hochladen, Vorschau prüfen, importieren
- 🧠 **Fuzzy-Matching** — erkennt Spitznamen & Tippfehler automatisch
- 📚 **Lerneffekt** — bestätigte Matches werden gespeichert
- 👥 **Neue Personen** — Lehrer/Gäste im Admin hinzufügbar, danach beim Import erkannt
- 📒 **"Alle Buchungen"** — jeden Eintrag bearbeiten oder löschen
- 💰 **Zahlungen** — Bareinzahlungen direkt erfassen
