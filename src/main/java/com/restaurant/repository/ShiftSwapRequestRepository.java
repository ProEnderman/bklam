package com.restaurant.repository;

import com.restaurant.model.ShiftSwapRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShiftSwapRequestRepository extends JpaRepository<ShiftSwapRequest, Long> {
    
    List<ShiftSwapRequest> findByRequestedById(Long requestedById);
    
    List<ShiftSwapRequest> findByRequestedToId(Long requestedToId);
    
    List<ShiftSwapRequest> findByFromShiftId(Long fromShiftId);
}




