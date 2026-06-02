package com.restaurant.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ShiftTemplateDaySchedule {
    /** ISO: 1 = понедельник … 7 = воскресенье */
    private Integer day;
    private LocalTime startTime;
    private LocalTime endTime;
}
