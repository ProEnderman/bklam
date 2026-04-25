package com.restaurant.service;

import com.restaurant.dto.ShiftDtos.*;
import com.restaurant.model.Shift;
import com.restaurant.model.ShiftTemplate;
import com.restaurant.model.ShiftSwapRequest;
import com.restaurant.model.User;
import com.restaurant.repository.*;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShiftService {
    
    private final ShiftRepository shiftRepository;
    private final ShiftTemplateRepository shiftTemplateRepository;
    private final ShiftSwapRequestRepository shiftSwapRequestRepository;
    private final RestaurantRepository restaurantRepository;
    private final UserRepository userRepository;
    private final ActivityLogService activityLogService;
    
    @Transactional(readOnly = true)
    public List<ShiftDto> getShifts(Long employeeId, Long restaurantId, LocalDateTime from, LocalDateTime to) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        
        List<Shift> shifts;
        if (employeeId != null && currentRestaurantId != null) {
            shifts = shiftRepository.findByEmployeeIdAndRestaurantId(employeeId, currentRestaurantId);
        } else if (employeeId != null) {
            shifts = shiftRepository.findByEmployeeId(employeeId);
        } else if (currentRestaurantId != null) {
            shifts = shiftRepository.findByRestaurantId(currentRestaurantId);
        } else {
            shifts = shiftRepository.findAll();
        }
        
        // Filter by date range if provided
        if (from != null || to != null) {
            shifts = shifts.stream()
                .filter(s -> {
                    if (from != null && s.getEndTime().isBefore(from)) return false;
                    if (to != null && s.getStartTime().isAfter(to)) return false;
                    return true;
                })
                .collect(Collectors.toList());
        }
        
        return shifts.stream()
            .map(ShiftDto::fromEntity)
            .collect(Collectors.toList());
    }
    
    @Transactional(readOnly = true)
    public ShiftDto getShiftById(Long id) {
        Shift shift = shiftRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Shift not found"));
        return ShiftDto.fromEntity(shift);
    }
    
    @Transactional
    public ShiftDto createShift(CreateShiftRequest request) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        
        Shift shift = new Shift();
        
        if (request.employeeId() != null) {
            User employee = userRepository.findById(request.employeeId())
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Employee not found"));
            shift.setEmployee(employee);
        }
        
        if (restaurantId != null) {
            shift.setRestaurant(restaurantRepository.findById(restaurantId).orElse(null));
        }
        
        shift.setStartTime(request.startTime());
        shift.setEndTime(request.endTime());
        
        if (request.shiftType() != null) {
            shift.setShiftType(Shift.ShiftType.valueOf(request.shiftType()));
        }
        
        shift.setComment(request.comment());
        shift.setStatus(Shift.ShiftStatus.DRAFT);
        
        // Check for conflicts
        if (request.employeeId() != null) {
            List<Shift> conflicts = shiftRepository.findConflictingShiftsForEmployee(
                request.employeeId(), request.startTime(), request.endTime()
            );
            if (!conflicts.isEmpty()) {
                throw new com.restaurant.exception.BusinessException(
                    "Employee already has a shift during this time period"
                );
            }
        }
        
        Shift saved = shiftRepository.save(shift);
        
        try {
            activityLogService.logActivity(
                "CREATE", "SHIFT", saved.getId(), null,
                String.format("Создана смена: %s — %s, тип=%s",
                    saved.getStartTime(), saved.getEndTime(),
                    saved.getShiftType() != null ? saved.getShiftType().toString() : "REGULAR"),
                null,
                Map.of("startTime", saved.getStartTime().toString(),
                       "endTime", saved.getEndTime().toString(),
                       "shiftType", saved.getShiftType() != null ? saved.getShiftType().toString() : "REGULAR",
                       "employeeId", saved.getEmployee() != null ? saved.getEmployee().getId() : 0)
            );
        } catch (Exception e) {
            log.error("Failed to log shift create: {}", e.getMessage());
        }
        
        return ShiftDto.fromEntity(saved);
    }
    
    @Transactional
    public List<ShiftDto> createShiftsBulk(List<CreateShiftRequest> requests) {
        List<ShiftDto> created = new ArrayList<>();
        for (CreateShiftRequest request : requests) {
            created.add(createShift(request));
        }
        return created;
    }
    
    @Transactional
    public ShiftDto updateShift(Long id, UpdateShiftRequest request) {
        Shift existing = shiftRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Shift not found"));
        
        if (request.employeeId() != null) {
            User employee = userRepository.findById(request.employeeId())
                .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Employee not found"));
            existing.setEmployee(employee);
        }
        
        if (request.startTime() != null) {
            existing.setStartTime(request.startTime());
        }
        if (request.endTime() != null) {
            existing.setEndTime(request.endTime());
        }
        if (request.shiftType() != null) {
            existing.setShiftType(Shift.ShiftType.valueOf(request.shiftType()));
        }
        if (request.comment() != null) {
            existing.setComment(request.comment());
        }
        
        Shift saved = shiftRepository.save(existing);
        
        try {
            activityLogService.logActivity(
                "UPDATE", "SHIFT", saved.getId(), null,
                String.format("Обновлена смена #%d: %s — %s", saved.getId(), saved.getStartTime(), saved.getEndTime()),
                null,
                Map.of("startTime", saved.getStartTime().toString(),
                       "endTime", saved.getEndTime().toString())
            );
        } catch (Exception e) {
            log.error("Failed to log shift update: {}", e.getMessage());
        }
        
        return ShiftDto.fromEntity(saved);
    }
    
    @Transactional
    public void deleteShift(Long id) {
        try {
            activityLogService.logActivity(
                "DELETE", "SHIFT", id, null,
                String.format("Удалена смена #%d", id),
                null, null
            );
        } catch (Exception e) {
            log.error("Failed to log shift delete: {}", e.getMessage());
        }
        shiftRepository.deleteById(id);
    }
    
    @Transactional
    public ShiftDto publishShift(Long id) {
        Shift shift = shiftRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Shift not found"));
        if (shift.getStatus() != Shift.ShiftStatus.DRAFT) {
            throw new com.restaurant.exception.BusinessException("Only draft shifts can be published");
        }
        shift.setStatus(Shift.ShiftStatus.PUBLISHED);
        shift.setPublishedAt(com.restaurant.util.TimeUtils.now());
        Shift saved = shiftRepository.save(shift);
        
        try {
            activityLogService.logActivity(
                "PUBLISH", "SHIFT", saved.getId(), null,
                String.format("Опубликована смена #%d", saved.getId()),
                Map.of("status", "DRAFT"),
                Map.of("status", "PUBLISHED")
            );
        } catch (Exception e) {
            log.error("Failed to log shift publish: {}", e.getMessage());
        }
        
        return ShiftDto.fromEntity(saved);
    }
    
    @Transactional
    public void publishWeek(LocalDateTime weekStart) {
        LocalDateTime weekEnd = weekStart.plusDays(7);
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        
        List<Shift> shifts = shiftRepository.findByRestaurantId(restaurantId);
        shifts.stream()
            .filter(s -> s.getStatus() == Shift.ShiftStatus.DRAFT)
            .filter(s -> !s.getStartTime().isBefore(weekStart) && s.getStartTime().isBefore(weekEnd))
            .forEach(s -> {
                s.setStatus(Shift.ShiftStatus.PUBLISHED);
                s.setPublishedAt(com.restaurant.util.TimeUtils.now());
                shiftRepository.save(s);
            });
    }
    
    @Transactional
    public ShiftDto lockShift(Long id) {
        Shift shift = shiftRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Shift not found"));
        shift.setStatus(Shift.ShiftStatus.LOCKED);
        shift.setLockedAt(com.restaurant.util.TimeUtils.now());
        Shift saved = shiftRepository.save(shift);
        
        try {
            activityLogService.logActivity(
                "LOCK", "SHIFT", saved.getId(), null,
                String.format("Заблокирована смена #%d", saved.getId()),
                Map.of("status", "PUBLISHED"),
                Map.of("status", "LOCKED")
            );
        } catch (Exception e) {
            log.error("Failed to log shift lock: {}", e.getMessage());
        }
        
        return ShiftDto.fromEntity(saved);
    }
    
    @Transactional(readOnly = true)
    public List<ShiftDto> findConflicts(Long restaurantId, LocalDateTime startTime, LocalDateTime endTime) {
        return shiftRepository.findConflictingShifts(restaurantId, startTime, endTime)
            .stream()
            .map(ShiftDto::fromEntity)
            .collect(Collectors.toList());
    }
    
    @Transactional(readOnly = true)
    public List<ShiftTemplateDto> getShiftTemplates(Long restaurantId) {
        Long currentRestaurantId = restaurantId != null ? restaurantId : SecurityUtils.getCurrentRestaurantId();
        List<ShiftTemplate> templates;
        if (currentRestaurantId != null) {
            templates = shiftTemplateRepository.findByRestaurantIdAndIsActiveTrue(currentRestaurantId);
        } else {
            templates = shiftTemplateRepository.findAll();
        }
        return templates.stream()
            .map(ShiftTemplateDto::fromEntity)
            .collect(Collectors.toList());
    }
    
    @Transactional
    public ShiftTemplateDto createShiftTemplate(CreateShiftTemplateRequest request) {
        Long restaurantId = SecurityUtils.getCurrentRestaurantId();
        
        ShiftTemplate template = new ShiftTemplate();
        template.setName(request.name());
        template.setStartTime(request.startTime());
        template.setEndTime(request.endTime());
        
        if (request.daysOfWeek() != null && !request.daysOfWeek().isEmpty()) {
            java.util.List<Integer> normalized = request.daysOfWeek().stream()
                .filter(d -> d != null && d >= 1 && d <= 7)
                .distinct()
                .sorted()
                .collect(java.util.stream.Collectors.toList());
            template.setDaysOfWeek(new java.util.ArrayList<>(normalized));
            template.setDayOfWeek(null);
        } else if (request.dayOfWeek() != null) {
            template.setDayOfWeek(DayOfWeek.of(request.dayOfWeek()));
            template.setDaysOfWeek(new java.util.ArrayList<>());
        } else {
            template.setDayOfWeek(null);
            template.setDaysOfWeek(new java.util.ArrayList<>());
        }
        
        if (request.shiftType() != null) {
            template.setShiftType(Shift.ShiftType.valueOf(request.shiftType()));
        }
        
        template.setRecurrenceRule(request.recurrenceRule());
        template.setIsActive(true);
        
        if (restaurantId != null) {
            template.setRestaurant(restaurantRepository.findById(restaurantId).orElse(null));
        }
        
        ShiftTemplate saved = shiftTemplateRepository.save(template);
        
        try {
            activityLogService.logActivity(
                "CREATE", "SHIFT_TEMPLATE", saved.getId(), null,
                String.format("Создан шаблон смены: %s", saved.getName()),
                null,
                Map.of("name", saved.getName(),
                       "startTime", saved.getStartTime().toString(),
                       "endTime", saved.getEndTime().toString())
            );
        } catch (Exception e) {
            log.error("Failed to log shift template create: {}", e.getMessage());
        }
        
        return ShiftTemplateDto.fromEntity(saved);
    }
    
    @Transactional
    public void deleteShiftTemplate(Long id) {
        try {
            activityLogService.logActivity(
                "DELETE", "SHIFT_TEMPLATE", id, null,
                String.format("Удалён шаблон смены #%d", id),
                null, null
            );
        } catch (Exception e) {
            log.error("Failed to log shift template delete: {}", e.getMessage());
        }
        shiftTemplateRepository.deleteById(id);
    }

    /** Много дней (ISO 1–7) или один dayOfWeek, или любой день если оба пусты. */
    private static boolean templateMatchesDate(ShiftTemplate template, LocalDate current) {
        List<Integer> multi = template.getDaysOfWeek();
        if (multi != null && !multi.isEmpty()) {
            int v = current.getDayOfWeek().getValue();
            return multi.contains(v);
        }
        return template.getDayOfWeek() == null || template.getDayOfWeek() == current.getDayOfWeek();
    }
    
    @Transactional
    public List<ShiftDto> generateShiftsFromTemplate(Long templateId, LocalDate startDate, LocalDate endDate, List<Long> employeeIds) {
        ShiftTemplate template = shiftTemplateRepository.findById(templateId)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Template not found"));
        
        List<ShiftDto> created = new ArrayList<>();
        LocalDate current = startDate;
        
        while (!current.isAfter(endDate)) {
            boolean matches = templateMatchesDate(template, current);
            
            if (matches) {
                for (Long employeeId : employeeIds) {
                    LocalDateTime shiftStart = LocalDateTime.of(current, template.getStartTime());
                    LocalDateTime shiftEnd = LocalDateTime.of(current, template.getEndTime());
                    
                    // Handle overnight shifts
                    if (template.getEndTime().isBefore(template.getStartTime())) {
                        shiftEnd = shiftEnd.plusDays(1);
                    }
                    
                    CreateShiftRequest request = new CreateShiftRequest(
                        employeeId,
                        shiftStart,
                        shiftEnd,
                        template.getShiftType() != null ? template.getShiftType().name() : "REGULAR",
                        "Generated from template: " + template.getName()
                    );
                    
                    try {
                        created.add(createShift(request));
                    } catch (Exception e) {
                        log.warn("Failed to create shift from template for employee {} on {}: {}", 
                            employeeId, current, e.getMessage());
                    }
                }
            }
            current = current.plusDays(1);
        }
        
        return created;
    }
    
    @Transactional
    public ShiftSwapRequestDto createSwapRequest(ShiftSwapRequest request) {
        request.setStatus(ShiftSwapRequest.SwapStatus.PENDING);
        request.setRequestedBy(userRepository.findById(request.getRequestedBy().getId()).orElse(null));
        ShiftSwapRequest saved = shiftSwapRequestRepository.save(request);
        
        try {
            activityLogService.logActivity(
                "CREATE", "SHIFT_SWAP_REQUEST", saved.getId(), null,
                String.format("Создан запрос на обмен сменами #%d", saved.getId()),
                null,
                Map.of("status", "PENDING")
            );
        } catch (Exception e) {
            log.error("Failed to log swap request create: {}", e.getMessage());
        }
        
        return ShiftSwapRequestDto.fromEntity(saved);
    }
    
    @Transactional
    public ShiftSwapRequestDto acceptSwapRequest(Long id) {
        ShiftSwapRequest request = shiftSwapRequestRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Swap request not found"));
        
        if (request.getStatus() != ShiftSwapRequest.SwapStatus.PENDING) {
            throw new com.restaurant.exception.BusinessException("Only pending requests can be accepted");
        }
        
        request.setStatus(ShiftSwapRequest.SwapStatus.ACCEPTED);
        request.setRespondedAt(com.restaurant.util.TimeUtils.now());
        
        // Swap the shifts
        Shift fromShift = request.getFromShift();
        Shift toShift = request.getToShift();
        
        if (toShift != null) {
            Long tempEmployeeId = fromShift.getEmployee().getId();
            fromShift.setEmployee(toShift.getEmployee());
            toShift.setEmployee(userRepository.findById(tempEmployeeId).orElse(null));
            shiftRepository.save(fromShift);
            shiftRepository.save(toShift);
        }
        
        ShiftSwapRequest saved = shiftSwapRequestRepository.save(request);
        
        try {
            activityLogService.logActivity(
                "ACCEPT_SWAP", "SHIFT_SWAP_REQUEST", saved.getId(), null,
                String.format("Принят запрос на обмен сменами #%d", saved.getId()),
                Map.of("status", "PENDING"),
                Map.of("status", "ACCEPTED")
            );
        } catch (Exception e) {
            log.error("Failed to log swap request accept: {}", e.getMessage());
        }
        
        return ShiftSwapRequestDto.fromEntity(saved);
    }
    
    @Transactional
    public ShiftSwapRequestDto rejectSwapRequest(Long id) {
        ShiftSwapRequest request = shiftSwapRequestRepository.findById(id)
            .orElseThrow(() -> new com.restaurant.exception.ResourceNotFoundException("Swap request not found"));
        
        request.setStatus(ShiftSwapRequest.SwapStatus.REJECTED);
        request.setRespondedAt(com.restaurant.util.TimeUtils.now());
        ShiftSwapRequest saved = shiftSwapRequestRepository.save(request);
        
        try {
            activityLogService.logActivity(
                "REJECT_SWAP", "SHIFT_SWAP_REQUEST", saved.getId(), null,
                String.format("Отклонён запрос на обмен сменами #%d", saved.getId()),
                Map.of("status", "PENDING"),
                Map.of("status", "REJECTED")
            );
        } catch (Exception e) {
            log.error("Failed to log swap request reject: {}", e.getMessage());
        }
        
        return ShiftSwapRequestDto.fromEntity(saved);
    }
}
