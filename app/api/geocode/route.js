export const runtime = 'edge'

/** Parse address_components into city/county/state fields */
function parseComponents(components) {
  let city = '', county = '', state = '', stateAbbr = ''
  for (const c of components || []) {
    if (c.types.includes('locality') && !city) city = c.long_name
    if (c.types.includes('sublocality') && !city) city = c.long_name
    if (c.types.includes('administrative_area_level_2') && !county) county = c.long_name
    if (c.types.includes('administrative_area_level_1') && !state) {
      state = c.long_name
      stateAbbr = c.short_name
    }
  }
  return { city, county, state, stateAbbr }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  // ── Forward geocode: ZIP code → lat/lng + location info ──────────────────
  const zip = searchParams.get('zip')
  if (zip) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(zip)}&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.results?.length) {
      return Response.json({ error: 'ZIP code not found' }, { status: 404 })
    }
    const result = data.results[0]
    const { lat, lng } = result.geometry.location
    const loc = parseComponents(result.address_components)
    return Response.json({ lat, lng, ...loc })
  }

  // ── Reverse geocode: lat/lng → location info ──────────────────────────────
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')
  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
  const res = await fetch(url)
  const data = await res.json()

  let city = '', county = '', state = '', stateAbbr = ''
  for (const result of data.results || []) {
    const loc = parseComponents(result.address_components)
    if (!city && loc.city) city = loc.city
    if (!county && loc.county) county = loc.county
    if (!state && loc.state) { state = loc.state; stateAbbr = loc.stateAbbr }
    if (city && state) break
  }

  return Response.json({ city, county, state, stateAbbr })
}
