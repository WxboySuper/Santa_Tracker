# Weather endpoint contract

`GET /api/weather?lat={latitude}&lon={longitude}` accepts decimal latitude and longitude and returns:

```json
{
  "temperatureC": 10,
  "temperatureF": 50,
  "code": 3,
  "label": "Overcast"
}
```

Invalid or out-of-range coordinates return HTTP 400 with `{ "error": "Invalid coordinates" }`. Provider errors, timeouts, and malformed responses return HTTP 200 with a JSON `null`. The worker rounds each coordinate to a 0.25 degree grid and caches successful results for 12 minutes. The route sends only its latitude and longitude parameters to Open-Meteo. It never reads browser location.

The provider is Open-Meteo's keyless endpoint. Its free tier is for non-commercial use, under rate limits of 10,000 calls per day, 5,000 per hour, and 600 per minute. Data uses CC BY 4.0, so the interface must credit Open-Meteo. Commercial use requires a paid plan. Terms: https://open-meteo.com/en/terms.
