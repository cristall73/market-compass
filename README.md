# Market Compass

## Versione 0.6.0 — popup riscritto da zero

Patch sicura: non contiene `data/market-data.json`.

Il dettaglio di ogni asset è stato completamente riscritto. Ora il popup mostra prima:

- decisione del Coach;
- spiegazione in italiano;
- zona in cui aspettare;
- checklist per l’ingresso;
- stop e relativo significato;
- TP1, TP2 e TP3;
- invalidazione del setup;
- diario del ragionamento;
- domande rapide al Coach.

RSI, Stocastico, ATR, Nadaraya ed EMA sono stati spostati in una sezione tecnica richiudibile, così non coprono più il ragionamento.

La versione aggiunge anche parametri anti-cache ai file JavaScript e CSS, per evitare che il browser continui a mostrare il vecchio popup.
