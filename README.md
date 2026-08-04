# Market Compass

## Versione 0.2.1 — classificazione operativa

Questa versione usa i dati reali già prodotti dal workflow GitHub Actions.

### Modifiche principali

- soglie LONG e SHORT meno rigide;
- decisione finale basata sia sullo score sia sulla concordanza dei cinque timeframe;
- distinzione tra direzione e forza del segnale;
- percentuale di concordanza multi-timeframe;
- classifica operativa dei tre mercati più interessanti;
- prezzo attuale, ingresso ideale, target e timing restano visibili;
- WAIT viene mantenuto solo quando direzione e timeframe non offrono sufficiente coerenza.

### Interpretazione

La percentuale mostrata è una **forza tecnica interna del modello**, non una probabilità statistica garantita di profitto.

## Avvertenza

Strumento sperimentale. Non costituisce consulenza finanziaria.


## Aggiornamento sicuro

Questo pacchetto non contiene `data/market-data.json`, quindi non sovrascrive i dati reali già creati dal workflow GitHub Actions.
