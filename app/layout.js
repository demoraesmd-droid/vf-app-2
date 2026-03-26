import './globals.css'

export const metadata = {
  title: 'Visual Field Extractor',
  description: 'Extract Humphrey Visual Field data to Excel',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
