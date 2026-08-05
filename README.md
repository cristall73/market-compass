# Market Compass v4.0.0 Professional

Pacchetto completo. Non sovrascrive `data/market-data.json`.

Nuove funzioni:
- supporti e resistenze statiche multi-timeframe;
- livelli raggruppati per più reazioni;
- forza dei livelli;
- zone di domanda e offerta;
- Order Block e Fair Value Gap euristici;
- Fibonacci Daily 38,2 / 50 / 61,8;
- indice di confluenza 0–10;
- classifica che premia anche la confluenza;
- spiegazione dettagliata nel Trading Coach.

Tutti i calcoli partono dalle candele OHLC scaricate tramite Yahoo Finance/yfinance.
Order Block e FVG sono euristiche sperimentali da verificare sul grafico.


## Correzione 3.0.1

Corretto un errore nella creazione delle card: la struttura di supporti, resistenze e confluenze
veniva calcolata correttamente ma non veniva passata al template delle card.
Il browser interpretava l'errore come assenza di dati reali.


## Correzione 3.0.2 — punteggi chiari

Non c'era un errore nei calcoli: la card mostrava due voti diversi senza distinguerli bene.

Ora vengono sempre indicati separatamente:
- Forza trend;
- Qualità ingresso;
- Confluenza.

La classifica usa la qualità dell'ingresso insieme alla priorità operativa e alla confluenza.


## Versione 4.0.0 — Professional UI

- classifica trasformata in tabella stabile e senza testi tagliati;
- nessun valore va più a capo come “Ingres... 4/1”;
- nuovo voto finale unico del setup;
- il voto finale combina:
  - 25% forza del trend;
  - 40% qualità dell'ingresso;
  - 20% confluenza;
  - 15% gestione del rischio;
  - bonus/malus legato allo stato operativo;
- classifica ordinata principalmente per voto finale;
- dettaglio separato di trend, ingresso, confluenza e rischio;
- voto finale grande nel candidato principale;
- voto finale presente anche su ogni card;
- layout responsive per desktop, tablet e smartphone.
