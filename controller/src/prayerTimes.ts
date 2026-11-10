import type { EventItem } from './protection.ts'

/**
 * Prayer times, the same calculation as the phone's `PrayerTimes.kt` (the standard astronomical
 * method published by PrayTimes.org: sun declination and equation of time, then the hour angle
 * for each sun altitude), so the console and the phone agree. Fajr and Isha at 18 degrees.
 * Hypothesis, not yet checked: that this matches the timetable of Tunisia's Ministry of
 * Religious Affairs.
 */
export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
export type Prayer = (typeof PRAYERS)[number]

export interface Place {
    lat: number
    lng: number
}

const FAJR_ANGLE = 18
const ISHA_ANGLE = 18
const SUNSET_ANGLE = 0.833
const DAY_MINUTES = 24 * 60

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const fix = (a: number, b: number) => a - b * Math.floor(a / b)
const dsin = (d: number) => Math.sin(rad(d))
const dcos = (d: number) => Math.cos(rad(d))

function julianDay(year: number, month: number, day: number): number {
    let y = year
    let m = month
    if (m <= 2) {
        y -= 1
        m += 12
    }
    const a = Math.floor(y / 100)
    const b = 2 - a + Math.floor(a / 4)
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5
}

function sun(jd: number): { declination: number; equationOfTime: number } {
    const d = jd - 2451545.0
    const g = fix(357.529 + 0.98560028 * d, 360)
    const q = fix(280.459 + 0.98564736 * d, 360)
    const l = fix(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g), 360)
    const e = 23.439 - 0.00000036 * d
    const ra = deg(Math.atan2(dcos(e) * dsin(l), dcos(l))) / 15
    return { declination: deg(Math.asin(dsin(e) * dsin(l))), equationOfTime: q / 15 - fix(ra, 24) }
}

/**
 * Minutes after local midnight for each prayer on one civil date. A prayer the sun never reaches
 * that day (far north in summer) is absent rather than guessed.
 */
export function prayerTimes(year: number, month: number, day: number, place: Place, utcOffsetMinutes: number): Partial<Record<Prayer, number>> {
    const jd = julianDay(year, month, day) - place.lng / (15 * 24)
    const tz = utcOffsetMinutes / 60
    const noon = (portion: number) => fix(12 - sun(jd + portion).equationOfTime, 24) + tz - place.lng / 15
    const hourAngle = (altitude: number, portion: number) => {
        const decl = sun(jd + portion).declination
        const x = (dsin(altitude) - dsin(place.lat) * dsin(decl)) / (dcos(place.lat) * dcos(decl))
        return x < -1 || x > 1 ? Number.NaN : deg(Math.acos(x)) / 15
    }
    const asrAltitude = (portion: number) => {
        const decl = sun(jd + portion).declination
        return deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(place.lat - decl))))))
    }
    const hours: Record<Prayer, number> = {
        fajr: noon(5 / 24) - hourAngle(-FAJR_ANGLE, 5 / 24),
        dhuhr: noon(12 / 24),
        asr: noon(13 / 24) + hourAngle(asrAltitude(13 / 24), 13 / 24),
        maghrib: noon(18 / 24) + hourAngle(-SUNSET_ANGLE, 18 / 24),
        isha: noon(18 / 24) + hourAngle(-ISHA_ANGLE, 18 / 24),
    }
    const result: Partial<Record<Prayer, number>> = {}
    for (const prayer of PRAYERS) {
        const hour = hours[prayer]
        if (!Number.isNaN(hour)) result[prayer] = fix(Math.round(hour * 60), DAY_MINUTES)
    }
    return result
}

export interface PrayerDay {
    /** YYYY-MM-DD, local. */
    date: string
    times: Partial<Record<Prayer, number>>
}

/** The browser's own UTC offset on that date, so summer time is right where it applies. */
export function browserOffset(year: number, month: number, day: number): number {
    return -new Date(year, month - 1, day, 12).getTimezoneOffset()
}

/** [days] consecutive days from [start] (local midnight), each with its five times. */
export function prayerSeries(start: Date, days: number, place: Place, offset = browserOffset): PrayerDay[] {
    const series: PrayerDay[] = []
    for (let i = 0; i < days; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12)
        const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate()
        series.push({
            date: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            times: prayerTimes(y, m, day, place, offset(y, m, day)),
        })
    }
    return series
}

/**
 * The phone's most recent location fix, rounded to about a kilometre: prayer times move by
 * seconds over that distance, and the console has no reason to hold the exact spot.
 */
export function lastPlace(events: EventItem[]): (Place & { at: string }) | null {
    let best: (Place & { at: string }) | null = null
    for (const event of events) {
        const lat = event.payload?.lat
        const lng = event.payload?.lng
        if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue
        if (best === null || Date.parse(event.occurredAt) > Date.parse(best.at)) {
            best = { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100, at: event.occurredAt }
        }
    }
    return best
}

/** Used when the phone has sent no location: the parent picks the city. */
export const CITIES: { key: string; name: string; place: Place }[] = [
    { key: 'tunis', name: 'Tunis', place: { lat: 36.81, lng: 10.18 } },
    { key: 'sfax', name: 'Sfax', place: { lat: 34.74, lng: 10.76 } },
    { key: 'sousse', name: 'Sousse', place: { lat: 35.83, lng: 10.64 } },
    { key: 'kairouan', name: 'Kairouan', place: { lat: 35.68, lng: 10.1 } },
    { key: 'bizerte', name: 'Bizerte', place: { lat: 37.27, lng: 9.87 } },
    { key: 'gabes', name: 'Gabès', place: { lat: 33.88, lng: 10.1 } },
    { key: 'gafsa', name: 'Gafsa', place: { lat: 34.43, lng: 8.78 } },
    { key: 'tozeur', name: 'Tozeur', place: { lat: 33.92, lng: 8.13 } },
]

export function clock(minutes: number): string {
    const m = fix(Math.round(minutes), DAY_MINUTES)
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
