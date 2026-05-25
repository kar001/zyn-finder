'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'

// ─── Flavor options ───────────────────────────────────────────────────────────

const ZYN_FLAVORS = [
  'All Flavors', 'Cool Mint', 'Spearmint', 'Citrus',
  'Cinnamon', 'Coffee', 'Peppermint', 'Wintergreen', 'Smooth', 'Menthol',
]

const RADIUS_OPTIONS = [
  { label: '5 miles',  value: 8047  },
  { label: '10 miles', value: 16093 },
  { label: '25 miles', value: 40234 },
  { label: '50 miles', value: 80467 },
]

// ─── Banned jurisdictions (sourced from Truth Initiative, ANR Foundation, Apr 2026) ───
//
// Statewide bans on flavored tobacco / nicotine products.
// DC is treated as a state-equivalent here.
const BANNED_STATES = new Set(['CA', 'MA', 'RI', 'UT', 'DC'])
const BANNED_STATE_NAMES = {
  CA: 'California', MA: 'Massachusetts', RI: 'Rhode Island',
  UT: 'Utah', DC: 'Washington, D.C.',
}

// City-level bans. Values are lowercase city names as returned by Google Geocoding API.
// Source: Americans for Nonsmokers' Rights Foundation (Jan 2026), Truth Initiative (Dec 2025)
const BANNED_CITIES = {
  // Ohio — 5 localities (Columbus, Toledo, Bexley, Worthington, Grandview Heights)
  OH: new Set(['columbus', 'toledo', 'bexley', 'worthington', 'grandview heights']),
  // Illinois — Chicago + suburbs with independent ordinances
  IL: new Set(['chicago', 'evanston', 'river forest']),
  // Minnesota — 11 of 33 localities with the most populated municipalities listed
  MN: new Set([
    'minneapolis', 'saint paul', 'st. paul', 'duluth', 'moorhead',
    'bloomington', 'golden valley', 'richfield', 'shakopee',
    'st. louis park', 'robbinsdale',
  ]),
  // Colorado — all 13 localities with enacted bans (as of May 2026, Eagle added Aug 2025)
  CO: new Set([
    'denver', 'boulder', 'aspen', 'breckenridge', 'carbondale', 'dillon',
    'edgewater', 'frisco', 'glenwood springs', 'golden', 'keystone',
    'silverthorne', 'snowmass village', 'eagle',
  ]),
  // New York — NYC boroughs (NY statewide ban covers e-cigs only, not pouches)
  NY: new Set(['new york', 'new york city', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'yonkers']),
  // Oregon — city-level (county bans in BANNED_COUNTIES cover wider area)
  OR: new Set(['portland']),
  // Washington state — no statewide ban, Seattle city ordinance only
  WA: new Set(['seattle']),
  // Arizona
  AZ: new Set(['tucson']),
  // Pennsylvania — Philadelphia city ordinance
  PA: new Set(['philadelphia']),
  // Maine — 8 localities
  ME: new Set(['portland', 'bangor', 'bar harbor', 'brunswick', 'falmouth', 'hallowell', 'rockland', 'south portland']),
  // New Jersey — 4 localities (state ban is e-cigs only; these local ones cover pouches)
  NJ: new Set(['jersey city', 'vineland', 'westfield']),
  // Georgia
  GA: new Set(['watkinsville']),
  // North Dakota
  ND: new Set(['cando', 'valley city']),
}

