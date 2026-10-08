/**
 * [WEB • APP] Dynamic Favicon Route
 *
 * (Small helper file — see code comments below.)
 */

import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

// Route segment config
export const dynamic = 'force-static'
export const runtime = 'nodejs'

// Image metadata
export const size = {
  width: 128,
  height: 128,
}
export const contentType = 'image/png'

// Image generation
export default function Icon() {
  // Read the clean square icon file
  const iconData = readFileSync(join(process.cwd(), 'public', 'icon.png'))
  const iconSrc = `data:image/png;base64,${iconData.toString('base64')}`

  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A2E5C',
          borderRadius: '24px',
          overflow: 'hidden',
          padding: '4px',
        }}
      >
        <img
          src={iconSrc}
          alt="Genius Library Icon"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
    ),
    // ImageResponse options
    {
      ...size,
    }
  )
}
