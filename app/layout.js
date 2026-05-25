import './globals.css'

export const metadata = {
  title: 'Flavored Zynn Finder — Find Flavored Zyn Near You',
  description: 'Locate nearby gas stations and convenience stores that carry flavored Zyn nicotine pouches.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
