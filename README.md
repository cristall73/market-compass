# Market Compass v6.0.1 Stable — Dual Coach

## Struttura

- `/` — scelta del modulo
- `/trading/` — Trading Coach AI, orizzonte poche ore / 2-3 giorni
- `/investing/` — Investment Coach AI, orizzonte 2-4 mesi

## Investment Coach

Il workflow analizza oltre 120 large cap e pubblica soltanto le migliori 5.

Criteri:
- qualità fondamentale;
- trend mensile, settimanale e Daily;
- ritracciamento adattivo alla volatilità;
- valutazione;
- notizie recenti da Yahoo Finance;
- rischi settoriali/geopolitici euristici;
- conferma Daily e rapporto rischio/rendimento.

Ogni candidato include un report con:
- motivazione della selezione;
- fondamentali;
- tecnica;
- trimestrali;
- diagnosi del ribasso;
- catalizzatori;
- rischi;
- piano operativo;
- scenari A/B/C;
- condizioni necessarie per il verde.

## Limite importante

La parte qualitativa usa dati gratuiti e classificazioni euristiche. Non sostituisce:
- comunicati ufficiali della società;
- filing SEC/consob;
- conference call;
- fonti giornalistiche verificate.

## Primo avvio

Dopo l'upload:
1. eseguire `Update Market Data`;
2. eseguire `Update Investment Data`;
3. attendere il deploy GitHub Pages.

## Correzioni v6.0.1 Stable

- corretto il percorso di scrittura del Trading Coach: `trading/data/market-data.json`;
- gestione corretta dei JSON non ancora tracciati dal repository;
- Investment Coach trasformato in motore a due stadi: download tecnico in blocco su oltre 120 azioni e approfondimento fondamentale/notizie solo sulle migliori 24;
- workflow Investment con timeout, concorrenza e commit robusto;
- verificati i percorsi relativi usati dalle due pagine GitHub Pages.
