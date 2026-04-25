package com.restaurant.controller;

import com.restaurant.exception.ApiErrorResponse;
import com.restaurant.model.Booking;
import com.restaurant.service.BookingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Tag(name = "Bookings", description = "Booking management")
@Slf4j
@RestController
@RequestMapping("/api/bookings")
@RequiredArgsConstructor
public class BookingController {
    
    private final BookingService bookingService;
    
    @Operation(summary = "Get bookings with pagination (always paginated, default size 100, max 500). Use 'status' multiple times. sort=startAt,desc for newest first.")
    @GetMapping
    public ResponseEntity<Map<String, Object>> getBookings(
        @RequestParam(required = false) Long branchId,
        @RequestParam(required = false) Long activityId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to,
        @RequestParam(required = false) List<Booking.BookingStatus> status,
        @RequestParam(required = false, defaultValue = "0") int page,
        @RequestParam(required = false, defaultValue = "100") int size,
        @RequestParam(required = false, defaultValue = "startAt,asc") String sort,
        @RequestParam(required = false) String customerSearch
    ) {
        int safePage = Math.max(0, page);
        int safeSize = Math.min(500, Math.max(1, size));
        Sort sortOrder;
        if ("createdAt,desc".equalsIgnoreCase(sort)) {
            sortOrder = Sort.by(Sort.Direction.DESC, "createdAt");
        } else if ("startAt,desc".equalsIgnoreCase(sort)) {
            sortOrder = Sort.by(Sort.Direction.DESC, "startAt");
        } else if ("startAt,asc".equalsIgnoreCase(sort)) {
            sortOrder = Sort.by(Sort.Direction.ASC, "startAt");
        } else {
            sortOrder = Sort.by(Sort.Direction.ASC, "startAt");
        }
        Pageable pageable = PageRequest.of(safePage, safeSize, sortOrder);
        var bookingPage = (status != null && !status.isEmpty())
            ? (customerSearch != null && !customerSearch.isBlank()
                ? bookingService.getBookingsPageByStatusInWithCustomerSearch(branchId, activityId, from, to, status, customerSearch, pageable)
                : bookingService.getBookingsPageByStatusIn(branchId, activityId, from, to, status, pageable))
            : bookingService.getBookingsPage(branchId, activityId, from, to, null, pageable);
        Map<String, Object> body = new HashMap<>();
        body.put("content", bookingPage.getContent());
        body.put("totalElements", bookingPage.getTotalElements());
        body.put("totalPages", bookingPage.getTotalPages());
        body.put("number", bookingPage.getNumber());
        body.put("size", bookingPage.getSize());
        return ResponseEntity.ok(body);
    }
    
    @Operation(summary = "Интервалы полных броней филиала (блокируют все мероприятия) за период")
    @GetMapping("/full-venue-blocks")
    public ResponseEntity<List<Map<String, Object>>> getFullVenueBlocks(
        @RequestParam(required = false) Long branchId,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to
    ) {
        return ResponseEntity.ok(bookingService.getFullVenueBlocks(branchId, from, to));
    }

    @Operation(summary = "Get booking by ID")
    @GetMapping("/{id}")
    public ResponseEntity<Booking> getBooking(@PathVariable Long id) {
        Booking booking = bookingService.getBookingById(id);
        return ResponseEntity.ok(booking);
    }
    
    @Operation(summary = "Create booking")
    @PostMapping
    public ResponseEntity<Booking> createBooking(@Valid @RequestBody Booking booking) {
        Booking created = bookingService.createBooking(booking);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
    
    @Operation(summary = "Update booking")
    @PutMapping("/{id}")
    public ResponseEntity<Booking> updateBooking(@PathVariable Long id, @Valid @RequestBody Booking booking) {
        Booking updated = bookingService.updateBooking(id, booking);
        return ResponseEntity.ok(updated);
    }
    
    @Operation(summary = "Cancel booking")
    @PostMapping("/{id}/cancel")
    public ResponseEntity<Booking> cancelBooking(@PathVariable Long id) {
        Booking cancelled = bookingService.cancelBooking(id);
        return ResponseEntity.ok(cancelled);
    }
    
    @Operation(summary = "Cancel multiple bookings (e.g. delete entire order without cancelling one by one)")
    @PostMapping("/cancel-bulk")
    public ResponseEntity<Map<String, Object>> cancelBookingsBulk(@RequestBody Map<String, List<Long>> body) {
        List<Long> ids = body != null ? body.get("bookingIds") : null;
        if (ids == null) ids = body != null ? body.get("ids") : null;
        if (ids == null) ids = List.of();
        List<Booking> cancelled = bookingService.cancelBookings(ids);
        return ResponseEntity.ok(Map.of("cancelled", cancelled.size(), "bookings", cancelled));
    }
    
    @Operation(summary = "Mark booking as paid")
    @PostMapping("/{id}/mark-paid")
    public ResponseEntity<Booking> markAsPaid(@PathVariable Long id) {
        Booking paid = bookingService.markAsPaid(id);
        return ResponseEntity.ok(paid);
    }

    @Operation(summary = "Export bookings to CSV (filter by branch and date range)")
    @GetMapping(value = "/export", produces = "text/csv; charset=UTF-8")
    public ResponseEntity<byte[]> exportBookings(
        @RequestParam(required = false) Long branchId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to
    ) {
        byte[] csv = bookingService.exportBookingsToCsv(branchId, from, to);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDispositionFormData("attachment", "bookings_export.csv");
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        return ResponseEntity.ok().headers(headers).body(csv);
    }

    @Operation(summary = "Import bookings from CSV (branch_id,activity_id,start_at,end_at,status,customer_name,customer_phone,total_amount,notes,created_by)")
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importBookings(
        @RequestParam("file") MultipartFile file,
        @RequestParam(required = false) Long branchId
    ) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, "FILE_REQUIRED", "Выберите CSV файл"));
        }
        try {
            Map<String, Object> result = bookingService.importBookingsFromCsv(file.getBytes(), branchId);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Booking CSV import failed", e);
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, "IMPORT_FAILED",
                            "Не удалось импортировать файл."));
        }
    }
}




