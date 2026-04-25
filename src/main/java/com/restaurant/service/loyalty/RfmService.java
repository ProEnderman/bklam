package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.RfmSnapshotDto;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.Guest;
import com.restaurant.model.loyalty.RfmSnapshot;
import com.restaurant.repository.loyalty.GuestRepository;
import com.restaurant.repository.loyalty.RfmSnapshotRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class RfmService {

    private final RfmSnapshotRepository rfmSnapshotRepository;
    private final GuestRepository guestRepository;

    private Long getRestaurantId() {
        return SecurityUtils.getCurrentRestaurantId();
    }

    @Transactional(readOnly = true)
    public RfmSnapshotDto getLatestForGuest(Long guestId) {
        return rfmSnapshotRepository.findLatestByGuestId(guestId)
            .map(RfmSnapshotDto::fromEntity).orElse(null);
    }

    @Transactional(readOnly = true)
    public List<RfmSnapshotDto> getHistoryForGuest(Long guestId) {
        return rfmSnapshotRepository.findByGuestIdOrderBySnapshotDateDesc(guestId)
            .stream().map(RfmSnapshotDto::fromEntity).toList();
    }

    /**
     * Run RFM analysis for all guests in the current restaurant.
     * Creates snapshot records for today.
     */
    @Transactional
    public List<RfmSnapshotDto> runAnalysis(Map<Long, RfmInputData> guestDataMap) {
        Long rid = getRestaurantId();
        LocalDate today = LocalDate.now();
        List<Guest> guests = guestRepository.findAllByRestaurantId(rid);

        if (guests.isEmpty()) return List.of();

        // Collect raw values for percentile scoring
        List<Integer> allRecency = new ArrayList<>();
        List<Integer> allFrequency = new ArrayList<>();
        List<BigDecimal> allMonetary = new ArrayList<>();

        Map<Long, int[]> rawValues = new HashMap<>();

        for (Guest g : guests) {
            RfmInputData data = guestDataMap != null ? guestDataMap.get(g.getId()) : null;
            int recency = data != null ? data.recencyDays() : 9999;
            int frequency = data != null ? data.frequencyCount() : 0;
            BigDecimal monetary = data != null ? data.monetarySum() : BigDecimal.ZERO;

            allRecency.add(recency);
            allFrequency.add(frequency);
            allMonetary.add(monetary);
            rawValues.put(g.getId(), new int[]{recency, frequency, monetary.intValue()});
        }

        // Sort for quintile calculation
        Collections.sort(allRecency);
        Collections.sort(allFrequency);
        allMonetary.sort(Comparator.naturalOrder());

        List<RfmSnapshotDto> results = new ArrayList<>();

        for (Guest g : guests) {
            int[] raw = rawValues.get(g.getId());
            int recency = raw[0];
            int frequency = raw[1];
            BigDecimal monetary = guestDataMap != null && guestDataMap.containsKey(g.getId())
                ? guestDataMap.get(g.getId()).monetarySum() : BigDecimal.ZERO;

            // R score: lower recency = higher score (inverted)
            int rScore = 6 - scoreQuintile(recency, allRecency);
            rScore = Math.max(1, Math.min(5, rScore));

            int fScore = scoreQuintile(frequency, allFrequency.stream().mapToInt(Integer::intValue).boxed().toList());
            int mScore = scoreQuintileBD(monetary, allMonetary);

            String segment = classifyRfmSegment(rScore, fScore, mScore);

            RfmSnapshot snap = new RfmSnapshot();
            snap.setGuest(g);
            snap.setSnapshotDate(today);
            snap.setRecencyDays(recency);
            snap.setFrequencyCount(frequency);
            snap.setMonetarySum(monetary);
            snap.setRScore(rScore);
            snap.setFScore(fScore);
            snap.setMScore(mScore);
            snap.setRfmSegment(segment);
            rfmSnapshotRepository.save(snap);

            results.add(RfmSnapshotDto.fromEntity(snap));
        }

        log.info("RFM analysis completed for {} guests", results.size());
        return results;
    }

    @Transactional(readOnly = true)
    public Map<String, Long> getSegmentDistribution() {
        Long rid = getRestaurantId();
        LocalDate today = LocalDate.now();
        List<Object[]> rows = rfmSnapshotRepository.countBySegment(rid, today);
        Map<String, Long> dist = new LinkedHashMap<>();
        for (Object[] row : rows) {
            String seg = (String) row[0];
            Long cnt = (Long) row[1];
            dist.put(seg != null ? seg : "UNKNOWN", cnt);
        }
        return dist;
    }

    // ── RFM scoring helpers ───────────────────────────────────────────

    private int scoreQuintile(int value, List<Integer> sorted) {
        if (sorted.isEmpty()) return 3;
        int idx = Collections.binarySearch(sorted, value);
        if (idx < 0) idx = -idx - 1;
        double percentile = (double) idx / sorted.size();
        if (percentile < 0.2) return 1;
        if (percentile < 0.4) return 2;
        if (percentile < 0.6) return 3;
        if (percentile < 0.8) return 4;
        return 5;
    }

    private int scoreQuintileBD(BigDecimal value, List<BigDecimal> sorted) {
        if (sorted.isEmpty()) return 3;
        int idx = Collections.binarySearch(sorted, value);
        if (idx < 0) idx = -idx - 1;
        double percentile = (double) idx / sorted.size();
        if (percentile < 0.2) return 1;
        if (percentile < 0.4) return 2;
        if (percentile < 0.6) return 3;
        if (percentile < 0.8) return 4;
        return 5;
    }

    private String classifyRfmSegment(int r, int f, int m) {
        int avg = (r + f + m) / 3;
        if (r >= 4 && f >= 4 && m >= 4) return "CHAMPIONS";
        if (r >= 4 && f >= 3) return "LOYAL";
        if (r >= 3 && f >= 1 && m >= 3) return "POTENTIAL_LOYALIST";
        if (r >= 4 && f <= 2) return "NEW_CUSTOMERS";
        if (r >= 3 && f >= 3 && m <= 2) return "PROMISING";
        if (r <= 2 && f >= 3) return "AT_RISK";
        if (r <= 2 && f >= 4 && m >= 4) return "CANT_LOSE";
        if (r <= 2 && f <= 2) return "HIBERNATING";
        if (r <= 1 && f <= 1) return "LOST";
        return "ABOUT_TO_SLEEP";
    }

    // ── Input data record ─────────────────────────────────────────────

    public record RfmInputData(int recencyDays, int frequencyCount, BigDecimal monetarySum) {}
}
