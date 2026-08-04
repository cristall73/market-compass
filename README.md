# Market Compass

Prima bozza statica del progetto per:

- segnali di trading con orizzonte 1–3 giorni;
- selezione di opportunità azionarie con orizzonte 30–90 giorni;
- persistenza locale dello storico dei segnali.

## Avvio

Apri `index.html` nel browser oppure pubblica il repository con GitHub Pages.

## GitHub Pages

1. Vai in `Settings`.
2. Apri `Pages`.
3. In `Build and deployment`, scegli `Deploy from a branch`.
4. Seleziona branch `main` e cartella `/ (root)`.
5. Salva.

## Stato attuale

I dati sono dimostrativi e vengono definiti in `app.js`.  
La prossima fase sarà collegare una fonte dati reale e separare:

- calcolo dello score;
- dati di mercato;
- persistenza dei segnali;
- interfaccia.

## Avvertenza

Prototipo sperimentale. Non costituisce consulenza finanziaria.


## Versione 0.0.2 — Trading Engine

Aggiunto un primo motore tecnico riutilizzabile con:

- analisi multi-timeframe: 1M, 1W, 1D, 4H, 1H;
- medie mobili esponenziali 200, 60, 50, 10 e 5;
- ATR, RSI e Stocastico;
- curva Nadaraya-Watson;
- riconoscimento iniziale di doppi massimi/minimi e testa e spalle;
- area di ingresso vicina al ritracciamento del 50%;
- risultato LONG, SHORT o WAIT con score aggregato.

Il motore riceve serie OHLC organizzate per timeframe. La fonte dati reale verrà collegata in una fase successiva senza modificare la logica centrale.
