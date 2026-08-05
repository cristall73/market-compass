# Market Compass v5.2.1 Professional

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


## Versione 5.0.0 — completamento area Trading operativo

### Semaforo accessibile
Il sistema non usa soltanto i colori. Mostra sempre:
- simbolo;
- nome del colore;
- istruzione testuale.

Stati:
- VERDE · PRONTO;
- GIALLO · QUASI PRONTO / IN ATTESA;
- ROSSO · TARDIVO / RIMANI FUORI / ANNULLATO.

### Condizioni mancanti
Ogni asset mostra:
- quante condizioni sono soddisfatte;
- quante ne mancano;
- barra di avanzamento;
- checklist con SODDISFATTA o MANCANTE.

### Regola ingresso
Il semaforo verde compare soltanto quando:
- il motore assegna stato READY;
- prezzo nella zona operativa;
- conferma 4H/1H;
- rapporto rischio/rendimento sufficiente;
- setup finale almeno 6/10.

### Affidabilità
Non viene mostrata una falsa probabilità di successo.
Il sito dichiara esplicitamente che il voto è tecnico e non statistico.
La probabilità reale verrà aggiunta soltanto dopo un backtest con campione sufficiente.


## Versione 5.1.0 - Report Telegram

Aggiunto il pulsante `Scarica report Telegram`.

Il report:
- viene generato direttamente nel browser;
- viene scaricato come immagine PNG;
- non contiene il link del sito;
- non contiene dati personali;
- include data e ora, riepilogo, candidato principale, semaforo e classifica degli 8 asset;
- è pensato per essere inoltrato su Telegram senza condividere la dashboard.

Non sono usate librerie o servizi esterni: il report viene creato con Canvas API.


## Versione 5.2.0 - Aggiornamento automatico e freschezza dati

- GitHub Actions aggiorna `market-data.json` ogni 15 minuti.
- Il sito controlla automaticamente il file ogni 15 minuti mentre rimane aperto.
- Lo stato in alto mostra:
  - Dati aggiornati: fino a 20 minuti;
  - Dati non recentissimi: da 21 a 45 minuti;
  - Dati vecchi: oltre 45 minuti.
- Colore, simbolo e testo sono sempre presenti per accessibilità.
- Il pulsante `Aggiorna dati` continua a rileggere manualmente il file disponibile.

Nota: GitHub Actions può eseguire i workflow pianificati con alcuni minuti di ritardo.
Il sito statico non può avviare direttamente un workflow privato senza credenziali.


## Versione 5.2.1 - Semafori progressivi e report generico

Modifiche:
- il riquadro freschezza dati resta informativo e non è cliccabile;
- compare la dicitura `SOLO INFO`;
- il pulsante è ora `Scarica report`;
- semaforo VERDE: zero condizioni mancanti e setup pronto;
- semaforo GIALLO: una o due condizioni mancanti;
- semaforo ROSSO: tre o più condizioni mancanti, setup annullato o nessun vantaggio;
- il giallo distingue fra:
  - quasi pronto;
  - attesa conferma;
  - attesa della zona;
  - attesa di un ritracciamento.
