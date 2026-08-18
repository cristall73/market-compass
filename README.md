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


## Versione 10.1.0 — Final UI

### Stelle e frase operativa
Il sistema traduce punteggio stabile, qualità d'ingresso, fiducia e semaforo in una lettura immediata:

- 5 stelle — `ENTREREI OGGI`
- 4 stelle — `ACQUISTO VALUTABILE`
- 3 stelle — `OTTIMA CANDIDATA`
- 2 stelle — `ASPETTEREI CONFERMA`
- 1 stella — `NON ENTREREI`

Le stelle non sostituiscono stop, invalidazione e verifica delle fonti ufficiali.

### Interpretazione del ritracciamento

- `ANCORA POCO`
- `QUASI IN ZONA`
- `ZONA IDEALE`
- `PROFONDO MA VALIDO`
- `CALO DA VERIFICARE`

La classificazione usa il ritracciamento richiesto dal singolo titolo, la volatilità storica, il trend Weekly e la qualità aziendale.


## Versione 15.0 — Intelligence Coach

- Aggiornamento automatico ogni 2 ore, 24/7, al minuto 17.
- Trading, Investment, memoria, validazione e Intelligence vengono aggiornati nello stesso ciclo.
- Universo Investment globale: USA, Europa, Regno Unito, Svizzera, Nordics, Giappone, Canada e Australia.
- Terza pagina: `/intelligence/`.
- Profilo aziendale delle 5 candidate: paese, sede, CEO, industria, capitalizzazione, descrizione e sito.
- Notizie collegate ai mercati e alle candidate, con fonte e link originale quando disponibile.
- Spiegazione sintetica del perché una notizia può influire sull'asset o sull'azienda.

La pagina Intelligence è uno strumento di supporto: per dati societari critici verificare sempre Investor Relations e le fonti ufficiali.


## Versione 15.1 — Cleanup e coerenza UI

- Homepage con 3 card: Trading, Investment, News & Catalyst.
- Navbar identica e completa nei tre moduli.
- Investment: rimosso il link News fuori posto nell'header.
- Diciture aggiornate all'universo globale di oltre 200 azioni.
- Trading Top 3 ordinata per Setup finale decrescente.
- A parità di Setup: semaforo, trend, confluenza, ingresso.
- Il "Primo candidato da monitorare" coincide sempre con il n.1 della Top 3.
- Corretto un div duplicato nella tabella ranking Trading.
- Nessuna modifica ai criteri, memoria o classifica dell'Investment Coach.


## Versione 16.0 — Integrated Coach

Questa versione NON cambia:
- universo Investment;
- pesi e soglie della classifica;
- memoria;
- workflow automatico ogni 2 ore.

Aggiunge:
- homepage a 3 card realmente simmetriche;
- collegamento diretto da ogni candidata Investment alla relativa scheda Intelligence;
- deep-link tramite ticker;
- spiegazione sintetica del voto Investment;
- breakdown qualità / trend / ingresso / news;
- cronologia visibile della Top5, permanenza e variazione di posizione;
- navigazione rapida tra le cinque aziende nel News & Catalyst Coach;
- dati di stabilità e fiducia anche nella scheda aziendale.

## Versione 16.1 — Green Readiness
Nessuna modifica alla logica Investment.
Ogni candidata mostra ora chiaramente quali condizioni mancano per diventare VERDE:
prezzo/ritracciamento, ingresso, trend, qualità, news/catalizzatori e memoria 3/3 giorni.
