import requests
import json

url = "http://127.0.0.1:5001/api/starseed/weather-all?lat=18.9226&lon=-99.2347"
try:
    res = requests.get(url)
    data = res.json()
    # Mask large arrays to keep logs clean
    if 'terrestrial' in data:
        if 'hourly' in data['terrestrial']:
            data['terrestrial']['hourly'] = "HOURLY DATA TRUNCATED"
        if 'daily' in data['terrestrial']:
            data['terrestrial']['daily'] = "DAILY DATA TRUNCATED"
        if 'air_quality' in data['terrestrial'] and 'hourly' in data['terrestrial']['air_quality']:
             data['terrestrial']['air_quality']['hourly'] = "HOURLY AIR QUALITY TRUNCATED"
    print(json.dumps(data, indent=2))
except Exception as e:
    print("Error:", e)
