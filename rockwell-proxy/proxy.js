import express from 'express';
import cors from 'cors';

console.log("Proxy starting...");

const app = express();
app.use(cors());

app.get('/search', async (req, res) => {
  const query = req.query.q || 'ControlLogix';

  const url = `https://api.rockwellautomation.com/ra-eapi-cx-public-dashboard-vpcprod/api/v1/rockwell/search?query=${encodeURIComponent(query)}&tab=lifecycle&from=0&size=24&locale=en-US`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'client_id': 'fb000cbbe476420b9e70be741abd7a63',
        'client_secret': 'Db420ae8BAdD47ADA4E12cE90Fb1b747',
        'correlation_id': 'prod_ra_com_search',
        'origin': 'https://www.rockwellautomation.com',
        'referer': 'https://www.rockwellautomation.com/',
        'user-agent': 'Mozilla/5.0'
      }
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log("Server is listening on port 3001"));
