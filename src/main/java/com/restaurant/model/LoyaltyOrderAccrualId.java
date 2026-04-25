package com.restaurant.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class LoyaltyOrderAccrualId implements Serializable {
    private Long restaurantId;
    private Long orderId;
}
