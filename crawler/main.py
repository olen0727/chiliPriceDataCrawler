import requests
from bs4 import BeautifulSoup
import pandas as pd
import datetime
import time
import os
import random
import sys

# Configuration
BASE_URL = "https://www.tapmc.com.tw/Pages/Trans/Price1"
DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')
OUTPUT_FILE = os.path.join(DATA_DIR, 'vegetables_fv.csv')
START_DATE = datetime.date.today() - datetime.timedelta(days=1)
# For demonstration, let's go back 30 days first. The user can extend this.
# Or we can try to go back further. Let's set a soft limit.
END_DATE = datetime.date(2024, 1, 1) 

def get_roc_date(date_obj):
    year = date_obj.year - 1911
    return f"{year}/{date_obj.month:02d}/{date_obj.day:02d}"

def parse_table(soup, date_str, market_name):
    data = []
    table = soup.find('table', {'class': 'table_style1'}) # Adjust class if needed
    if not table:
        # Try finding by ID or just the first table
        tables = soup.find_all('table')
        if len(tables) > 1:
            table = tables[1] # Usually the second table is data
        elif tables:
            table = tables[0]
            
    if not table:
        return []

    rows = table.find_all('tr')
    if not rows:
        return []

    # Skip header
    for row in rows[1:]:
        cols = row.find_all('td')
        if not cols:
            continue
        
        # Columns: Code, Name, Variety, High, Mid, Low, Avg, Volume...
        # We need to check the exact column layout.
        # Based on inspection: Code, Name, Variety, High, Mid, Low...
        
        row_text = [c.text.strip() for c in cols]
        if len(row_text) < 2:
            continue
            
        code = row_text[0]
        if code.startswith('FV'):
            item = {
                'Date': date_str,
                'Market': market_name,
                'Code': code,
                'Name': row_text[1],
                'Variety': row_text[2] if len(row_text) > 2 else '',
                'High': row_text[3] if len(row_text) > 3 else 0,
                'Mid': row_text[4] if len(row_text) > 4 else 0,
                'Low': row_text[5] if len(row_text) > 5 else 0,
                'Avg': row_text[6] if len(row_text) > 6 else 0,
                'Volume': row_text[7] if len(row_text) > 7 else 0,
            }
            data.append(item)
    return data

def main():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })

    # Initial Fetch
    print("Fetching initial page...")
    try:
        response = session.get(BASE_URL)
        response.raise_for_status()
    except Exception as e:
        print(f"Error fetching initial page: {e}")
        return

    soup = BeautifulSoup(response.text, 'lxml')
    
    # Extract State
    try:
        viewstate = soup.find('input', {'name': '__VIEWSTATE'})['value']
        viewstate_generator = soup.find('input', {'name': '__VIEWSTATEGENERATOR'})['value']
        event_validation = soup.find('input', {'name': '__EVENTVALIDATION'})['value']
    except Exception as e:
        print(f"Error extracting viewstate: {e}")
        return

    # Identify Markets
    # We want to query for "Vegetables" (V) and "Full Market" (2)
    # We need to know valid Market codes.
    # Let's assume 1 (First) and 2 (Second) are the main ones if 'All' isn't there.
    # Or we can try to parse them.
    market_options = []
    market_select = soup.find('select', {'name': 'ctl00$ContentPlaceHolder1$DDL_Market'})
    if market_select:
        for opt in market_select.find_all('option'):
            val = opt.get('value')
            txt = opt.text.strip()
            if val and val != '0': # Assuming 0 is placeholder
                market_options.append((val, txt))
    
    if not market_options:
        # Fallback if we can't find them (maybe they load dynamically? Unlikely for ASP.NET)
        # Or maybe they are only visible when Category is selected?
        # We'll try default 1 and 2.
        market_options = [('1', '第一市場'), ('2', '第二市場')]
        print("Warning: Could not auto-detect markets, using defaults.")

    print(f"Target Markets: {market_options}")

    current_date = START_DATE
    all_records = []

    while current_date >= END_DATE:
        roc_date = get_roc_date(current_date)
        print(f"Processing {roc_date}...")

        for market_val, market_name in market_options:
            time.sleep(random.uniform(0.5, 1.5)) # Be polite

            payload = {
                '__EVENTTARGET': '',
                '__EVENTARGUMENT': '',
                '__VIEWSTATE': viewstate,
                '__VIEWSTATEGENERATOR': viewstate_generator,
                '__EVENTVALIDATION': event_validation,
                'ctl00$ContentPlaceHolder1$txtDate': roc_date,
                'ctl00$ContentPlaceHolder1$DDL_Category': '2', # Full market
                'ctl00$ContentPlaceHolder1$DDL_Market': market_val,
                'ctl00$ContentPlaceHolder1$DDL_FV_Code': 'V', # Vegetables
                'ctl00$ContentPlaceHolder1$btnQuery': '查詢'
            }

            try:
                resp = session.post(BASE_URL, data=payload)
                resp.raise_for_status()
                
                soup_page = BeautifulSoup(resp.text, 'lxml')
                
                # Update state for next request
                # Note: Sometimes the state doesn't change much, but good practice to update
                vs = soup_page.find('input', {'name': '__VIEWSTATE'})
                vsg = soup_page.find('input', {'name': '__VIEWSTATEGENERATOR'})
                ev = soup_page.find('input', {'name': '__EVENTVALIDATION'})
                
                if vs: viewstate = vs['value']
                if vsg: viewstate_generator = vsg['value']
                if ev: event_validation = ev['value']

                # Parse
                records = parse_table(soup_page, roc_date, market_name)
                print(f"  Market {market_name}: Found {len(records)} FV records")
                all_records.extend(records)

            except Exception as e:
                print(f"  Error querying {market_name} on {roc_date}: {e}")

        # Save periodically
        if len(all_records) > 0 and len(all_records) % 100 == 0:
             df = pd.DataFrame(all_records)
             df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8-sig')
             print(f"  Saved {len(all_records)} records so far.")

        current_date -= datetime.timedelta(days=1)

    # Final Save
    if all_records:
        df = pd.DataFrame(all_records)
        df.to_csv(OUTPUT_FILE, index=False, encoding='utf-8-sig')
        print(f"Done. Saved {len(all_records)} records to {OUTPUT_FILE}")
    else:
        print("No records found.")

if __name__ == "__main__":
    main()
