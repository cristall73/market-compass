# Market Compass

## Versione 1.0.0 — Trading Coach AI

Patch sicura: non contiene `data/market-data.json` e non sovrascrive i dati reali.

### Novità principali

- nuova identità “Trading Coach AI”;
- commento principale scritto come una decisione del trader: “Se fossi io, farei così”;
- quattro scenari operativi per ogni asset:
  - prosecuzione senza ritracciamento;
  - ritorno verso la zona;
  - arrivo in zona con conferma 1H;
  - rottura dell’invalidazione;
- diario locale delle ultime analisi per ciascun asset;
- il diario viene aggiornato quando cambiano i dati di mercato;
- pulsante per cancellare il diario dell’asset;
- restano disponibili checklist, stop, target, invalidazione, ragionamento e indicatori tecnici.

Il diario usa `localStorage`: resta nel browser e non richiede server, API o abbonamenti.
