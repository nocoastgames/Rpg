import * as THREE from "three";

/**
 * Time-of-day lighting. Everything that sets the mood (sun, sky, fog, colour
 * grade, glows) comes from a preset, so a day/night cycle only has to call
 * `lightingAt(hour)` and apply the result. Base material colours stay
 * neutral; only light and grading change.
 */
export interface LightingPreset {
  sky: THREE.Color;
  fogNear: number;
  fogFar: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Sun direction in degrees: azimuth around Y (0 = +Z, 90 = +X) and elevation above the horizon. */
  sunAzimuth: number;
  sunElevation: number;
  exposure: number;
  /** Post grade: 1 = untouched colour, <1 desaturates. */
  saturation: number;
  /** Multiplier applied to shadowed tones (cool shadows at night). */
  shadowTint: THREE.Color;
  /** Corner darkening 0..1. */
  vignette: number;
  /** Player lantern intensity (0 = off). */
  lantern: number;
  /** Landmark glow multiplier (rune seal, cave thorns). */
  glow: number;
  /** Firefly visibility 0..1. */
  fireflies: number;
  /** Brightness of the (unlit) water shader. */
  water: number;
}

interface PresetDef {
  sky: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunAzimuth: number;
  sunElevation: number;
  exposure: number;
  saturation: number;
  shadowTint: string;
  vignette: number;
  lantern: number;
  glow: number;
  fireflies: number;
  water: number;
}

const DEFS: Record<"night" | "dawn" | "day" | "dusk", PresetDef> = {
  night: {
    sky: "#0b1016",
    fogNear: 70,
    fogFar: 150,
    hemiSky: "#4a5a80",
    hemiGround: "#10140f",
    hemiIntensity: 0.9,
    sunColor: "#9fb4ff",
    sunIntensity: 0.9,
    sunAzimuth: 300,
    sunElevation: 40,
    exposure: 0.95,
    saturation: 0.7,
    shadowTint: "#c8d8ff",
    vignette: 0.6,
    lantern: 20,
    glow: 1.4,
    fireflies: 1,
    water: 0.45,
  },
  dawn: {
    sky: "#3a3440",
    fogNear: 100,
    fogFar: 190,
    hemiSky: "#c8b8d8",
    hemiGround: "#3a3a2a",
    hemiIntensity: 1.1,
    sunColor: "#ffb07a",
    sunIntensity: 2.0,
    sunAzimuth: 70,
    sunElevation: 18,
    exposure: 1.0,
    saturation: 0.92,
    shadowTint: "#e0d8f0",
    vignette: 0.3,
    lantern: 8,
    glow: 0.8,
    fireflies: 0.3,
    water: 0.8,
  },
  day: {
    sky: "#22302a",
    fogNear: 120,
    fogFar: 210,
    hemiSky: "#d6e6ff",
    hemiGround: "#3a4a2a",
    hemiIntensity: 1.2,
    sunColor: "#fff0d6",
    sunIntensity: 2.5,
    sunAzimuth: 320,
    sunElevation: 52,
    exposure: 1.05,
    saturation: 1,
    shadowTint: "#ffffff",
    vignette: 0.18,
    lantern: 0,
    glow: 0.6,
    fireflies: 0,
    water: 1,
  },
  dusk: {
    sky: "#1a1a22",
    fogNear: 90,
    fogFar: 175,
    hemiSky: "#7d8fb0",
    hemiGround: "#232b1e",
    hemiIntensity: 1.1,
    sunColor: "#ffaa6a",
    sunIntensity: 2.2,
    sunAzimuth: 250,
    sunElevation: 14,
    exposure: 1.0,
    saturation: 0.85,
    shadowTint: "#d8e4ff",
    vignette: 0.45,
    lantern: 16,
    glow: 1.1,
    fireflies: 0.7,
    water: 0.7,
  },
};

/** Keyframes over a 24 h day; the cycle wraps from 24 back to 0. */
const KEYS: Array<[hour: number, preset: keyof typeof DEFS]> = [
  [0, "night"],
  [4.5, "night"],
  [6, "dawn"],
  [8.5, "day"],
  [17, "day"],
  [19, "dusk"],
  [20.5, "night"],
  [24, "night"],
];

function toPreset(d: PresetDef): LightingPreset {
  return {
    ...d,
    sky: new THREE.Color(d.sky),
    hemiSky: new THREE.Color(d.hemiSky),
    hemiGround: new THREE.Color(d.hemiGround),
    sunColor: new THREE.Color(d.sunColor),
    shadowTint: new THREE.Color(d.shadowTint),
  };
}

function lerpAngleDeg(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

function mix(a: LightingPreset, b: LightingPreset, t: number): LightingPreset {
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    sky: a.sky.clone().lerp(b.sky, t),
    fogNear: n(a.fogNear, b.fogNear),
    fogFar: n(a.fogFar, b.fogFar),
    hemiSky: a.hemiSky.clone().lerp(b.hemiSky, t),
    hemiGround: a.hemiGround.clone().lerp(b.hemiGround, t),
    hemiIntensity: n(a.hemiIntensity, b.hemiIntensity),
    sunColor: a.sunColor.clone().lerp(b.sunColor, t),
    sunIntensity: n(a.sunIntensity, b.sunIntensity),
    sunAzimuth: lerpAngleDeg(a.sunAzimuth, b.sunAzimuth, t),
    sunElevation: n(a.sunElevation, b.sunElevation),
    exposure: n(a.exposure, b.exposure),
    saturation: n(a.saturation, b.saturation),
    shadowTint: a.shadowTint.clone().lerp(b.shadowTint, t),
    vignette: n(a.vignette, b.vignette),
    lantern: n(a.lantern, b.lantern),
    glow: n(a.glow, b.glow),
    fireflies: n(a.fireflies, b.fireflies),
    water: n(a.water, b.water),
  };
}

/** Lighting for an hour of the day (0..24, wraps). */
export function lightingAt(hour: number): LightingPreset {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, p0] = KEYS[i]!;
    const [h1, p1] = KEYS[i + 1]!;
    if (h >= h0 && h <= h1) {
      const t = h1 > h0 ? (h - h0) / (h1 - h0) : 0;
      const s = t * t * (3 - 2 * t); // ease between keyframes
      return mix(toPreset(DEFS[p0]), toPreset(DEFS[p1]), s);
    }
  }
  return toPreset(DEFS.day);
}

/** Unit vector pointing from the scene toward the sun. */
export function sunDirection(p: LightingPreset): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(p.sunAzimuth);
  const el = THREE.MathUtils.degToRad(p.sunElevation);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/** Underground: no sky, no sun; only torches and your lantern. */
export function dungeonLighting(): LightingPreset {
  return toPreset({
    ...DEFS.night,
    sky: "#030303",
    fogNear: 60,
    fogFar: 140,
    hemiSky: "#5a4a3a",
    hemiGround: "#0a0806",
    hemiIntensity: 0.55,
    sunColor: "#6a7aa0",
    sunIntensity: 0.15,
    lantern: 10,
    glow: 1,
    fireflies: 0,
    vignette: 0.7,
  });
}

/** Default hour until the server drives a real cycle (mid-morning). */
export const DEFAULT_HOUR = 10;
