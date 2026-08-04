# Market Compass

## Versione 0.3.0 — decisione operativa

Patch sicura: non contiene `data/market-data.json` e non sovrascrive i dati reali.

### Novità

- separazione tra direzione tecnica e momento d’ingresso;
- zona d’ingresso con tolleranza ATR;
- decisioni: VALUTA ORA, ATTENDI CONFERMA, ATTENDI RITRACCIAMENTO/RIMBALZO, TROPPO ESTESO, SETUP INVALIDATO;
- qualità dell’opportunità distinta dalla forza del trend;
- stop, target e rapporto rischio/rendimento visibili nelle schede;
- classifica ordinata in base alla reale operatività, non solo allo score direzionale.

La qualità dell’opportunità è un punteggio interno del modello, non una probabilità garantita di profitto.