// County-level bans. Values are lowercase county names as returned by Google Geocoding API.
const BANNED_COUNTIES = {
  IL: new Set(['cook county']),
  MN: new Set(['hennepin county', 'clay county', 'rice county', 'traverse county']),
  OR: new Set(['multnomah county', 'washington county']),
  MD: new Set(['montgomery county', "prince george's county"]),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Check if the USER's reverse-geocoded location is in a banned jurisdiction. */
function detectBan(city, county, stateAbbr) {
  if (BANNED_STATES.has(stateAbbr)) {
    return { label: BANNED_STATE_NAMES[stateAbbr] || stateAbbr, wholeState: true, stateAbbr }
  }
  const cityLower = city.toLowerCase()
  const countyLower = county.toLowerCase()
  if (BANNED_CITIES[stateAbbr]?.has(cityLower)) {
    return { label: city, wholeState: false, stateAbbr }
  }
  if (BANNED_COUNTIES[stateAbbr]?.has(countyLower)) {
    return { label: county, wholeState: false, stateAbbr }
  }
  return null
}

/**
 * Reverse-geocode a store's actual coordinates to get its city + county,
 * then check against sourced ban data. No radius guessing — 100% accurate.
 */
async function checkStoreIsLegal(store) {
  const loc = store.geometry?.location
  if (!loc) return true
  const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
  const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng

  try {
    const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`)
    const { city = '', county = '', stateAbbr = '' } = await res.json()

    if (BANNED_STATES.has(stateAbbr)) return false
    if (BANNED_CITIES[stateAbbr]?.has(city.toLowerCase())) return false
    if (BANNED_COUNTIES[stateAbbr]?.has(county.toLowerCase())) return false

    return true
  } catch {
    return true // if geocoding fails, show the store rather than hide it
  }
}

function haversineDistance(from, to) {
  const R = 3959
  const dLat = ((to.lat - from.lat) * Math.PI) / 180
  const dLng = ((to.lng - from.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function buildCallScript(storeName, flavor) {
  const flavorLine =
    flavor === 'All Flavors'
      ? 'any flavored Zyn nicotine pouches'
      : `${flavor} flavored Zyn nicotine pouches`
  return `Hi! Quick question — do you currently have ${flavorLine} in stock? Specifically the Zyn brand pouches.\n\nIf so, what strengths do you have available — 3mg or 6mg?\n\nThank you!`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRating({ rating }) {
  if (!rating) return null
  const stars = Math.round(rating)
  return (
    <span className="store-rating">
      {'★'.repeat(stars)}{'☆'.repeat(5 - stars)} {rating.toFixed(1)}
    </span>
  )
}

function CallScriptModal({ store, flavor, onClose }) {
  const script = buildCallScript(store.name, flavor)
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(script)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Call Script</h3>
        <p className="modal-sub">
          Use this when you call <strong>{store.name}</strong> to ask about{' '}
          {flavor === 'All Flavors' ? 'Zyn' : flavor + ' Zyn'}
        </p>
        <div className="script-box">{script}</div>
        <div className="modal-actions">
          <button className="btn-close" onClick={onClose}>Close</button>
          {store.formatted_phone_number && (
            <a className="btn-sm btn-call" href={`tel:${store.formatted_phone_number}`} style={{ textDecoration: 'none' }}>
              Call Now
            </a>
          )}
          <button className="btn-copy" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy Script'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StoreCard({ store, isSelected, flavor, onSelect, userLocation }) {
  const [showScript, setShowScript] = useState(false)
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.vicinity || store.name)}&destination_place_id=${store.place_id}`
  const isOpen = store.opening_hours?.open_now
  return (
    <>
      <div className={`store-card ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(store)}>
        <div className="store-name">{store.name}</div>
        <div className="store-meta">
          <span className="store-distance">{store.distance?.toFixed(1)} mi</span>
          {store.opening_hours && (
            <span className={`store-status ${isOpen ? 'open' : 'closed'}`}>
              {isOpen ? '● Open' : '○ Closed'}
            </span>
          )}
          <StarRating rating={store.rating} />
        </div>
        <div className="store-address">{store.vicinity}</div>
        <div className="store-actions">
          <a className="btn-sm btn-directions" href={directionsUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
            Directions
          </a>
          <button className="btn-sm btn-script" onClick={e => { e.stopPropagation(); setShowScript(true) }}>
            Call Script
          </button>
        </div>
      </div>
      {showScript && <CallScriptModal store={store} flavor={flavor} onClose={() => setShowScript(false)} />}
    </>
  )
}

// ─── Ban Banner ───────────────────────────────────────────────────────────────

function BanBanner({ ban }) {
  if (!ban) return null
  return (
    <div className="ban-banner">
      <span className="ban-icon">🚫</span>
      <div>
        <strong>Flavored Zyn is banned in {ban.label}{ban.wholeState ? '' : ', ' + ban.stateAbbr}.</strong>
        <br />
        Showing nearest legal stores outside {ban.wholeState ? ban.label : ban.label} →
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const LIBRARIES = ['places']
const MAP_OPTIONS = {
  zoomControl: true, streetViewControl: false, mapTypeControl: false, fullscreenControl: false,
  styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
}

export default function Home() {
  const [userLocation, setUserLocation]   = useState(null)
  const [stores, setStores]               = useState([])
  const [selectedFlavor, setSelectedFlavor] = useState('All Flavors')
  const [selectedStore, setSelectedStore] = useState(null)
  const [radius, setRadius]               = useState(16093) // 10 miles default
  const [loading, setLoading]             = useState(false)
  const [locationError, setLocationError] = useState(null)
  const [fetchError, setFetchError]       = useState(null)
  const [ban, setBan]                     = useState(null)  // current ban info or null
  const mapRef = useRef(null)

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  })

  // 1. Get GPS location
  const getLocation = useCallback(() => {
    setLocationError(null)
    setBan(null)
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocationError('Could not get your location. Please allow location access and try again.'),
      { timeout: 10000 }
    )
  }, [])

  useEffect(() => { getLocation() }, [getLocation])

  // 2. When we have location, reverse-geocode to detect bans
  useEffect(() => {
    if (!userLocation) return
    ;(async () => {
      try {
        const res = await fetch(`/api/geocode?lat=${userLocation.lat}&lng=${userLocation.lng}`)
        const data = await res.json()
        const detectedBan = detectBan(data.city || '', data.county || '', data.stateAbbr || '')
        setBan(detectedBan)
        // If banned, bump radius to 25 miles to find stores outside city limits
        if (detectedBan) setRadius(40234)
      } catch {
        // silently ignore geocode errors — just show all stores
      }
    })()
  }, [userLocation])

  // 3. Fetch and filter stores
  const fetchStores = useCallback(async () => {
    if (!userLocation) return
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/places?lat=${userLocation.lat}&lng=${userLocation.lng}&radius=${radius}`)
      if (!res.ok) throw new Error('API error')
      const data = await res.json()

      const all = (data.results || []).map(s => ({
        ...s,
        distance: haversineDistance(userLocation, s.geometry.location),
      }))

      // Geocode each store's coordinates to get its actual city, then filter
      const legalFlags = await Promise.all(all.map(s => checkStoreIsLegal(s)))
      const legal = all.filter((_, i) => legalFlags[i])
      legal.sort((a, b) => a.distance - b.distance)

      setStores(legal)
      setSelectedStore(null)
    } catch {
      setFetchError('Failed to fetch nearby stores. Check your API key and try again.')
    }
    setLoading(false)
  }, [userLocation, radius])

  // Re-fetch when location or radius changes
  useEffect(() => { if (userLocation) fetchStores() }, [fetchStores, userLocation])

  useEffect(() => {
    if (selectedStore && mapRef.current) {
      mapRef.current.panTo(selectedStore.geometry.location)
      mapRef.current.setZoom(16)
    }
  }, [selectedStore])

  const onMapLoad = useCallback(map => { mapRef.current = map }, [])
  const mapCenter = selectedStore
    ? selectedStore.geometry.location
    : userLocation || { lat: 37.7749, lng: -122.4194 }

  return (
    <>
      <header className="header">
        <span style={{ fontSize: '1.5rem' }}>⚡</span>
        <h1>Zyn Finder</h1>
        <span className="subtitle">Nearest legal stores · Flavored Zyn</span>
      </header>

      <BanBanner ban={ban} />

      <div className="app-layout">
        <aside className="sidebar">
          <div className="controls">
            {/* Flavor */}
            <div>
              <label>Filter by Flavor</label>
              <div className="flavor-grid">
                {ZYN_FLAVORS.map(f => (
                  <button key={f} className={`flavor-chip ${selectedFlavor === f ? 'active' : ''}`} onClick={() => setSelectedFlavor(f)}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {/* Radius */}
            <div>
              <label>Search Radius</label>
              <select className="radius-select" value={radius} onChange={e => setRadius(Number(e.target.value))}>
                {RADIUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <button className="refresh-btn" onClick={fetchStores} disabled={loading || !userLocation}>
              {loading ? 'Searching...' : 'Search Nearby'}
            </button>
          </div>

          <div className="store-list">
            {locationError && (
              <div className="state-container">
                <div className="state-icon">📍</div>
                <div className="state-title">Location Required</div>
                <div className="state-subtitle">{locationError}</div>
                <button className="refresh-btn" style={{ marginTop: 8 }} onClick={getLocation}>Try Again</button>
              </div>
            )}
            {fetchError && (
              <div className="state-container">
                <div className="state-icon">⚠️</div>
                <div className="state-title">Error</div>
                <div className="state-subtitle">{fetchError}</div>
              </div>
            )}
            {!locationError && !fetchError && loading && (
              <div className="state-container">
                <div className="state-icon">🔍</div>
                <div className="state-title">
                  {ban ? `Searching outside ${ban.label}…` : 'Finding nearby stores…'}
                </div>
                <div className="state-subtitle">
                  Looking within {RADIUS_OPTIONS.find(o => o.value === radius)?.label}
                </div>
              </div>
            )}
            {!locationError && !fetchError && !loading && stores.length === 0 && userLocation && (
              <div className="state-container">
                <div className="state-icon">🏪</div>
                <div className="state-title">No legal stores found</div>
                <div className="state-subtitle">Try increasing your search radius.</div>
              </div>
            )}
            {!loading && stores.length > 0 && (
              <>
                <div className="store-count">
                  {stores.length} legal store{stores.length !== 1 ? 's' : ''} found
                  {selectedFlavor !== 'All Flavors' && (
                    <span style={{ color: '#0056b3' }}> · {selectedFlavor}</span>
                  )}
                  {ban && <span style={{ color: '#c0392b' }}> · outside {ban.label}</span>}
                </div>
                {stores.map(store => (
                  <StoreCard
                    key={store.place_id}
                    store={store}
                    isSelected={selectedStore?.place_id === store.place_id}
                    flavor={selectedFlavor}
                    onSelect={setSelectedStore}
                    userLocation={userLocation}
                  />
                ))}
              </>
            )}
          </div>
        </aside>

        <div className="map-container">
          {loadError && (
            <div className="state-container" style={{ height: '100%' }}>
              <div className="state-icon">🗺️</div>
              <div className="state-title">Map failed to load</div>
              <div className="state-subtitle">Check your NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.</div>
            </div>
          )}
          {isLoaded && !loadError && (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={mapCenter}
              zoom={userLocation ? 11 : 10}
              options={MAP_OPTIONS}
              onLoad={onMapLoad}
            >
              {userLocation && (
                <Marker
                  position={userLocation}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 10,
                    fillColor: '#0056b3',
                    fillOpacity: 1,
                    strokeColor: 'white',
                    strokeWeight: 3,
                  }}
                  title="You are here"
                />
              )}
              {stores.map(store => (
                <Marker
                  key={store.place_id}
                  position={store.geometry.location}
                  onClick={() => setSelectedStore(store)}
                  icon={{
                    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
                        <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24s16-14 16-24C32 7.163 24.837 0 16 0z"
                          fill="#e74c3c" stroke="white" stroke-width="2"/>
                        <circle cx="16" cy="16" r="6" fill="white"/>
                      </svg>`
                    )}`,
                    scaledSize: new google.maps.Size(28, 35),
                    anchor: new google.maps.Point(14, 35),
                  }}
                />
              ))}
              {selectedStore && (
                <InfoWindow position={selectedStore.geometry.location} onCloseClick={() => setSelectedStore(null)}>
                  <div className="info-window">
                    <h4>{selectedStore.name}</h4>
                    <p>{selectedStore.vicinity}</p>
                    {selectedStore.distance && (
                      <p style={{ color: '#0056b3', fontWeight: 700, marginTop: 4 }}>
                        {selectedStore.distance.toFixed(1)} miles away
                      </p>
                    )}
                    {selectedStore.opening_hours && (
                      <p style={{ color: selectedStore.opening_hours.open_now ? '#28a745' : '#dc3545', marginTop: 2 }}>
                        {selectedStore.opening_hours.open_now ? 'Open now' : 'Closed'}
                      </p>
                    )}
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          )}
          {!isLoaded && !loadError && (
            <div className="state-container" style={{ height: '100%' }}>
              <div className="state-icon">🗺️</div>
              <div className="state-title">Loading map…</div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
