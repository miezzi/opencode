import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import type { HomeSessionRecord } from "@/home/sessions/records"
import { groupSessionsByBucket, sessionBucket } from "./time"

const now = new Date(2026, 9, 23, 12, 0)

const at = (daysAgo: number) => new Date(2026, 9, 23 - daysAgo, 10, 0).getTime()

const record = (id: string, updated: number): HomeSessionRecord => {
  // SAFETY: the grouping only reads the session timestamp and id.
  const session = {
    id,
    title: id,
    location: { directory: "/repo" },
    time: { created: updated, updated },
  } as SessionInfo

  return { session, project: { id: "p", worktree: "/repo", expanded: true }, projectName: "repo" }
}

describe("sessionBucket", () => {
  test("uses calendar days for today and yesterday", () => {
    expect(sessionBucket(at(0), now)).toBe("today")
    expect(sessionBucket(at(1), now)).toBe("yesterday")
  })

  test("splits the rest into week, fortnight, month and older", () => {
    expect(sessionBucket(at(2), now)).toBe("week")
    expect(sessionBucket(at(7), now)).toBe("week")
    expect(sessionBucket(at(8), now)).toBe("fortnight")
    expect(sessionBucket(at(15), now)).toBe("fortnight")
    expect(sessionBucket(at(16), now)).toBe("month")
    expect(sessionBucket(at(30), now)).toBe("month")
    expect(sessionBucket(at(31), now)).toBe("older")
  })
})

describe("groupSessionsByBucket", () => {
  test("groups in bucket order and omits empty ones", () => {
    const groups = groupSessionsByBucket(
      [record("older", at(40)), record("today", at(0)), record("week", at(3)), record("today2", at(0))],
      now,
    )

    expect(groups.map((group) => group.bucket)).toEqual(["today", "week", "older"])
    expect(groups[0]?.sessions.map((item) => item.session.id)).toEqual(["today", "today2"])
  })

  test("keeps the incoming order inside a bucket", () => {
    const groups = groupSessionsByBucket([record("a", at(0)), record("b", at(0))], now)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.sessions.map((item) => item.session.id)).toEqual(["a", "b"])
  })
})
