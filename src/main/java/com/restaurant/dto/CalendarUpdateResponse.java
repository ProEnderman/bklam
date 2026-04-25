package com.restaurant.dto;

import com.restaurant.model.Calendar;
import com.restaurant.model.TariffPlan;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CalendarUpdateResponse {
    private Calendar calendar;
    private List<TariffPlan> affectedTariffPlans;
    private List<String> addedDates;
    private List<String> removedDates;
}


