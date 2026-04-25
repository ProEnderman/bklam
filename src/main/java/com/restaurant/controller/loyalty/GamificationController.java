package com.restaurant.controller.loyalty;

import com.restaurant.dto.loyalty.*;
import com.restaurant.service.loyalty.GamificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Loyalty - Gamification", description = "Missions, achievements, badges")
@RestController
@RequestMapping("/api/loyalty/gamification")
@RequiredArgsConstructor
public class GamificationController {

    private final GamificationService gamificationService;

    // ── Missions ──────────────────────────────────────────────────────

    @Operation(summary = "Get all missions")
    @GetMapping("/missions")
    public ResponseEntity<List<MissionDto>> getMissions() {
        return ResponseEntity.ok(gamificationService.getMissions());
    }

    @Operation(summary = "Create a new mission")
    @PostMapping("/missions")
    public ResponseEntity<MissionDto> createMission(@Valid @RequestBody CreateMissionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(gamificationService.createMission(request));
    }

    @Operation(summary = "Delete a mission")
    @DeleteMapping("/missions/{id}")
    public ResponseEntity<Void> deleteMission(@PathVariable Long id) {
        gamificationService.deleteMission(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get mission progress for a guest")
    @GetMapping("/missions/guest/{guestId}")
    public ResponseEntity<List<MissionProgressDto>> getGuestMissions(@PathVariable Long guestId) {
        return ResponseEntity.ok(gamificationService.getGuestMissions(guestId));
    }

    // ── Achievements ──────────────────────────────────────────────────

    @Operation(summary = "Get all achievements")
    @GetMapping("/achievements")
    public ResponseEntity<List<AchievementDto>> getAchievements() {
        return ResponseEntity.ok(gamificationService.getAchievements());
    }

    @Operation(summary = "Create an achievement")
    @PostMapping("/achievements")
    public ResponseEntity<AchievementDto> createAchievement(@RequestBody AchievementDto request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(gamificationService.createAchievement(request));
    }

    @Operation(summary = "Award achievement to a guest")
    @PostMapping("/achievements/{achievementId}/award/{guestId}")
    public ResponseEntity<Void> awardAchievement(@PathVariable Long achievementId, @PathVariable Long guestId) {
        gamificationService.awardAchievement(guestId, achievementId);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "Get achievements earned by a guest")
    @GetMapping("/achievements/guest/{guestId}")
    public ResponseEntity<List<AchievementDto>> getGuestAchievements(@PathVariable Long guestId) {
        return ResponseEntity.ok(gamificationService.getGuestAchievements(guestId));
    }
}
