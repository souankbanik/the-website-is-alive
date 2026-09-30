import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STAGE_LABEL } from '../../store/records';
import { Visitor } from '../store';
import { Card, countryName, displayName, Empty, placeLabel } from '../ui';
import { openVisitor } from '../Admin';

// standard OpenStreetMap tiles, darkened in CSS (.map .leaflet-tile-pane)
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const located = (v: Visitor) => v.net?.lat != null && v.net?.lon != null;

interface Spot {
  key: string;
  lat: number;
  lon: number;
  label: string;
  people: Visitor[];
}

/** group visitors that share a city so one marker stands for the place */
function spots(visitors: Visitor[]): Spot[] {
  const by = new Map<string, Spot>();
  for (const v of visitors) {
    if (!located(v)) continue;
    const key = v.net!.city ? `${v.net!.city}|${v.net!.country}` : `${v.net!.lat!.toFixed(1)}|${v.net!.lon!.toFixed(1)}`;
    let s = by.get(key);
    if (!s) by.set(key, (s = { key, lat: v.net!.lat!, lon: v.net!.lon!, label: placeLabel(v.net, true), people: [] }));
    s.people.push(v);
  }
  return [...by.values()];
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function VisitorMap({ visitors, height = 520, zoom }: { visitors: Visitor[]; height?: number; zoom?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const data = useMemo(() => spots(visitors), [visitors]);

  useEffect(() => {
    const m = L.map(el.current!, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([20, 10], 2);
    L.tileLayer(TILES, { attribution: ATTRIB, maxZoom: 18 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // clicks inside popups open the visitor
    const onClick = (e: MouseEvent) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-visitor]')?.dataset.visitor;
      if (id) openVisitor(id);
    };
    el.current!.addEventListener('click', onClick);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const s of data) {
      const n = s.people.length;
      const live = s.people.some((p) => p.live);
      const list = s.people
        .slice(0, 12)
        .map((p) => `<li data-visitor="${p.id}">${esc(displayName(p))}<span>${p.live ? 'live' : esc(STAGE_LABEL[p.furthest])}</span></li>`)
        .join('');
      L.circleMarker([s.lat, s.lon], {
        radius: 5 + Math.sqrt(n) * 3,
        color: live ? '#0ca30c' : '#7c5cff',
        weight: 2,
        fillColor: live ? '#0ca30c' : '#7c5cff',
        fillOpacity: 0.35,
      })
        .bindPopup(
          `<div class="map-pop"><strong>${esc(s.label)}</strong><em>${n} visitor${n === 1 ? '' : 's'}</em><ul>${list}</ul>${n > 12 ? `<small>+${n - 12} more</small>` : ''}</div>`,
        )
        .bindTooltip(`${esc(s.label)} · ${n}`, { direction: 'top' })
        .addTo(g);
    }
    if (data.length === 1) m.setView([data[0].lat, data[0].lon], zoom ?? 8);
    else if (data.length > 1) m.fitBounds(L.latLngBounds(data.map((s) => [s.lat, s.lon] as [number, number])).pad(0.2), { maxZoom: 6 });
  }, [data, zoom]);

  return <div ref={el} className="map" style={{ height }} />;
}

export default function MapView({ visitors }: { visitors: Visitor[] }) {
  const withLoc = visitors.filter(located);
  const countries = useMemo(() => {
    const c = new Map<string, number>();
    for (const v of visitors) if (v.net?.country) c.set(v.net.country, (c.get(v.net.country) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [visitors]);
  const cities = useMemo(() => spots(visitors).sort((a, b) => b.people.length - a.people.length).slice(0, 10), [visitors]);

  if (!visitors.length) return <Empty>No visitors yet.</Empty>;
  return (
    <div className="map-page">
      <Card title={`Visitor locations · ${withLoc.length} of ${visitors.length} located`} className="map-card">
        <VisitorMap visitors={visitors} />
        <p className="muted small map-foot">
          Approximate, from each visitor’s IP address (city level). Green markers have someone playing right now.
        </p>
      </Card>
      <div className="map-side">
        <Card title="Top countries">
          {countries.length ? (
            <ul className="rank">
              {countries.slice(0, 10).map(([cc, n]) => (
                <li key={cc}>
                  <span className="cc">{cc}</span>
                  <span>{countryName(cc)}</span>
                  <span className="rank-bar">
                    <span style={{ width: `${(n / countries[0][1]) * 100}%` }} />
                  </span>
                  <span className="num">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No location data yet.</p>
          )}
        </Card>
        <Card title="Top cities">
          {cities.length ? (
            <ul className="rank">
              {cities.map((s) => (
                <li key={s.key}>
                  <span className="cc">{s.people[0].net!.country}</span>
                  <span>{s.people[0].net!.city || countryName(s.people[0].net!.country)}</span>
                  <span className="rank-bar">
                    <span style={{ width: `${(s.people.length / cities[0].people.length) * 100}%` }} />
                  </span>
                  <span className="num">{s.people.length}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No location data yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
