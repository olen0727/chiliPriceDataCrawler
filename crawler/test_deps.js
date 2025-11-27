try {
    console.log('Testing Cheerio...');
    const cheerio = require('cheerio');
    console.log('Cheerio loaded');
} catch (e) {
    console.error('Cheerio failed:', e.message);
}

try {
    console.log('Testing Axios...');
    const axios = require('axios');
    console.log('Axios loaded');
} catch (e) {
    console.error('Axios failed:', e.message);
}
