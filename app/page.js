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

// ─── Banned jurisdictions ─────────────────────────────────────────────────────
// Flavored tobacco / nicotine-pouch bans by jurisdiction.
// 'stateAbbr' = entire state is banned.
// 'cities' = only these municipalities within that state are banned.

const BANNED_JURISDICTIONS = [
  // ── Statewide bans ──
  { stateAbbr: 'CA', stateName: 'California',    cities: [] }, // Prop 31 (2022)
  { stateAbbr: 'MA', stateName: 'Massachusetts',  cities: [] }, // Chapter 133 (2020)
  { stateAbbr: 'RI', stateName: 'Rhode Island',   cities: [] }, // statewide 2020

  // ── City / county bans ──
  { stateAbbr: 'OH', stateName: 'Ohio', cities: ['Columbus'] },
  {
    stateAbbr: 'NY', stateName: 'New York',
    cities: ['New York City', 'New York', 'Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'],
  },
  { stateAbbr: 'IL', stateName: 'Illinois',  cities: ['Chicago'] },
  { stateAbbr: 'MD', stateName: 'Maryland',  cities: ['Baltimore'] },
  { stateAbbr: 'MN', stateName: 'Minnesota', cities: ['Minneapolis', 'Saint Paul', 'St. Paul'] },
  { stateAbbr: 'OR', stateName: 'Oregon',    cities: ['Portland'] },
  { stateAbbr: 'WA', stateName: 'Washington', cities: ['Seattle'] },
  { stateAbbr: 'CO', stateName: 'Colorado',  cities: ['Denver', 'Boulder'] },
  { stateAbbr: 'AZ', stateName: 'Arizona',   cities: ['Tucson'] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Check if a {city, stateAbbr} is in a banned jurisdiction. Returns ban info or null. */
function detectBan(city, stateAbbr) {
  for (const j of BANNED_JURISDICTIONS) {
    if (j.stateAbbr !== stateAbbr) continue
    if (j.cities.length === 0) {
      // Whole state banned
      return { label: j.stateName, wholeState: true, stateAbbr }
    }
    const cityLower = city.toLowerCase()
    if (j.cities.some(c => cityLower.includes(c.toLowerCase()))) {
      return { label: city, wholeState: false, stateAbbr }
    }
  }
  return null
}

/** Return true if this store's vicinity is inside a known banned jurisdiction. */
function storeIsLegal(vicinity = '') {
  const v = vicinity.toLowerCase()
  for (const j of BANNED_JURISDICTIONS) {
    // Whole-state ban: look for the state abbreviation at end of address like ", CA" or ", CA 9xxxx"
    if (j.cities.length === 0) {
      if (new RegExp(`,\\s*${j.stateAbbr}\\b`, 'i').test(vicinity)) return false
    } else {
      // City ban: check if a banned city name + matching state appears in vicinity
      if (!new RegExp(`,\\s*${j.stateAbbr}\\b`, 'i').test(vicinity)) continue
      if (j.cities.some(c => v.includes(c.toLowerCase()))) return false
    }
  }
  return true
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
        const detectedBan = detectBan(data.city || '', data.stateAbbr || '')
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

      // Filter out any stores in banned jurisdictions
      const legal = all.filter(s => storeIsLegal(s.vicinity))
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
