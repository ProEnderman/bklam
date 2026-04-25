package com.restaurant.service.loyalty;

import com.restaurant.dto.loyalty.CampaignDto;
import com.restaurant.dto.loyalty.CreateCampaignRequest;
import com.restaurant.exception.ResourceNotFoundException;
import com.restaurant.model.loyalty.Campaign;
import com.restaurant.model.loyalty.CampaignStatus;
import com.restaurant.model.loyalty.LoyaltyScope;
import com.restaurant.repository.RestaurantRepository;
import com.restaurant.repository.loyalty.CampaignRepository;
import com.restaurant.security.SecurityUtils;
import com.restaurant.service.ActivityLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class CampaignService {

    private final CampaignRepository campaignRepository;
    private final RestaurantRepository restaurantRepository;
    private final ActivityLogService activityLogService;
    private final ObjectMapper objectMapper;

    private Long getRestaurantId() {
        return SecurityUtils.getCurrentRestaurantId();
    }

    @Transactional(readOnly = true)
    public Page<CampaignDto> getCampaigns(Pageable pageable, String scopeRaw) {
        LoyaltyScope scope = parseScope(scopeRaw);
        List<Campaign> all = campaignRepository.findAllByRestaurantId(getRestaurantId());
        List<CampaignDto> filtered = all.stream()
            .filter(c -> extractScopeFromRules(c.getRules()) == scope)
            .map(CampaignDto::fromEntity)
            .toList();
        int start = (int) pageable.getOffset();
        int end = Math.min(start + pageable.getPageSize(), filtered.size());
        List<CampaignDto> pageContent = start < filtered.size() ? new ArrayList<>(filtered.subList(start, end)) : List.of();
        return new PageImpl<>(pageContent, pageable, filtered.size());
    }

    @Transactional(readOnly = true)
    public List<CampaignDto> getActiveCampaigns(String scopeRaw) {
        LoyaltyScope scope = parseScope(scopeRaw);
        return campaignRepository.findActiveCampaigns(getRestaurantId(), LocalDateTime.now())
            .stream()
            .filter(c -> extractScopeFromRules(c.getRules()) == scope)
            .map(CampaignDto::fromEntity)
            .toList();
    }

    @Transactional(readOnly = true)
    public CampaignDto getById(Long id) {
        Campaign c = campaignRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Campaign not found: " + id));
        return CampaignDto.fromEntity(c);
    }

    @Transactional
    public CampaignDto createCampaign(CreateCampaignRequest req) {
        Long rid = getRestaurantId();
        Campaign c = new Campaign();
        c.setRestaurant(restaurantRepository.findById(rid)
            .orElseThrow(() -> new ResourceNotFoundException("Restaurant not found")));
        c.setName(req.name());
        c.setCampaignType(req.campaignType());
        c.setRules(normalizeRulesWithScope(req.rules(), LoyaltyScope.RESTAURANT));
        c.setSchedule(req.schedule() != null ? req.schedule() : "{}");
        c.setPriority(req.priority() != null ? req.priority() : 0);
        c.setStatus(CampaignStatus.DRAFT);
        c.setValidFrom(req.validFrom());
        c.setValidTo(req.validTo());
        Campaign saved = campaignRepository.save(c);
        log.info("Created campaign id={}, type={}", saved.getId(), saved.getCampaignType());
        try {
            String user = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "CREATE",
                "CAMPAIGN",
                saved.getId(),
                user,
                "Создана акция: " + saved.getName(),
                null,
                Map.of(
                    "name", saved.getName(),
                    "type", saved.getCampaignType() != null ? saved.getCampaignType().name() : "",
                    "status", saved.getStatus() != null ? saved.getStatus().name() : "",
                    "priority", saved.getPriority(),
                    "validFrom", saved.getValidFrom() != null ? saved.getValidFrom().toString() : "",
                    "validTo", saved.getValidTo() != null ? saved.getValidTo().toString() : ""
                )
            );
        } catch (Exception e) {
            log.warn("Failed to log campaign create: {}", e.getMessage());
        }
        return CampaignDto.fromEntity(saved);
    }

    @Transactional
    public CampaignDto updateCampaign(Long id, CreateCampaignRequest req) {
        Campaign c = campaignRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Campaign not found: " + id));
        Map<String, Object> oldValues = Map.of(
            "name", c.getName(),
            "type", c.getCampaignType() != null ? c.getCampaignType().name() : "",
            "status", c.getStatus() != null ? c.getStatus().name() : "",
            "priority", c.getPriority(),
            "validFrom", c.getValidFrom() != null ? c.getValidFrom().toString() : "",
            "validTo", c.getValidTo() != null ? c.getValidTo().toString() : ""
        );
        if (req.name() != null) c.setName(req.name());
        if (req.campaignType() != null) c.setCampaignType(req.campaignType());
        if (req.rules() != null) {
            LoyaltyScope existingScope = extractScopeFromRules(c.getRules());
            c.setRules(normalizeRulesWithScope(req.rules(), existingScope));
        }
        if (req.schedule() != null) c.setSchedule(req.schedule());
        if (req.priority() != null) c.setPriority(req.priority());
        if (req.validFrom() != null) c.setValidFrom(req.validFrom());
        if (req.validTo() != null) c.setValidTo(req.validTo());
        Campaign saved = campaignRepository.save(c);
        try {
            String user = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "UPDATE",
                "CAMPAIGN",
                saved.getId(),
                user,
                "Обновлена акция: " + saved.getName(),
                oldValues,
                Map.of(
                    "name", saved.getName(),
                    "type", saved.getCampaignType() != null ? saved.getCampaignType().name() : "",
                    "status", saved.getStatus() != null ? saved.getStatus().name() : "",
                    "priority", saved.getPriority(),
                    "validFrom", saved.getValidFrom() != null ? saved.getValidFrom().toString() : "",
                    "validTo", saved.getValidTo() != null ? saved.getValidTo().toString() : ""
                )
            );
        } catch (Exception e) {
            log.warn("Failed to log campaign update: {}", e.getMessage());
        }
        return CampaignDto.fromEntity(saved);
    }

    @Transactional
    public CampaignDto changeStatus(Long id, CampaignStatus status) {
        Campaign c = campaignRepository.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Campaign not found: " + id));
        String old = c.getStatus() != null ? c.getStatus().name() : "";
        c.setStatus(status);
        Campaign saved = campaignRepository.save(c);
        log.info("Campaign {} status changed to {}", id, status);
        try {
            String user = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "CHANGE_STATUS",
                "CAMPAIGN",
                saved.getId(),
                user,
                "Смена статуса акции: " + saved.getName(),
                Map.of("status", old),
                Map.of("status", status != null ? status.name() : "")
            );
        } catch (Exception e) {
            log.warn("Failed to log campaign status change: {}", e.getMessage());
        }
        return CampaignDto.fromEntity(saved);
    }

    @Transactional
    public void deleteCampaign(Long id) {
        Campaign c = campaignRepository.findById(id).orElse(null);
        Map<String, Object> oldValues = c == null ? null : Map.of(
            "name", c.getName(),
            "type", c.getCampaignType() != null ? c.getCampaignType().name() : "",
            "status", c.getStatus() != null ? c.getStatus().name() : ""
        );
        campaignRepository.deleteById(id);
        try {
            String user = SecurityUtils.getCurrentUser() != null ? SecurityUtils.getCurrentUser().getUsername() : "system";
            activityLogService.logActivity(
                "DELETE",
                "CAMPAIGN",
                id,
                user,
                "Удалена акция: " + (c != null ? c.getName() : ("id=" + id)),
                oldValues,
                null
            );
        } catch (Exception e) {
            log.warn("Failed to log campaign delete: {}", e.getMessage());
        }
    }

    private LoyaltyScope parseScope(String scopeRaw) {
        if (scopeRaw == null || scopeRaw.isBlank()) return LoyaltyScope.RESTAURANT;
        try {
            return LoyaltyScope.valueOf(scopeRaw.trim().toUpperCase());
        } catch (Exception e) {
            return LoyaltyScope.RESTAURANT;
        }
    }

    private LoyaltyScope extractScopeFromRules(String rulesJson) {
        try {
            Map<String, Object> m = objectMapper.readValue(
                rulesJson != null ? rulesJson : "{}",
                new TypeReference<Map<String, Object>>() {}
            );
            Object raw = m.get("scope");
            if (raw == null) return LoyaltyScope.RESTAURANT;
            return parseScope(String.valueOf(raw));
        } catch (Exception e) {
            return LoyaltyScope.RESTAURANT;
        }
    }

    private String normalizeRulesWithScope(String rawRules, LoyaltyScope fallbackScope) {
        try {
            Map<String, Object> m = objectMapper.readValue(
                rawRules != null && !rawRules.isBlank() ? rawRules : "{}",
                new TypeReference<Map<String, Object>>() {}
            );
            if (!m.containsKey("scope") || m.get("scope") == null || String.valueOf(m.get("scope")).isBlank()) {
                m.put("scope", fallbackScope.name());
            } else {
                m.put("scope", parseScope(String.valueOf(m.get("scope"))).name());
            }
            return objectMapper.writeValueAsString(m);
        } catch (Exception e) {
            return "{\"scope\":\"" + fallbackScope.name() + "\"}";
        }
    }
}
