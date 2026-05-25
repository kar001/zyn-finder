export const runtime = 'edge'

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

  // Search for both gas stations and convenience stores — the types that carry Zyn
  const types = ['gas_station', 'convenience_store']
  const allResults = []
  const seenIds = new Set()

  for (const type of types) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json')
    url.searchParams.set('location', `${lat},${lng}`)
    url.searchParams.set('radius', radius)
    url.searchParams.set('type', type)
    url.searchParams.set('key', apiKey)

    const res = await fetch(url.toString())
    const data = await res.json()

    if (data.results) {
      for (const place of data.results) {
        if (!seenIds.has(place.place_id)) {
          seenIds.add(place.place_id)
          allResults.push(place)
        }
      }
    }
  }

  return Response.json({ results: allResults })
}
