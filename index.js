const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const keys = require('./service-account-key.json');

const auth = new google.auth.GoogleAuth({
    credentials: keys,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const BANK_CONFIGS = {
    CIMB: {
        url: "https://www.cimbniaga.co.id/content/cimb/id/personal/treasury/kurs-valas/jcr:content/responsivegrid/kurs_copy_copy_copy.get-content/",
        selector: '.kurs-valas table tbody tr',
        eval: function (selector) {
            const rows = document.querySelectorAll(selector);
            for (const row of rows) {
                const currency = row.querySelector('td.td1')?.innerText.trim();
                if (currency === 'USD') {
                    const parseNumber = (str) => parseFloat(str.replace(/,/g, ''))
                    const buy = parseNumber(row.querySelector('td.td2')?.innerText);
                    const sell = parseNumber(row.querySelector('td.td3')?.innerText);
                    return {
                        currency,
                        buyRate: buy,
                        sellRate: sell
                    };
                }
            }

        }
    },
    BCA: {
        url: "https://www.bca.co.id/id/informasi/kurs",
        selector: 'tr[code="USD"]',
        eval: function (selector) {
            const row = document.querySelector(selector);
            if (!row) return null;

            const parser = (type) => {
                const el = row.querySelector(`[rate-type="${type}"]`);
                return el ? el.innerText.trim().replace(/\./g, '').replace(',', '.') : null;
            }

            return {
                currency: "USD",
                buy: parseFloat(parser("ERate-buy")),
                sell: parseFloat(parser("ERate-sell"))
            }
        }
    }
};

require('dotenv').config();

const creds = process.env.GOOGLE_CREDENTIALS;
const sheet_id = process.env.SHEET_ID;

const parser = async (bank) => {
    const config = BANK_CONFIGS[bank.toUpperCase()];
    if (!config) throw new Error(`Unsupported bank: ${bank}`);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const url = config.url;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await page.waitForSelector(config.selector);

    const usd = await page.evaluate(
        (selector, fnStr) => {
            const evalFn = new Function('selector', `return (${fnStr})(selector);`);
            return evalFn(selector);
        },
        config.selector,
        config.eval.toString()
    );
    /*

    console.log('Retrieving exchange rate for bank:', bank);

    if (usd) {
        console.log('USD Rate:', usd);
    } else {
        console.log('USD Data not found');
    }
        */

    await browser.close();
    return usd;
};

const start = Date.now();
await parser('cimb');
const end = Date.now();

console.log(`Execution time: ${end - start} ms`);

const start2 = Date.now();
await parser('bca');
const end2 = Date.now();

console.log(`Execution time: ${end2 - start2} ms`);

const start3 = Date.now();

const [resA, resB] = await Promise.all([
    parser('cimb'),
    parser('bca')
]);

const end3 = Date.now();

console.log(`Execution time:${end3 - start3} ms`);

console.log('CIMB:', resA);
console.log('BCA:', resB);