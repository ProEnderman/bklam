package com.restaurant.repository.loyalty;

import com.restaurant.model.loyalty.BonusLedgerEntry;
import com.restaurant.model.loyalty.LedgerEntryType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface BonusLedgerEntryRepository extends JpaRepository<BonusLedgerEntry, Long> {

    @Query("SELECT e FROM BonusLedgerEntry e WHERE e.account.id = :accountId ORDER BY e.createdAt DESC")
    Page<BonusLedgerEntry> findByAccountIdOrderByCreatedAtDesc(@Param("accountId") Long accountId, Pageable pageable);

    @Query("SELECT e FROM BonusLedgerEntry e WHERE e.account.id = :accountId ORDER BY e.createdAt DESC")
    List<BonusLedgerEntry> findByAccountIdOrderByCreatedAtDesc(@Param("accountId") Long accountId);

    Optional<BonusLedgerEntry> findByIdempotencyKey(String idempotencyKey);

    boolean existsByIdempotencyKey(String idempotencyKey);

    @Query("SELECT COALESCE(SUM(CASE WHEN e.entryType = 'EARN' OR e.entryType = 'ADJUST' THEN e.amount ELSE 0 END), 0) - " +
           "COALESCE(SUM(CASE WHEN e.entryType = 'BURN' OR e.entryType = 'EXPIRE' THEN e.amount ELSE 0 END), 0) " +
           "FROM BonusLedgerEntry e WHERE e.account.id = :accountId")
    BigDecimal computeBalance(@Param("accountId") Long accountId);

    @Query("SELECT COALESCE(SUM(e.amount), 0) FROM BonusLedgerEntry e WHERE e.account.id = :accountId AND e.entryType = :type")
    BigDecimal sumByType(@Param("accountId") Long accountId, @Param("type") LedgerEntryType type);
}
