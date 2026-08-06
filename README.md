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


## Versione 7.0.1 — Trading data path fix

Corretto il percorso del file dati nel Trading Coach:

- errato: `trading/data/market-data.json`
- corretto: `data/market-data.json`, raggiunto dalla pagina tramite `../data/market-data.json`

Investment Coach e workflow unificato restano invariati.


## Versione 7.0.2 — aggiornamento completamente automatico

- GitHub Actions esegue `Update Market Data` ogni 2 ore, 24 ore su 24.
- Il pulsante `Aggiorna dati` è stato rimosso da Trading e Investment.
- Entrambe le pagine controllano automaticamente ogni 5 minuti se il file JSON è cambiato.
- Quando GitHub pubblica dati nuovi, la dashboard si aggiorna senza intervento manuale.
- Il pulsante `Scarica report` resta disponibile.
