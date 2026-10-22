import type { HomeSessionRecord } from "@/home/sessions/records"

export type SessionBucket = "today" | "yesterday" | "week" | "fortnight" | "month" | "older"

const DAY = 24 * 60 * 60 * 1000

const dayKey = (date: Date) => date.getFullYear() * 10_000 + date.getMonth() * 100 + date.getDate()

const startOfDay = (date: Date, daysAgo: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysAgo)

/** Calendar bucket of a session, in the local time zone. */
export function sessionBucket(updated: number, now = new Date()): SessionBucket {
  const day = dayKey(new Date(updated))

  if (day === dayKey(now)) return "today"

  if (day === dayKey(startOfDay(now, 1))) return "yesterday"

  if (day >= dayKey(startOfDay(now, 7))) return "week"

  if (day >= dayKey(startOfDay(now, 15))) return "fortnight"

  if (day >= dayKey(startOfDay(now, 30))) return "month"

  return "older"
}

export const SESSION_BUCKETS: readonly SessionBucket[] = ["today", "yesterday", "week", "fortnight", "month", "older"]

/** Sessions grouped by age, newest bucket first. Empty buckets are omitted. */
export function groupSessionsByBucket(sessions: readonly HomeSessionRecord[], now = new Date()) {
  const groups = new Map<SessionBucket, HomeSessionRecord[]>()

  for (const record of sessions) {
    const bucket = sessionBucket(record.session.time.updated ?? record.session.time.created, now)
    const list = groups.get(bucket)

    if (list) list.push(record)
    else groups.set(bucket, [record])
  }

  return SESSION_BUCKETS.flatMap((bucket) => {
    const list = groups.get(bucket)

    return list && list.length > 0 ? [{ bucket, sessions: list }] : []
  })
}

/** Whether a session was touched inside the window the sidebar reports on. */
export function recentlyActive(record: HomeSessionRecord, now = Date.now(), window = 7 * DAY) {
  return (record.session.time.updated ?? record.session.time.created) > now - window
}
