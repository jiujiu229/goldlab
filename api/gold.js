// api/gold.js
module.exports = async function handler(req, res) {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { type } = req.query;

    // 从环境变量获取密钥
    const GOLD_API_KEY = process.env.GOLD_API_KEY;
    const FRED_API_KEY = process.env.FRED_API_KEY;
    const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

    // 1. 实时金价 (GoldAPI)
    if (type === 'realtime') {
        if (!GOLD_API_KEY) {
            return res.status(500).json({ error: 'Missing GoldAPI key' });
        }
        try {
            const response = await fetch('https://www.goldapi.io/api/XAU/USD', {
                headers: { 'x-access-token': GOLD_API_KEY }
            });
            if (!response.ok) {
                throw new Error(`GoldAPI responded with status ${response.status}`);
            }
            const data = await response.json();
            if (!data.price) {
                throw new Error('GoldAPI response missing price field');
            }
            return res.status(200).json(data);
        } catch (err) {
            console.error('GoldAPI error:', err);
            return res.status(500).json({ error: 'Failed to fetch realtime gold price', details: err.message });
        }
    }

    // 2. 历史金价 (Twelve Data)
    if (type === 'history') {
        if (!TWELVE_DATA_API_KEY) {
            return res.status(500).json({ error: 'Missing Twelve Data API key' });
        }
        try {
            const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1day&outputsize=5000&apikey=${TWELVE_DATA_API_KEY}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Twelve Data responded with status ${response.status}`);
            }
            const data = await response.json();

            if (!data.values || !Array.isArray(data.values)) {
                console.error('Twelve Data unexpected response:', data);
                throw new Error('Twelve Data response missing values array');
            }

            const history = data.values
                .map(item => ({
                    date: item.datetime.split(' ')[0],
                    price: parseFloat(item.close)
                }))
                .filter(item => !isNaN(item.price))
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            return res.status(200).json({ observations: history });
        } catch (err) {
            console.error('Twelve Data error:', err);
            return res.status(500).json({ error: 'Failed to fetch historical gold data', details: err.message });
        }
    }

    // 3. 宏观数据 (FRED)
    if (type === 'macro') {
        if (!FRED_API_KEY) {
            return res.status(500).json({ error: 'Missing FRED key' });
        }
        try {
            // 美元指数
            const dollarRes = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DTWEXBGS&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`);
            if (!dollarRes.ok) throw new Error(`FRED dollar index failed: ${dollarRes.status}`);
            const dollarJson = await dollarRes.json();
            const dollarIndex = dollarJson.observations?.[0]?.value !== '.' ? parseFloat(dollarJson.observations?.[0]?.value) : 105.2;
            const dollarDate = dollarJson.observations?.[0]?.date || null;

            // 实际利率
            const rateRes = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFII10&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`);
            if (!rateRes.ok) throw new Error(`FRED real rate failed: ${rateRes.status}`);
            const rateJson = await rateRes.json();
            const realRate = rateJson.observations?.[0]?.value !== '.' ? parseFloat(rateJson.observations?.[0]?.value) : 2.10;
            const rateDate = rateJson.observations?.[0]?.date || null;

            // 通胀预期
            const infRes = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=T10YIE&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`);
            if (!infRes.ok) throw new Error(`FRED inflation failed: ${infRes.status}`);
            const infJson = await infRes.json();
            const inflationExp = infJson.observations?.[0]?.value !== '.' ? parseFloat(infJson.observations?.[0]?.value) : 2.50;
            const infDate = infJson.observations?.[0]?.date || null;

            const macroDate = [dollarDate, rateDate, infDate].filter(d => d).sort().reverse()[0] || null;

            return res.status(200).json({ dollarIndex, realRate, inflationExp, macroDate });
        } catch (err) {
            console.error('FRED macro error:', err);
            return res.status(500).json({ error: 'Failed to fetch macro data', details: err.message });
        }
    }

    // 无效的 type 参数
    return res.status(400).json({ error: 'Invalid type parameter' });
};