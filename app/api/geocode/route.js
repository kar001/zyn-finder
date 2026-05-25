export const runtime = 'edge'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get('lat')
  const lng = searchParams.get('lng')

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
  const res = await fetch(url)
  const data = await res.json()

  // Pull out just the useful bits: city, county, state
  let city = '', county = '', state = '', stateAbbr = ''
  for (const result of data.results || []) {
    for (const c of result.address_components || []) {
      if (c.types.includes('locality') && !city) city = c.long_name
      if (c.types.includes('sublocality') && !city) city = c.long_name
      if (c.types.includes('administrative_area_level_2') && !county) county = c.long_name
      if (c.types.includes('administrative_area_level_1') && !state) {
        state = c.long_name
        stateAbbr = c.short_name
      }
    }
    if (city && state) break
  }

  return Response.json({ city, county, state, stateAbbr })
}
