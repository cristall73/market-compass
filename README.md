# Market Compass

Dashboard sperimentale per due moduli:

- trading multi-timeframe con orizzonte 1–3 giorni;
- selezione futura di grandi azioni con orizzonte 30–90 giorni.

## Versione 0.0.3

La dashboard Trading ora usa realmente `TradingEngine.analyzeMarket()`.

Per ogni mercato vengono mostrati:

- direzione LONG, SHORT o WAIT;
- score aggregato;
- affidabilità;
- score separato per 1M, 1W, 1D, 4H e 1H;
- RSI, Stocastico, ATR e Nadaraya;
- EMA 200;
- livello mediano del movimento recente, usato come riferimento per il ritracciamento del 50%;
- motivazioni principali del segnale.

## Importante

In questa versione le serie OHLC sono simulate e servono esclusivamente a testare il motore e l'interfaccia. Non sono segnali operativi reali.

## Pubblicazione

Il repository può essere pubblicato gratuitamente con GitHub Pages usando il branch `main` e la cartella `/ (root)`.

## Avvertenza

Prototipo sperimentale. Non costituisce consulenza finanziaria.
