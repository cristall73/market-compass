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


## Versione 10.0.0 — Investment Memory & Validation Engine

### Classifica lenta e rigida
- 70% media storica degli ultimi 30 giorni;
- 30% punteggio odierno;
- nuova candidata confermata per almeno 3 giorni;
- uscita ordinaria solo dopo 5 giorni sotto soglia;
- uscita immediata solo per deterioramento strutturale;
- margine minimo di 0,40 punti per sostituire la quinta;
- margine minimo di 0,65 punti per scalzare una delle prime tre;
- bonus fedeltà massimo di 0,35 punti.

### Memoria
`data/market-history.json` conserva fino a 120 fotografie giornaliere.
Gli aggiornamenti ogni due ore aggiornano la fotografia del giorno, senza contare 12 volte la stessa giornata.

### Validazione
Dopo 20, 60 e 90 giorni il motore confronta il prezzo corrente con quello della selezione:
- percentuale di casi positivi;
- rendimento medio;
- numero di campioni.

Queste statistiche descrivono il passato e non garantiscono risultati futuri.
