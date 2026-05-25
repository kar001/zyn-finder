# Zyn Finder

Find the nearest gas stations and convenience stores that carry flavored Zyn nicotine pouches — with a map, sorted list, and a built-in call script so you can quickly ask if your flavor is in stock.

---

## Setup (5 minutes)

### Step 1 — Get a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and sign in (free account works)
2. Create a new project (or select an existing one)
3. Go to **APIs & Services → Library** and enable both:
   - **Maps JavaScript API**
   - **Places API**
4. Go to **APIs & Services → Credentials → Create Credentials → API Key**
5. Copy your API key

> **Cost:** Google gives you $200/month free — more than enough for personal use.

---

### Step 2 — Configure your environment

1. In the project folder, copy `.env.example` to `.env.local`:
   ```
   cp .env.example .env.local
   ```
2. Open `.env.local` and replace `your_google_maps_api_key_here` with your actual key in **both** places:
   ```
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...yourkey...
   GOOGLE_MAPS_API_KEY=AIza...yourkey...
   ```

---

### Step 3 — Run locally (optional)

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — allow location access when prompted.

---

### Step 4 — Deploy to Vercel

1. Push this folder to a GitHub repository
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Before deploying, go to **Settings → Environment Variables** and add:
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` = your key
   - `GOOGLE_MAPS_API_KEY` = your key
4. Click **Deploy** — done!

> Vercel will give you a public URL like `https://zyn-finder.vercel.app`

---

## Features

- **Live map** with pins for every nearby gas station and convenience store
- **Sorted list** by distance with open/closed status and star ratings
- **Flavor filter** — select Cool Mint, Citrus, Spearmint, etc.
- **Call Script** — tap "Call Script" on any store to get a ready-to-use script asking about your flavor
- **Directions** — one tap opens Google Maps turn-by-turn
- **Adjustable radius** — search 1 to 25 miles

---

## Notes

Google Places doesn't have real-time product inventory data, so this app shows all nearby gas stations and convenience stores (the store types that carry Zyn). Use the **Call Script** button to quickly call and confirm your flavor is in stock before making the trip.

---

## Tech Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [@react-google-maps/api](https://www.npmjs.com/package/@react-google-maps/api)
- Google Places Nearby Search API
- Deployed on [Vercel](https://vercel.com)
