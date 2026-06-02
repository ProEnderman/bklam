package com.restaurant.repository;

import com.restaurant.model.Ingredient;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface IngredientRepository extends JpaRepository<Ingredient, Long> {
    
    Page<Ingredient> findByNameContainingIgnoreCase(String name, Pageable pageable);
    
    @Query("SELECT i FROM Ingredient i WHERE i.stockQty < i.minQty")
    List<Ingredient> findIngredientsBelowMinimum();
    
    @Query(value = "SELECT * FROM ingredients WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = CAST(:restaurantId AS BIGINT)) AND " +
           "(:searchLikePattern IS NULL OR " +
           "CAST(name_search_key AS TEXT) LIKE CAST(:searchLikePattern AS TEXT) ESCAPE '!') AND " +
           "((:belowMinStr IS NULL OR :belowMinStr = 'false') OR stock_qty < min_qty) " +
           "ORDER BY COALESCE(NULLIF(btrim(name_search_key), ''), lower(btrim(name))) ASC, id ASC",
           nativeQuery = true,
           countQuery = "SELECT COUNT(*) FROM ingredients WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = CAST(:restaurantId AS BIGINT)) AND " +
           "(:searchLikePattern IS NULL OR " +
           "CAST(name_search_key AS TEXT) LIKE CAST(:searchLikePattern AS TEXT) ESCAPE '!') AND " +
           "((:belowMinStr IS NULL OR :belowMinStr = 'false') OR stock_qty < min_qty)")
    Page<Ingredient> searchIngredients(
        @Param("restaurantId") Long restaurantId,
        @Param("searchLikePattern") String searchLikePattern,
        @Param("belowMinStr") String belowMinStr,
        Pageable pageable
    );
    
    @Query("SELECT i FROM Ingredient i WHERE " +
           "(:restaurantId IS NULL OR i.restaurant.id = :restaurantId) AND " +
           "i.stockQty IS NOT NULL AND i.minQty IS NOT NULL AND " +
           "i.stockQty < i.minQty")
    List<Ingredient> findIngredientsBelowMinimum(@Param("restaurantId") Long restaurantId);
    
    @Query(value = "SELECT CASE WHEN COUNT(*) > 0 THEN TRUE ELSE FALSE END FROM ingredients WHERE " +
           "(:restaurantId IS NULL OR restaurant_id = CAST(:restaurantId AS BIGINT)) AND " +
           "name_search_key = CAST(:normalizedKey AS TEXT)",
           nativeQuery = true)
    boolean existsByNameIgnoreCase(@Param("restaurantId") Long restaurantId, @Param("normalizedKey") String normalizedKey);

    @Query("SELECT i FROM Ingredient i WHERE i.restaurant.id = :restaurantId AND i.nameSearchKey = :normalizedKey")
    java.util.Optional<Ingredient> findByRestaurantIdAndNameSearchKey(
        @Param("restaurantId") Long restaurantId,
        @Param("normalizedKey") String normalizedKey
    );

    /**
     * Stock Excel: match by canonical {@code name_search_key} (same as {@link com.restaurant.util.UnicodeSubstringSearch#normalizeSearchKey})
     * or by case-insensitive trimmed {@code name} (covers NULL/out-of-sync keys and NFC vs DB quirks).
     */
    @Query(value = "SELECT * FROM ingredients WHERE restaurant_id = :restaurantId AND ("
            + "(name_search_key IS NOT NULL AND btrim(cast(name_search_key AS text)) <> '' AND name_search_key = cast(:nk AS text)) "
            + "OR lower(btrim(name)) = lower(btrim(cast(:rawName AS text))) "
            // Excel / Java use NFC; DB name may be NFD — plain lower(btrim) can still differ.
            + "OR lower(btrim(normalize(name, NFC))) = lower(btrim(normalize(cast(:rawName AS text), NFC))) "
            // «Тупое» совпадение визуального имени: схлопываем любые пробелы (Excel / копипаст).
            + "OR regexp_replace(lower(btrim(cast(name AS text))), '[[:space:]]+', ' ', 'g') = regexp_replace(lower(btrim(cast(:rawName AS text))), '[[:space:]]+', ' ', 'g')"
            + ")", nativeQuery = true)
    List<Ingredient> findForStockExcelExactNameMatch(
            @Param("restaurantId") Long restaurantId,
            @Param("nk") String nk,
            @Param("rawName") String rawName);
}

