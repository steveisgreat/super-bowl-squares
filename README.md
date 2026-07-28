# Super Bowl Squares

A self-hosted Super Bowl squares grid game. Runs on your PC, played from any device (iPad, phone, laptop) on the same WiFi network — great for AirPlaying to a TV.

## Requirements

- [Node.js](https://nodejs.org) installed on the hosting PC (no other dependencies needed).

## Running it

**Easiest way:** double-click **`start-app.bat`** in this folder. It starts the server in its own window and automatically opens the app in your default browser.

Other scripts included:
- **`start-server.bat`** — starts the server only (in the current window, with logs visible) and prints the URLs to use. Use this if you want to watch server logs or troubleshoot. Close the window (or press `Ctrl+C`) to stop it.
- **`stop-server.bat`** — shuts down a server started with `start-app.bat` (or any leftover server on port 3000).

Prefer the command line? Same thing manually:

```bash
node server.js
```

Either way, the server prints two URLs:
- `http://localhost:3000` — open this on the PC itself.
- `http://<your-pc-ip>:3000` — open this on your iPad or any other device connected to the **same WiFi network**.

To AirPlay to a TV: open the iPad URL in Safari, then use Control Center → Screen Mirroring to send it to the TV (1080p layout is supported).

## How to use it

1. **Setup (Step 1):** Create a new game — enter the year, team names, price per square, quarterly payout percentages (must total 100%), how squares can be picked (manual/auto/both), and an optional auto-cutoff time.
2. **Pick Squares (Step 2):** Players enter their name and number of squares, then auto-pick or manually tap squares. The host can lock the board at any time (or it locks automatically at the cutoff time) — this randomly assigns the 0-9 numbers to each row/column and starts the game.
3. **Game Day (Step 3):** Enter each team's score (last digit) at the end of every quarter. Winning squares are highlighted automatically. Editing a score recalculates everything, including rollover ("push") amounts. If the Final Score square is empty, use "Randomly Draw Winner" to pick a valid winner.

Past years are saved automatically and can be viewed from the Home screen — they cannot be replayed, but quarterly results can still be corrected if needed.

## Team colors & logos

If the team names you enter in Step 1 match an NFL team (e.g. "Chiefs", "Kansas City Chiefs", or "KC"), the app automatically applies that team's real colors and logo throughout the grid, board, and TV view. A live preview appears under each team name field as you type. If a name doesn't match any team, it falls back to generic red/blue styling — nothing breaks.

Logos are fetched at runtime from ESPN's public logo CDN, so the hosting PC needs an internet connection for logos to display (everything else works fully offline). If a logo can't be fetched (no internet, unknown team, etc.), a generic helmet icon is shown instead so the layout never looks broken.

## Payments & players

Each claim in Step 2 has a **"Mark as Paid"** checkbox. An **Unpaid Total** stat is shown on both the Step 2 and Step 3 screens — click it (or the **"💰 Manage Payments & Players"** button) to open a list of every player with their square count, amount owed, a paid/unpaid toggle, and a **Remove** button that clears all of that player's squares. This is available on both screens specifically so a late payment (e.g. someone who called in to claim squares before lock but pays after the game starts) can still be marked paid from Game Day.

## Duplicate names

If you enter a name that already has squares (e.g. "Steve" again), the app asks whether it's the same person (combines their squares/payment status) or a different person — in which case both are kept separate and labeled with a subscript number (`Steve₁`, `Steve₂`) throughout the grid and payment list.

## TV / Grid-Only View

From the Game Day screen (Step 3), click **"🖥️ Open TV Grid View"** to open a clean, large-format, grid-only view in a new browser tab — no forms or controls, just the matchup header and a big board sized to fill a 1080p screen edge-to-edge. It refreshes itself automatically every few seconds, so you can leave it open on a TV (AirPlayed from a separate tab/device) while entering scores from the iPad on the main Step 3 screen.

You can also jump straight to it with a direct link: `http://<your-pc-ip>:3000/#tv-<year>` (e.g. `#tv-2026`).

## Data storage

Each year's game is saved as a JSON file in the `data/` folder. Back that folder up if you want to preserve history long-term.
