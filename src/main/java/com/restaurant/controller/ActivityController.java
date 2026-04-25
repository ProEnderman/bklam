package com.restaurant.controller;

import com.restaurant.model.Activity;
import com.restaurant.service.ActivityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "Activities", description = "Activity management")
@RestController
@RequestMapping("/api/activities")
@RequiredArgsConstructor
public class ActivityController {
    
    private final ActivityService activityService;
    
    @Operation(summary = "Get all activities")
    @GetMapping
    public ResponseEntity<List<Activity>> getActivities(
        @RequestParam(required = false) Long branchId,
        @RequestParam(required = false) Activity.ActivityStatus status
    ) {
        List<Activity> activities = activityService.getActivities(branchId, status);
        return ResponseEntity.ok(activities);
    }
    
    @Operation(summary = "Get activity by ID")
    @GetMapping("/{id}")
    public ResponseEntity<Activity> getActivity(@PathVariable Long id) {
        Activity activity = activityService.getActivityById(id);
        return ResponseEntity.ok(activity);
    }
    
    @Operation(summary = "Create activity")
    @PostMapping
    public ResponseEntity<Activity> createActivity(@Valid @RequestBody Activity activity) {
        Activity created = activityService.createActivity(activity);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update activity")
    @PutMapping("/{id}")
    public ResponseEntity<Activity> updateActivity(@PathVariable Long id, @Valid @RequestBody Activity activity) {
        Activity updated = activityService.updateActivity(id, activity);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Delete activity")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteActivity(@PathVariable Long id) {
        activityService.deleteActivity(id);
        return ResponseEntity.noContent().build();
    }
}




