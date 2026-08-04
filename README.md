# Market Compass

Dashboard sperimentale per:

- trading multi-timeframe con orizzonte 1–3 giorni;
- selezione futura di grandi azioni con orizzonte 30–90 giorni.

## Versione 0.0.5

Aggiunte le informazioni operative direttamente nelle card:

- prezzo attuale;
- entrata ideale sul ritracciamento del 50%;
- target;
- distanza dall'entrata in punti e percentuale;
- decisione operativa;
- stato dei timeframe.

Nel popup sono ora presenti:

- prezzo attuale;
- entrata ideale;
- stop;
- target;
- rapporto rischio/rendimento;
- distanza dal punto di ingresso.

Il codice usa un oggetto `MARKET_DATA_PROVIDER`, così la simulazione OHLC potrà essere sostituita successivamente da una fonte dati reale senza riscrivere dashboard e motore.

## Importante

I valori sono ancora simulati. Non sono segnali operativi reali.

## Avvertenza

Prototipo sperimentale. Non costituisce consulenza finanziaria.
