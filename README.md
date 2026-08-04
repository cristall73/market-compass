# Market Compass

Dashboard sperimentale per:

- trading multi-timeframe con orizzonte 1–3 giorni;
- futura selezione di grandi azioni con orizzonte 30–90 giorni.

## Versione 0.1.0 — dati reali

Questa versione sostituisce la simulazione OHLC con dati reali scaricati automaticamente tramite uno script Python e GitHub Actions.

### Flusso dati

1. GitHub Actions esegue `scripts/update_market_data.py`.
2. Lo script scarica i dati con `yfinance`.
3. I timeframe disponibili sono:
   - 1 mese;
   - 1 settimana;
   - 1 giorno;
   - 1 ora.
4. Il timeframe 4 ore viene costruito aggregando le candele da 1 ora.
5. I dati vengono salvati in `data/market-data.json`.
6. GitHub Pages legge quel file e ricalcola indicatori, score, ingresso, stop e target.

### Nessun nuovo abbonamento

Il progetto usa:

- GitHub Pages;
- GitHub Actions su repository pubblico;
- Python;
- yfinance.

Non richiede chiavi API o abbonamenti aggiuntivi.

### Primo avvio

Dopo aver caricato la versione:

1. apri la scheda `Actions`;
2. scegli `Aggiorna dati di mercato`;
3. premi `Run workflow`;
4. attendi il completamento;
5. riapri il sito.

Il workflow è anche programmato ogni ora dal lunedì al venerdì. Gli aggiornamenti pianificati possono subire ritardi e, nei repository pubblici senza attività per 60 giorni, GitHub può disattivarli automaticamente.

### Limiti

`yfinance` usa API pubbliche di Yahoo Finance, ma non è un servizio ufficiale garantito da Yahoo. Può essere soggetto a ritardi, limitazioni o modifiche. I dati non vanno considerati adatti a esecuzione ad alta frequenza o ordini automatici.

## Avvertenza

Il progetto è sperimentale e non costituisce consulenza finanziaria.
