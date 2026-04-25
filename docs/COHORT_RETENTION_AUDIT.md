# Cohort Retention System — Technical Audit Report

## 1. Implementation Locations

| File | Responsibility |
|------|----------------|
| `src/main/java/com/restaurant/service/BookingAnalyticsService.java` | `getCohortRetention(from, to, restaurantId)` — monthly and weekly cohort aggregation; retention = distinct users in week / cohort size; week boundary = Monday (ISO); future weeks = null |
| `frontend/src/pages/tariffs/analytics/PerformanceLayer.tsx` | `CohortRetentionSection` — table, heatmap, null vs 0 display, tooltips |
| `frontend/src/pages/tariffs/analytics/cohortFormat.ts` | `formatCohortCellValue` — null → "—", 0 → "0%", numeric → "X%" |

No SQL/ORM cohort queries: aggregation is in-memory in Java (streams over `Booking` list from repository).

---

## 2. Bugs Detected and Fixes

### 2.1 Empty cells / null vs 0 confusion

- **Issue:** Backend never returned `null`; every week had a numeric value. Frontend used `v > 0 ? ... : '0'`, so 0 was shown correctly but there was no way to show "future".
- **Fix:** Backend now returns `null` for weeks that have not yet occurred (week_index > current_week_index). Frontend treats `value === null` → "—", `value === 0` → "0%", else percentage. Implemented in `formatCohortCellValue` and cell rendering.

### 2.2 Incorrect relative week calculation (weekly)

- **Issue:** Weekly cohorts were built from bookings filtered to `[from, to]` only (`selPaid`), so "first visit" was first-in-selected-period, not first-ever in the full window. Inconsistent with monthly logic and could produce wrong cohort labels.
- **Fix:** Weekly cohorts now use the same `byClient` as monthly (all paid bookings from `cohortStart` to `to`). First date per client = first ever in that window; week offset = `ChronoUnit.WEEKS.between(cohort_week_start, activity_week_start)` with Monday as week start. Week offset clamped to 0..12.

### 2.3 Future weeks not visually separated / no cohort triangle

- **Issue:** All weeks up to `maxWeek` were computed and shown as 0% or a number; future weeks were not distinguished.
- **Fix:** Backend computes `refWeekStart = to.with(MONDAY)` and per cohort `currentWeekIndex = WEEKS.between(cohortWeekStart, refWeekStart)`. For `w > currentWeekIndex` the backend adds `null`. Monthly: same with `refYm` and `currentMonthIndex`. Frontend renders null as "—" with neutral background.

### 2.4 Heatmap inconsistent / W0 dominant

- **Issue:** Heatmap used `intensity = v / 100`, so W0 (often 100%) always had opacity 0.8 and dominated the scale.
- **Fix:** Global scale: `heatmapMax = max(all numeric values in table, 1)`. Cell opacity = `(value / heatmapMax) * 0.8` (capped at 0.8). Future cells (null) use neutral background, not purple. Same scale for all cells; W0 is not special.

### 2.5 Denominator and distinct users

- **Verified:** Cohort size = `entry.getValue().getOrDefault(0, emptySet()).size()` (W0/M0 distinct users). Retention = `active / size * 100` where `active` = distinct users in that week (Set per (cohort, week)). No duplication; formula correct.

### 2.6 Week boundary consistency

- **Verified:** Single definition: Monday via `LocalDate.with(DayOfWeek.MONDAY)`. Cohort week start and activity week start both use it; `week_index = ChronoUnit.WEEKS.between(cohort_week_start, activity_week_start)`. Comment added that `startAt` is `LocalDateTime` (no TZ in DB); week is in application default zone.

---

## 3. Timezone and Week Boundary

- **Storage:** `Booking.startAt` is `LocalDateTime` (no timezone in DB). Week truncation is in backend using `toLocalDate()` (JVM default zone).
- **Rule:** One source of truth: backend computes week start as Monday of `startAt.toLocalDate()`. Frontend does not recalculate weeks; it only displays backend values.
- **Change:** No DB or timezone migration; comment added for future explicit UTC normalization if needed.

---

## 4. JOIN and Duplication

- No SQL JOIN: data is loaded with `bookingRepository.findAll()` and filtered in memory. Cohort structure: `Map<cohortKey, Map<weekOffset, Set<clientKey>>>`, so each (cohort, week) counts distinct clients. No row multiplication; no extra DISTINCT needed.

---

## 5. Backward Compatibility

- **API shape:** Unchanged. `cohort` still has `matrix`, `cohortSizes`, `weeklyMatrix`, `weeklySizes`. List types remain the same; **elements may now be `null`** for future weeks.
- **Contract change:** Clients that treated "missing" or falsy as 0 will now see `null` for future weeks. They should use `value === null` for "future" and `value === 0` for "0% retention". Existing dashboards that only display the table get correct behavior; any custom logic that did `if (!value)` should be updated to distinguish null and 0.

---

## 6. Tests Added

### Backend (`src/test/java/com/restaurant/service/CohortRetentionTest.java`)

- `retention_uses_distinct_users_and_cohort_size_denominator` — one client in W0 and W1 → 100%, 100%.
- `future_weeks_are_null` — one cohort, `to` = end of W0 → W1, W2, ... are null.
- `zero_retention_is_zero_not_null` — one client only in W0 → W1 = 0.0.
- `week_index_uses_monday_boundary` — first visit Sunday → cohort key is Monday of that week.

### Frontend (`frontend/src/pages/tariffs/analytics/cohortFormat.test.ts`)

- `formatCohortCellValue`: null → "—", undefined → "—", 0 → "0%", 4.2 → "4.2%", 100 → "100%".

---

## 7. How to Run Tests

```bash
# Backend
./gradlew test --tests "com.restaurant.service.CohortRetentionTest"

# Frontend
cd frontend && npm install && npm run test
```

---

## 8. Summary of Code and Config Changes

- **BookingAnalyticsService.java:** Monthly: null for months after `refYm`; weekly: build from `byClient` (same as monthly), null for weeks after `currentWeekIndex`, fixed 13 columns (W0..W12), week offset 0..12; comment on week boundary.
- **PerformanceLayer.tsx:** Global heatmap max; null → "—" and neutral style; 0 → "0%"; tooltip "N / size (X%)"; use `formatCohortCellValue` from `cohortFormat.ts`.
- **cohortFormat.ts:** New helper `formatCohortCellValue(v)`.
- **cohortFormat.test.ts:** Vitest tests for formatter.
- **package.json (frontend):** Script `"test": "vitest run"`, devDependency `vitest`.

---

## 9. Correct Retention Formula (Reference)

```
retention(W_k) = COUNT(DISTINCT users active in week_k AND in cohort) / cohort_size
cohort_size    = COUNT(DISTINCT users in cohort_week_0)
week_index     = FLOOR((week_start(activity_date) - week_start(cohort_start_date)) / 7 days)
```

- Distinct: yes (Set per (cohort, week)).
- Numerator: users, not events.
- Denominator: cohort size, constant across weeks.
- Future weeks: not computed; backend returns `null`, frontend shows "—".
