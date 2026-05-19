/**
 * Luchtfoto-viewer voor een locatie.
 *
 * Toont de Kadaster-luchtfoto (25cm resolutie) op basis van RD-coördinaten.
 * Met zoom-controls (50m / 100m / 200m bbox) en link naar volledige
 * PDOK-viewer voor inspectie.
 */

import { useState } from 'react';
import { luchtfotoUrl } from '../api/pdok';

interface LuchtfotoProps {
  rdX: number;
  rdY: number;
  lat: number;
  lon: number;
  hoogte?: number;
}

export function Luchtfoto({ rdX, rdY, lat, lon, hoogte = 400 }: LuchtfotoProps) {
  const [zoomMeter, setZoomMeter] = useState(50);

  if (!rdX || !rdY) {
    return (
      <div className="bg-gray-100 rounded-md p-6 text-center text-gray-500 text-sm">
        Selecteer eerst een adres om de luchtfoto te zien.
      </div>
    );
  }

  const url = luchtfotoUrl(rdX, rdY, zoomMeter, 800);
  const googleMapsUrl = `https://www.google.com/maps/@${lat},${lon},20z/data=!3m1!1e3`;

  return (
    <div className="space-y-2">
      <div
        className="rounded-md overflow-hidden border border-gray-200 bg-gray-100"
        style={{ height: hoogte }}
      >
        <img
          src={url}
          alt="Luchtfoto van locatie"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Zoom:</span>
          {[25, 50, 100, 200].map(m => (
            <button
              key={m}
              onClick={() => setZoomMeter(m)}
              className={`px-2 py-1 rounded transition-colors ${
                zoomMeter === m
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary-700 hover:underline"
        >
          Open in Google Maps ↗
        </a>
      </div>
      <p className="text-xs text-gray-500">
        Bron: Kadaster luchtfoto-actueel (25cm). Voor recente situatie eventueel ook Google Maps raadplegen.
      </p>
    </div>
  );
}
