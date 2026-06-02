package com.restaurant.dto;

import com.restaurant.model.Shift;
import com.restaurant.model.ShiftTemplate;
import com.restaurant.model.ShiftTemplateDaySchedule;
import com.restaurant.model.ShiftSwapRequest;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public class ShiftDtos {

    public record ShiftDto(
        Long id,
        Long employeeId,
        String employeeName,
        Long restaurantId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String shiftType,
        String comment,
        String status,
        Long templateId,
        Long swapRequestId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime publishedAt,
        LocalDateTime lockedAt
    ) {
        public static ShiftDto fromEntity(Shift shift) {
            String employeeName = null;
            Long employeeId = null;
            if (shift.getEmployee() != null) {
                employeeId = shift.getEmployee().getId();
                String firstName = shift.getEmployee().getFirstName();
                String lastName = shift.getEmployee().getLastName();
                if (firstName != null || lastName != null) {
                    employeeName = ((firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "")).trim();
                    if (employeeName.isEmpty()) {
                        employeeName = shift.getEmployee().getUsername();
                    }
                } else {
                    employeeName = shift.getEmployee().getUsername();
                }
            }
            
            return new ShiftDto(
                shift.getId(),
                employeeId,
                employeeName,
                shift.getRestaurant() != null ? shift.getRestaurant().getId() : null,
                shift.getStartTime(),
                shift.getEndTime(),
                shift.getShiftType() != null ? shift.getShiftType().name() : null,
                shift.getComment(),
                shift.getStatus() != null ? shift.getStatus().name() : null,
                shift.getTemplate() != null ? shift.getTemplate().getId() : null,
                shift.getSwapRequest() != null ? shift.getSwapRequest().getId() : null,
                shift.getCreatedAt(),
                shift.getUpdatedAt(),
                shift.getPublishedAt(),
                shift.getLockedAt()
            );
        }
    }

    public record CreateShiftRequest(
        Long employeeId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String shiftType,
        String comment
    ) {}

    public record UpdateShiftRequest(
        Long employeeId,
        LocalDateTime startTime,
        LocalDateTime endTime,
        String shiftType,
        String comment
    ) {}

    public record ShiftTemplateDayScheduleDto(
        Integer day,
        LocalTime startTime,
        LocalTime endTime
    ) {
        public static ShiftTemplateDayScheduleDto fromEntity(ShiftTemplateDaySchedule s) {
            return new ShiftTemplateDayScheduleDto(s.getDay(), s.getStartTime(), s.getEndTime());
        }
    }

    public record ShiftTemplateDto(
        Long id,
        String name,
        Long restaurantId,
        LocalTime startTime,
        LocalTime endTime,
        String dayOfWeek,
        List<Integer> daysOfWeek,
        List<ShiftTemplateDayScheduleDto> daySchedules,
        String shiftType,
        String recurrenceRule,
        String validFrom,
        String validTo,
        Boolean isActive,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
    ) {
        public static ShiftTemplateDto fromEntity(ShiftTemplate template) {
            List<Integer> dow = template.getDaysOfWeek() != null && !template.getDaysOfWeek().isEmpty()
                ? List.copyOf(template.getDaysOfWeek())
                : null;
            List<ShiftTemplateDayScheduleDto> schedules = null;
            if (template.getDaySchedules() != null && !template.getDaySchedules().isEmpty()) {
                schedules = template.getDaySchedules().stream()
                    .map(ShiftTemplateDayScheduleDto::fromEntity)
                    .toList();
            }
            return new ShiftTemplateDto(
                template.getId(),
                template.getName(),
                template.getRestaurant() != null ? template.getRestaurant().getId() : null,
                template.getStartTime(),
                template.getEndTime(),
                template.getDayOfWeek() != null ? template.getDayOfWeek().name() : null,
                dow,
                schedules,
                template.getShiftType() != null ? template.getShiftType().name() : null,
                template.getRecurrenceRule(),
                template.getValidFrom() != null ? template.getValidFrom().toString() : null,
                template.getValidTo() != null ? template.getValidTo().toString() : null,
                template.getIsActive(),
                template.getCreatedAt(),
                template.getUpdatedAt()
            );
        }
    }

    public record CreateShiftTemplateRequest(
        String name,
        LocalTime startTime,
        LocalTime endTime,
        Integer dayOfWeek,
        List<Integer> daysOfWeek,
        List<ShiftTemplateDayScheduleDto> daySchedules,
        String shiftType,
        String recurrenceRule
    ) {}

    public record ShiftSwapRequestDto(
        Long id,
        Long fromShiftId,
        Long toShiftId,
        Long requestedById,
        String requestedByName,
        Long requestedToId,
        String requestedToName,
        String status,
        String comment,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime respondedAt
    ) {
        public static ShiftSwapRequestDto fromEntity(ShiftSwapRequest request) {
            String requestedByName = null;
            if (request.getRequestedBy() != null) {
                String firstName = request.getRequestedBy().getFirstName();
                String lastName = request.getRequestedBy().getLastName();
                if (firstName != null || lastName != null) {
                    requestedByName = ((firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "")).trim();
                } else {
                    requestedByName = request.getRequestedBy().getUsername();
                }
            }
            
            String requestedToName = null;
            if (request.getRequestedTo() != null) {
                String firstName = request.getRequestedTo().getFirstName();
                String lastName = request.getRequestedTo().getLastName();
                if (firstName != null || lastName != null) {
                    requestedToName = ((firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "")).trim();
                } else {
                    requestedToName = request.getRequestedTo().getUsername();
                }
            }
            
            return new ShiftSwapRequestDto(
                request.getId(),
                request.getFromShift() != null ? request.getFromShift().getId() : null,
                request.getToShift() != null ? request.getToShift().getId() : null,
                request.getRequestedBy() != null ? request.getRequestedBy().getId() : null,
                requestedByName,
                request.getRequestedTo() != null ? request.getRequestedTo().getId() : null,
                requestedToName,
                request.getStatus() != null ? request.getStatus().name() : null,
                request.getComment(),
                request.getCreatedAt(),
                request.getUpdatedAt(),
                request.getRespondedAt()
            );
        }
    }

    public record BulkCreateShiftsRequest(
        List<CreateShiftRequest> shifts
    ) {}

    public record PublishWeekRequest(
        LocalDateTime weekStart
    ) {}
}
