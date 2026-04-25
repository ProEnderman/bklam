package com.restaurant.repository;

import com.restaurant.model.Resource;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ResourceRepository extends JpaRepository<Resource, Long> {
    
    List<Resource> findByActivityId(Long activityId);
    
    List<Resource> findByBranchIdAndActivityId(Long branchId, Long activityId);
}




