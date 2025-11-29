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

    // Store all data in a Map: Date -> Array of CSV Lines
    const dataMap = new Map();

    // 1. Read existing data
    if (fs.existsSync(OUTPUT_FILE)) {
        const content = fs.readFileSync(OUTPUT_FILE, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim().length > 0);

        // Skip header (index 0)
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            // Extract date (first column)
            // Assuming format: "113/11/29",...
            const firstComma = line.indexOf(',');
            if (firstComma > -1) {
                const date = line.substring(0, firstComma).replace(/['"]/g, ''); // Remove quotes if any
                if (!dataMap.has(date)) {
                    dataMap.set(date, []);
                }
                dataMap.get(date).push(line);
            }
        }
    }
    console.log(`Loaded ${dataMap.size} days of data.`);

    // 2. Crawl Data
    // Start from Today and look back
    let currentDate = new Date();
    // Look back 14 days to cover any recent gaps
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 14);

    // Create Axios instance with cookie jar support (basic)
    let cookies = '';

    // Initial GET to setup session
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
    let marketSelect = $('select[name$="DDL_Market"]');
    if (marketSelect.length === 0) {
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

    let hasNewData = false;

    while (currentDate >= lookbackDate) {
        const rocDate = getRocDate(currentDate);

        if (dataMap.has(rocDate)) {
            console.log(`Skipping ${rocDate} (already exists)`);
            currentDate.setDate(currentDate.getDate() - 1);
            continue;
        }

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
                    const newCookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
                    cookies = newCookies;
                }

                $ = cheerio.load(res.data);
                viewstate = $('input[name="__VIEWSTATE"]').val() || viewstate;
                viewstateGenerator = $('input[name="__VIEWSTATEGENERATOR"]').val() || viewstateGenerator;
                eventValidation = $('input[name="__EVENTVALIDATION"]').val() || eventValidation;

                // Parse Table
                const rows = [];
                $('table tr').each((i, row) => {
                    const cols = $(row).find('td').map((j, col) => $(col).text().trim()).get();
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
                    const csvString = stringify(rows).trim(); // stringify adds trailing newline usually

                    if (!dataMap.has(rocDate)) {
                        dataMap.set(rocDate, []);
                    }
                    // Split by newline in case multiple rows returned
                    const newLines = csvString.split('\n');
                    for (const nl of newLines) {
                        if (nl.trim()) {
                            dataMap.get(rocDate).push(nl.trim());
                        }
                    }
                    hasNewData = true;
                }

            } catch (err) {
                console.error(`  Error querying ${market.txt} on ${rocDate}:`, err.message);
            }
        }

        currentDate.setDate(currentDate.getDate() - 1);
    }

    // 3. Sort and Write
    // Convert Map keys to array and sort descending
    const sortedDates = Array.from(dataMap.keys()).sort().reverse();

    console.log("Writing sorted data to file...");
    const fd = fs.openSync(OUTPUT_FILE, 'w');
    // Write Header
    fs.writeSync(fd, stringify([headers])); // stringify adds newline

    for (const date of sortedDates) {
        const lines = dataMap.get(date);
        for (const line of lines) {
            fs.writeSync(fd, line + '\n');
        }
    }
    fs.closeSync(fd);

    console.log(`Done. Data saved to ${OUTPUT_FILE}`);
}

main();
