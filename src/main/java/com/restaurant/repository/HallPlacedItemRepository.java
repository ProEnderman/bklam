package com.restaurant.repository;

import com.restaurant.model.HallPlacedItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface HallPlacedItemRepository extends JpaRepository<HallPlacedItem, Long> {
    @Query("SELECT i FROM HallPlacedItem i WHERE i.hallMap.id = :hallMapId ORDER BY i.layer ASC, i.id ASC")
    List<HallPlacedItem> findByHallMapIdOrderByLayerAscIdAsc(@Param("hallMapId") Long hallMapId);

    @Query("SELECT i FROM HallPlacedItem i LEFT JOIN FETCH i.asset LEFT JOIN FETCH i.table WHERE i.hallMap.id = :hallMapId ORDER BY i.layer ASC, i.id ASC")
    List<HallPlacedItem> findViewByHallMapId(@Param("hallMapId") Long hallMapId);

    @Modifying
    @Query("DELETE FROM HallPlacedItem i WHERE i.hallMap.id = :hallMapId")
    void deleteByHallMapId(@Param("hallMapId") Long hallMapId);

    @Modifying
    @Query("DELETE FROM HallPlacedItem i WHERE i.id IN :ids")
    void deleteByIds(@Param("ids") List<Long> ids);

    @Query("SELECT i FROM HallPlacedItem i WHERE i.id IN :ids")
    List<HallPlacedItem> findByIds(@Param("ids") List<Long> ids);

    /** По id столов — расстановки с загруженной картой и столом (для зоны/названия зала в заказах). */
    @Query("SELECT i FROM HallPlacedItem i JOIN FETCH i.hallMap JOIN FETCH i.table t WHERE t.id IN :tableIds")
    List<HallPlacedItem> findByTableIdInWithHallMap(@Param("tableIds") List<Long> tableIds);
}


