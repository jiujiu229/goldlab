// api/gold.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { type } = req.query;
    
    const GOLD_API_KEY = process.env.GOLD_API_KEY;
    const FRED_API_KEY = process.env.FRED_API_KEY;
    const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

    if (type === 'realtime')
        if (!GOLD_API_KEY) return res.status(500).json({ error: 'Missing GoldAPI key' });
        try {
            const response = await fetch('https://www.goldapi.io/api/XAU/USD', {
                headers: { 'x-access-token': GOLD_API_KEY }
            });
            const data = await response.json();
            return res.status(200).json(data);
        } catch (err) {
            return res.status(500).json({ error: 'Failed to fetch gold price' });
        }
    }

    if (type === 'history') {
    if (!TWELVE_DATA_API_KEY) {
        return res.status(500).json({ error: 'Missing Twelve Data API key' });
    }
    try {
        const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1day&outputsize=5000&apikey=${TWELVE_DATA_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (!data.values || !Array.isArray(data.values)) {
            console.error('Twelve Data 返回数据格式错误', data);
            return res.status(500).json({ error: 'Invalid data format from Twelve Data' });
        }

        // 转换数据格式，以匹配前端 goldData 期望的 { date, price } 格式
        const formattedHistory = data.values.map(item => ({
            date: item.datetime.split(' ')[0], // 只保留日期部分 'YYYY-MM-DD'
            price: parseFloat(item.close)
        })).sort((a, b) => new Date(a.date) - new Date(b.date));

        // 返回与 FRED 相同结构，前端无需改动
        return res.status(200).json({ observations: formattedHistory });
    } catch (err) {
        console.error('Twelve Data 历史数据获取失败:', err);
        return res.status(500).json({ error: 'Failed to fetch history from Twelve Data' });
    }
}
    if (type === 'macro') {
        if (!FRED_API_KEY) return res.status(500).json({ error: 'Missing FRED key' });
        try {
            const dollarRes = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DTWEXBGS&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`);
            const dollarJson = await dollarRes.json();
            const dollarIndex = dollarJson.observations?.[0]?.value !== '.' ? parseFloat(dollarJson.observations?.[0]?.value) : 105.2;

            const rateRes = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=DFII10&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`);
            const rateJson = await rateRes.json();
            const realRate = rateJson.observations?.[0]?.value !== '.' ? parseFloat(rateJson.observations?.[0]?.value) : 2.10;

            const infRes = await fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=T10YIE&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=1`);
            const infJson = await infRes.json();
            const inflationExp = infJson.observations?.[0]?.value !== '.' ? parseFloat(infJson.observations?.[0]?.value) : 2.50;

            return res.status(200).json({ dollarIndex, realRate, inflationExp });
        } catch (err) {
            return res.status(500).json({ error: 'Failed to fetch macro data' });
        }
    }

    return res.status(400).json({ error: 'Invalid type parameter' });
}