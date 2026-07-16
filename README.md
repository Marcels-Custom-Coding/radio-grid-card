# RadioGrid Card

Web-Radio für **Music Assistant** in Home Assistant – mit zentraler Senderverwaltung und
Sender-Suche über [Radio Browser](https://www.radio-browser.info/). Kein Backend, kein Build-Step.

Zwei Karten:

| Karte | Zweck |
|---|---|
| `custom:radiogrid-card` | **Anzeige/Player** – Sender-Kacheln, Kategorie-Filter, Cover, Play/Pause/Stop, Lautstärke |
| `custom:radiogrid-config-card` | **Verwaltung** – Sender suchen & anlegen, Karten definieren, Sender den Karten zuordnen |

Abgespielt wird über `music_assistant.play_media` – funktioniert damit auch auf
**Sync-Gruppen** (AirPlay-Multiroom).

## Voraussetzungen

- [Music Assistant](https://www.music-assistant.io/) mit Home-Assistant-Integration
- Mindestens ein Music-Assistant-Player (`media_player.…`, Attribut `app_id: music_assistant`)

## Installation

### HACS

1. HACS → **Frontend** → ⋮ → **Benutzerdefinierte Repositories** → URL eintragen, Kategorie **Dashboard**
2. „RadioGrid Card" installieren
3. Hard-Reload (Strg/Cmd + Shift + R)

### Manuell

1. `dist/radiogrid-card.js` → `/config/www/radiogrid-card.js`
2. Einstellungen → Dashboards → ⋮ → **Ressourcen** → hinzufügen:
   URL `/local/radiogrid-card.js`, Typ **JavaScript-Modul**
3. Hard-Reload

## Loslegen

1. Irgendwo (z.B. auf einer Admin-Seite) die Karte **„RadioGrid Verwaltung"** hinzufügen.
2. Dort **Karten anlegen** – z.B. „Küche", „Wohnzimmer". Der Name ist nur in der Verwaltung sichtbar.
3. **Sender suchen** (Radio Browser) oder manuell anlegen und pro Sender ankreuzen, auf **welchen Karten**
   er erscheinen soll.
4. Auf dem Dashboard die Karte **„RadioGrid Card"** hinzufügen, den Music-Assistant-Player wählen
   und die gewünschte **Karte** (z.B. „Küche") auswählen – fertig.

Die Anzeige-Karten holen ihre Sender automatisch aus dem zentralen Pool. Neue Sender erscheinen
sofort auf allen zugeordneten Karten.

## Optionen (Anzeige-Karte)

| Option    | Typ    | Pflicht | Beschreibung |
|-----------|--------|---------|--------------|
| `entity`  | string | ja      | Music-Assistant-Player oder Sync-Gruppe |
| `card_id` | string | nein    | Zeigt nur die dieser Karte zugeordneten Sender. Leer = alle |
| `title`   | string | nein    | Überschrift |
| `stations`| list   | nein    | Optionale Inline-Liste; hat Vorrang vor dem Pool (für feste Karten) |

```yaml
type: custom:radiogrid-card
entity: media_player.kuche_sonos
card_id: kueche
title: Küche
```

## Wo werden die Sender gespeichert?

Im **Frontend-User-Storage** von Home Assistant (`frontend/set_user_data`) – serverseitig,
überlebt Neustarts, kein zusätzliches Backend nötig.

> **Wichtig:** Dieser Speicher ist **pro Home-Assistant-Benutzer**. Legt ein zweiter Benutzer
> Karten/Sender an, sieht er seine eigene Liste. Für Haushalte mit einem Admin-Konto ist das
> unproblematisch; wer eine für alle Benutzer gemeinsame Liste braucht, benötigt eine
> Integration mit eigenem Backend.

Andere Geräte/Tabs übernehmen Änderungen beim nächsten Neuladen (es gibt keinen Live-Push).

## Hinweise

- Cover/Titel kommen aus dem Player-State (`entity_picture`, `media_title`, `media_artist`) –
  Music Assistant löst sie selbst auf. Ohne Cover zeigt die Karte das Senderlogo.
- Die Karten nutzen die HA-Theme-Variablen (Light/Dark automatisch).
- Die Suche spricht Radio Browser direkt aus dem Browser an (CORS ist dort erlaubt).

## Lizenz

MIT – siehe [LICENSE](LICENSE).
