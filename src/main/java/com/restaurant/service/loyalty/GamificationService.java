package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.*;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.*;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.loyalty.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class GamificationService {

    private final MissionRepository missionRepository;
    private final MissionProgressRepository progressRepository;
    private final AchievementRepository achievementRepository;
    private final GuestAchievementRepository guestAchievementRepository;
    private final GuestRepository guestRepository;
    private final RestaurantRepository restaurantRepository;
    private final BonusAccountService bonusAccountService;

    private Long getRestaurantId() {
        return SecurityUtils.getCurrentRestaurantId();
    }

    // ── Missions CRUD ─────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MissionDto> getMissions() {
        return missionRepository.findByRestaurantId(getRestaurantId())
            .stream().map(MissionDto::fromEntity).toList();
    }

    @Transactional
    public MissionDto createMission(CreateMissionRequest req) {
        Long rid = getRestaurantId();
        Mission m = new Mission();
        m.setRestaurant(restaurantRepository.findById(rid)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        m.setName(req.name());
        m.setDescription(req.description());
        m.setMissionType(req.missionType());
        m.setGoal(req.goal() != null ? req.goal() : "{}");
        m.setReward(req.reward() != null ? req.reward() : "{}");
        m.setValidFrom(req.validFrom());
        m.setValidTo(req.validTo());
        Mission saved = missionRepository.save(m);
        log.info("Created mission id={}, type={}", saved.getId(), saved.getMissionType());
        return MissionDto.fromEntity(saved);
    }

    @Transactional
    public void deleteMission(Long id) {
        missionRepository.deleteById(id);
    }

    // ── Mission progress ──────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MissionProgressDto> getGuestMissions(Long guestId) {
        return progressRepository.findByGuestId(guestId)
            .stream().map(MissionProgressDto::fromEntity).toList();
    }

    /**
     * Update mission progress for a guest after an event.
     */
    @Transactional
    public void updateMissionProgress(Long guestId, MissionType eventType, BigDecimal eventValue) {
        Long rid = guestRepository.findById(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Guest not found"))
            .getRestaurantId();

        List<Mission> activeMissions = missionRepository.findActiveMissions(rid, LocalDateTime.now());

        for (Mission mission : activeMissions) {
            if (mission.getMissionType() != eventType) continue;

            MissionProgress progress = progressRepository.findByGuestIdAndMissionId(guestId, mission.getId())
                .orElseGet(() -> {
                    MissionProgress p = new MissionProgress();
                    p.setGuest(guestRepository.findById(guestId).orElseThrow());
                    p.setMission(mission);
                    p.setGoalValue(extractGoalValue(mission.getGoal()));
                    p.setStatus(MissionProgressStatus.IN_PROGRESS);
                    return progressRepository.save(p);
                });

            if (progress.getStatus() != MissionProgressStatus.IN_PROGRESS) continue;

            progress.setCurrentValue(progress.getCurrentValue().add(eventValue));

            // Check completion
            if (progress.getCurrentValue().compareTo(progress.getGoalValue()) >= 0) {
                progress.setStatus(MissionProgressStatus.COMPLETED);
                progress.setCompletedAt(LocalDateTime.now());
                log.info("Mission {} completed for guest {}", mission.getName(), guestId);

                // Auto-award reward (bonus points)
                BigDecimal rewardPoints = extractRewardPoints(mission.getReward());
                if (rewardPoints.compareTo(BigDecimal.ZERO) > 0) {
                    bonusAccountService.earnPoints(new BonusTransactionRequest(
                        guestId, rewardPoints, "MISSION", mission.getId().toString(),
                        "Mission completed: " + mission.getName(),
                        "mission-reward-" + mission.getId() + "-" + guestId
                    ));
                    progress.setStatus(MissionProgressStatus.CLAIMED);
                }
            }
            progressRepository.save(progress);
        }
    }

    // ── Achievements CRUD ─────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AchievementDto> getAchievements() {
        return achievementRepository.findByRestaurantId(getRestaurantId())
            .stream().map(AchievementDto::fromEntity).toList();
    }

    @Transactional
    public AchievementDto createAchievement(AchievementDto req) {
        Long rid = getRestaurantId();
        Achievement a = new Achievement();
        a.setRestaurant(restaurantRepository.findById(rid)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        a.setName(req.name());
        a.setDescription(req.description());
        a.setIconUrl(req.iconUrl());
        a.setCriteria(req.criteria() != null ? req.criteria() : "{}");
        a.setReward(req.reward() != null ? req.reward() : "{}");
        Achievement saved = achievementRepository.save(a);
        log.info("Created achievement id={}, name={}", saved.getId(), saved.getName());
        return AchievementDto.fromEntity(saved);
    }

    @Transactional
    public void awardAchievement(Long guestId, Long achievementId) {
        if (guestAchievementRepository.existsByGuestIdAndAchievementId(guestId, achievementId)) {
            log.info("Guest {} already has achievement {}", guestId, achievementId);
            return;
        }
        GuestAchievement ga = new GuestAchievement();
        ga.setGuest(guestRepository.findById(guestId)
            .orElseThrow(() -> new ResourceNotFoundException("Guest not found")));
        ga.setAchievement(achievementRepository.findById(achievementId)
            .orElseThrow(() -> new ResourceNotFoundException("Achievement not found")));
        guestAchievementRepository.save(ga);
        log.info("Awarded achievement {} to guest {}", achievementId, guestId);
    }

    @Transactional(readOnly = true)
    public List<AchievementDto> getGuestAchievements(Long guestId) {
        return guestAchievementRepository.findByGuestId(guestId)
            .stream().map(ga -> AchievementDto.fromEntity(ga.getAchievement())).toList();
    }

    // ── Helpers ───────────────────────────────────────────────────────

    private BigDecimal extractGoalValue(String goalJson) {
        return extractJsonBigDecimal(goalJson, "target", BigDecimal.TEN);
    }

    private BigDecimal extractRewardPoints(String rewardJson) {
        return extractJsonBigDecimal(rewardJson, "points", BigDecimal.ZERO);
    }

    private BigDecimal extractJsonBigDecimal(String json, String field, BigDecimal defaultVal) {
        if (json == null) return defaultVal;
        try {
            String pattern = "\"" + field + "\"\\s*:\\s*([\\d.]+)";
            var matcher = java.util.regex.Pattern.compile(pattern).matcher(json);
            if (matcher.find()) {
                return new BigDecimal(matcher.group(1));
            }
        } catch (Exception e) {
            // ignore
        }
        return defaultVal;
    }
}
