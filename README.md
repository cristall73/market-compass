# Market Compass v7.0.0 — Unified Stable

Questa versione risolve definitivamente il problema dei workflow mancanti.

## Principio

Esiste un solo workflow:

`Update Market Data`

Quel workflow aggiorna un unico file:

`data/market-data.json`

Lo stesso file contiene:

- dati del Trading Coach;
- screening di oltre 120 large cap;
- dati del nuovo Investment Coach;
- migliori 5 candidate.

Quindi non serve più il workflow `Update Investment Data`.

## Dopo l'upload

1. Vai in **Actions**.
2. Apri **Update Market Data**.
3. Premi **Run workflow**.
4. Attendi il segno verde.
5. Attendi il deploy GitHub Pages.
6. Apri il sito con `?v=700`.

## Controllo rapido

Nel repository devono esistere:

- `data/market-data.json`
- `scripts/update_market_data.py`
- `trading/index.html`
- `investing/index.html`

Se questi quattro percorsi esistono, la struttura è corretta.

## Nota sul tempo

L'aggiornamento ora svolge anche lo screening azionario.
Può quindi richiedere diversi minuti, non soltanto i 30 secondi del vecchio Trading Coach.
