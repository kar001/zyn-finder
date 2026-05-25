export const runtime = 'edge'

// Store types that typically carry Zyn
const STORE_TYPES = ['gas_station', 'convenience_store', 'pharmacy']

async function fetchPage(apiKey, params) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('key', apiKey)
  const res = await fetch(url.toString())
  return res.json()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  const radius = searchParams.get('radius') || '8000'

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'Google Maps API key not configured' }, { status: 500 })
  }

  const seenIds = new Set()
  const allResults = []

  function merge(results) {
    for (const place of results || []) {
      if (!seenIds.has(place.place_id)) {
        seenIds.add(place.place_id)
        allResults.push(place)
      }
    }
  }

  // ── Page 1: fetch all store types in parallel ───────────────────────────
  const page1 = await Promise.all(
    STORE_TYPES.map(type =>
      fetchPage(apiKey, { location: `${lat},${lng}`, radius, type })
    )
  )
  const nextTokens = []
  for (const data of page1) {
    merge(data.results)
    if (data.next_page_token) nextTokens.push(data.next_page_token)
  }

  // ── Page 2: Google requires a ~2s delay before using next_page_token ────
  if (nextTokens.length > 0) {
    await new Promise(r => setTimeout(r, 2200))
    const page2 = await Promise.all(
      nextTokens.map(pagetoken => fetchPage(apiKey, { pagetoken }))
    )
    for (const data of page2) {
      merge(data.results)
    }
  }

  return Response.json({ results: allResults })
}
