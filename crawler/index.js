const { Blob } = require('buffer');
if (typeof global.Blob === 'undefined') {
    global.Blob = Blob;
}
if (typeof global.File === 'undefined') {
    global.File = class File extends Blob {
        constructor(fileBits, fileName, options) {
            super(fileBits, options);
            this.name = fileName;
            this.lastModified = options?.lastModified || Date.now();
        }
    };
}

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');

const BASE_URL = "https://www.tapmc.com.tw/Pages/Trans/Price1";
// Save directly to frontend public folder so it can be served
const OUTPUT_FILE = path.join(__dirname, '../frontend-vite/public/data/vegetables_fv.csv');
const OUTPUT_DIR = path.dirname(OUTPUT_FILE);

// Ensure output dir exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper to get ROC date
function getRocDate(date) {
    const year = date.getFullYear() - 1911;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

// Helper to delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    // Initialize CSV with headers if not exists
    const headers = ['Date', 'Market', 'Code', 'Name', 'Variety', 'High', 'Mid', 'Low', 'Avg', 'Volume'];
    if (!fs.existsSync(OUTPUT_FILE)) {
        fs.writeFileSync(OUTPUT_FILE, stringify([headers]));
    }

    // Create Axios instance with cookie jar support (basic)
    let cookies = '';

    // Initial GET
    console.log("Fetching initial page...");
    let response;
    try {
        response = await axios.get(BASE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
    } catch (e) {
        console.error("Initial fetch failed:", e.message);
        return;
    }

    // Capture cookies
    if (response.headers['set-cookie']) {
        cookies = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
    }

    let $ = cheerio.load(response.data);
    let viewstate = $('input[name="__VIEWSTATE"]').val();
    let viewstateGenerator = $('input[name="__VIEWSTATEGENERATOR"]').val();
    let eventValidation = $('input[name="__EVENTVALIDATION"]').val();

    // Detect Markets
    let marketOptions = [];
    // The select ID is usually ctl00$ContentPlaceHolder1$DDL_Market but in cheerio we can select by name or id
    // The ID in DOM is DDL_Market (based on previous inspection)
    // Wait, the ID might be namespaced. Let's try finding select by name ending in DDL_Market
    let marketSelect = $('select[name$="DDL_Market"]');
    if (marketSelect.length === 0) {
        // Try ID
        marketSelect = $('#ctl00_ContentPlaceHolder1_DDL_Market');
    }

    if (marketSelect.length > 0) {
        marketSelect.find('option').each((i, el) => {
            const val = $(el).val();
            const txt = $(el).text();
            if (val && val !== '0') {
                marketOptions.push({ val, txt });
            }
        });
    }

    if (marketOptions.length === 0) {
        console.log("Warning: No markets detected, using defaults.");
        marketOptions = [
            { val: '1', txt: '第一市場' },
            { val: '2', txt: '第二市場' }
        ];
    }
    console.log("Target Markets:", marketOptions);

    // Date Loop
    // Start from where we left off (2024-11-26) to avoid duplicates if possible, 
    // or just overwrite if we were smart, but here we append.
    // Assuming the file ends at 2024-11-27.
    let currentDate = new Date('2024-11-26');

    // Limit to 2022-01-01
    const endDate = new Date('2022-01-01');

    while (currentDate >= endDate) {
        const rocDate = getRocDate(currentDate);
        console.log(`Processing ${rocDate}...`);

        for (const market of marketOptions) {
            await delay(1000 + Math.random() * 1000); // Polite delay

            const formData = new URLSearchParams();
            formData.append('__EVENTTARGET', '');
            formData.append('__EVENTARGUMENT', '');
            formData.append('__VIEWSTATE', viewstate);
            formData.append('__VIEWSTATEGENERATOR', viewstateGenerator);
            formData.append('__EVENTVALIDATION', eventValidation);
            formData.append('ctl00$ContentPlaceHolder1$txtDate', rocDate);
            formData.append('ctl00$ContentPlaceHolder1$DDL_Category', '2'); // Full market
            formData.append('ctl00$ContentPlaceHolder1$DDL_Market', market.val);
            formData.append('ctl00$ContentPlaceHolder1$DDL_FV_Code', 'V'); // Vegetables
            formData.append('ctl00$ContentPlaceHolder1$btnQuery', '查詢');

            try {
                const res = await axios.post(BASE_URL, formData, {
                    headers: {
                        'Cookie': cookies,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });

                // Update state
                if (res.headers['set-cookie']) {
                    // Simple cookie merge/replace
                    const newCookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                    cookies = newCookies;
                }

                $ = cheerio.load(res.data);
                viewstate = $('input[name="__VIEWSTATE"]').val() || viewstate;
                viewstateGenerator = $('input[name="__VIEWSTATEGENERATOR"]').val() || viewstateGenerator;
                eventValidation = $('input[name="__EVENTVALIDATION"]').val() || eventValidation;

                // Parse Table
                const rows = [];
                // Look for the main data table
                // It usually has class 'table_style1' or similar.
                // Let's iterate all rows and check column count.
                $('table tr').each((i, row) => {
                    const cols = $(row).find('td').map((j, col) => $(col).text().trim()).get();
                    // We expect at least: Code, Name, Variety, High, Mid, Low, Avg, Volume (8 cols)
                    if (cols.length >= 8) {
                        const code = cols[0];
                        if (code.startsWith('FV')) {
                            rows.push([
                                rocDate,
                                market.txt,
                                code,
                                cols[1], // Name
                                cols[2], // Variety
                                cols[3], // High
                                cols[4], // Mid
                                cols[5], // Low
                                cols[6], // Avg
                                cols[7]  // Volume
                            ]);
                        }
                    }
                });

                if (rows.length > 0) {
                    console.log(`  Market ${market.txt}: Found ${rows.length} FV records`);
                    const csvData = stringify(rows);
                    fs.appendFileSync(OUTPUT_FILE, csvData);
                }

            } catch (err) {
                console.error(`  Error querying ${market.txt} on ${rocDate}:`, err.message);
            }
        }

        currentDate.setDate(currentDate.getDate() - 1);
    }
    console.log(`Done. Data saved to ${OUTPUT_FILE}`);
}

main();
