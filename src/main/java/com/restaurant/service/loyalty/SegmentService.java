package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.CreateSegmentRequest;
import com.restaurant.dto.loyalty.SegmentDto;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.Segment;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.loyalty.SegmentRepository;
import com.restaurant.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class SegmentService {

    private final SegmentRepository segmentRepository;
    private final RestaurantRepository restaurantRepository;

    private Long getRestaurantId() {
        return SecurityUtils.getCurrentRestaurantId();
    }

    @Transactional(readOnly = true)
    public List<SegmentDto> getSegments() {
        return segmentRepository.findByRestaurantId(getRestaurantId())
            .stream().map(SegmentDto::fromEntity).toList();
    }

    @Transactional
    public SegmentDto createSegment(CreateSegmentRequest req) {
        Long rid = getRestaurantId();
        Segment s = new Segment();
        s.setRestaurant(restaurantRepository.findById(rid)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        s.setName(req.name());
        s.setDefinition(req.definition() != null ? req.definition() : "{}");
        Segment saved = segmentRepository.save(s);
        log.info("Created segment id={}, name={}", saved.getId(), saved.getName());
        return SegmentDto.fromEntity(saved);
    }

    @Transactional
    public SegmentDto updateSegment(Long id, CreateSegmentRequest req) {
        Segment s = segmentRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Segment not found: " + id));
        if (req.name() != null) s.setName(req.name());
        if (req.definition() != null) s.setDefinition(req.definition());
        Segment saved = segmentRepository.save(s);
        return SegmentDto.fromEntity(saved);
    }

    @Transactional
    public void deleteSegment(Long id) {
        segmentRepository.deleteById(id);
    }
}
