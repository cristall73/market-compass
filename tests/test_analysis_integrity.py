import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
def module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / (name + '.py'))
    obj = importlib.util.module_from_spec(spec); spec.loader.exec_module(obj); return obj

class IntegrityTests(unittest.TestCase):
    def test_missing_etf_does_not_remove_holding_or_create_exit(self):
        m=module('update_etf_data')
        previous={'portfolio':{'holdings':[{'ticker':'MISSING','entryDate':'2025-01-01'}],'lastReviewMonth':'2026-09'}}
        actual=m.build_portfolio([],previous,datetime(2026,10,11,tzinfo=timezone.utc))
        self.assertEqual(actual['holdings'][0]['ticker'],'MISSING')
        self.assertEqual(actual['exitHistory'],[])
        self.assertTrue(actual['holdings'][0]['dataUnavailable'])

    def test_monthly_data_never_contains_open_month(self):
        m=module('update_etf_data')
        now=pd.Timestamp.now(); s=pd.Series([100,101],index=pd.DatetimeIndex([now-pd.DateOffset(months=1),now]))
        result=m.monthly_series(s)
        self.assertEqual(len(result),1)
        self.assertLess(result.index[-1].to_period('M'),now.to_period('M'))

    def test_same_isin_and_same_role_not_selected_twice(self):
        m=module('update_etf_data')
        items=[{'ticker':'A','isin':'ONE','role':'CORE GLOBALE','score':9,'status':'GREEN'},
               {'ticker':'B','isin':'ONE','role':'CORE GLOBALE','score':8,'status':'GREEN'}]
        self.assertEqual(len(m.initial_pick(items)),1)

    def test_mtf_cannot_bypass_entry_filters(self):
        m=module('apply_investment_mtf_confirmation')
        for raw,price,target,expected in [('RED',100,125,False),('GREEN',120,125,False),('GREEN',100,105,False),('GREEN',100,125,True)]:
            c={'ticker':'TEST','rawStatus':raw,'currentPrice':price,'entryZoneLow':95,'entryZoneHigh':105,'invalidation':90,'target2':target,'confirmation':{'days':5,'requiredDays':5}}
            mtf={'allConfirmed':True,'trendHealth':{'score':9,'explosive':False}}
            with tempfile.TemporaryDirectory() as tmp:
                file=Path(tmp)/'data.json';file.write_text(json.dumps({'investment':{'candidates':[c]}}))
                with patch.object(m,'DATA',file),patch.object(m,'analyse_ticker',return_value=mtf):m.main()
                self.assertEqual(json.loads(file.read_text())['investment']['candidates'][0]['confirmation']['confirmed'],expected)

if __name__=='__main__':unittest.main()
