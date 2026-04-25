package com.restaurant.controller;

import com.restaurant.dto.AddOrderItemRequest;
import com.restaurant.dto.CreateOrderRequest;
import com.restaurant.dto.OrderDto;
import com.restaurant.dto.PaymentAccountPayerRequest;
import com.restaurant.dto.UpdateOrderItemRequest;
import com.restaurant.dto.UpdateOrderRequest;
import com.restaurant.exception.ApiErrorResponse;
import com.restaurant.model.OrderStatus;
import com.restaurant.service.OrderService;
import com.restaurant.web.PaginationConstraints;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

@Tag(name = "Orders", description = "Order management and sales")
@Slf4j
@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {
    
    private final OrderService orderService;
    
    @Operation(summary = "Get all orders with filters")
    @GetMapping
    public ResponseEntity<Page<OrderDto>> getOrders(
        @RequestParam(required = false) OrderStatus status,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDateTime, // для обратной совместимости с полной датой и временем
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDateTime, // для обратной совместимости с полной датой и временем
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fromDate, // для обратной совместимости
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime toDate, // для обратной совместимости
        @RequestParam(required = false) Long dishId,
        @RequestParam(required = false) Long restaurantId,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "100") int size
    ) {
        // Сортировка задана в запросе репозитория: CASE (группы) ASC, createdAt DESC, id DESC
        Pageable pageable = PaginationConstraints.pageable(page, size);
        
        // Преобразуем LocalDate в LocalDateTime (начало дня для from, конец дня для to)
        LocalDateTime fromParam = null;
        if (from != null) {
            fromParam = from.atStartOfDay();
        } else if (fromDateTime != null) {
            fromParam = fromDateTime;
        } else if (fromDate != null) {
            fromParam = fromDate;
        }
        
        LocalDateTime toParam = null;
        if (to != null) {
            // Используем конец дня с максимальной точностью (23:59:59.999999999)
            toParam = to.atTime(23, 59, 59, 999_999_999);
        } else if (toDateTime != null) {
            toParam = toDateTime;
        } else if (toDate != null) {
            toParam = toDate;
        }
        
        Page<OrderDto> orders = orderService.getOrders(status, fromParam, toParam, dishId, pageable);
        return ResponseEntity.ok(orders);
    }
    
    @Operation(summary = "Get order by ID")
    @GetMapping("/{id}")
    public ResponseEntity<OrderDto> getOrderById(@PathVariable Long id) {
        OrderDto order = orderService.getOrderById(id);
        return ResponseEntity.ok(order);
    }
    
    @Operation(summary = "Create new order (supports X-Idempotency-Key header)")
    @PostMapping
    public ResponseEntity<OrderDto> createOrder(
        @RequestBody(required = false) CreateOrderRequest request,
        @RequestHeader(value = "X-Idempotency-Key", required = false) String idempotencyHeader
    ) {
        String name = request != null ? request.name() : null;
        Long tableId = request != null ? request.tableId() : null;
        Long guestId = request != null ? request.guestId() : null;
        String idempotencyKey = idempotencyHeader != null ? idempotencyHeader
            : (request != null ? request.idempotencyKey() : null);
        String orderSource = request != null ? request.orderSource() : null;
        OrderDto order = orderService.createOrder(name, tableId, guestId, idempotencyKey, orderSource);
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }

    @Operation(summary = "Update order (name, table, guest)")
    @PatchMapping("/{id}")
    public ResponseEntity<OrderDto> updateOrder(
        @PathVariable Long id,
        @RequestBody @Valid UpdateOrderRequest request
    ) {
        OrderDto order = orderService.updateOrder(id, request);
        return ResponseEntity.ok(order);
    }

    @Operation(summary = "Get open order by tableId (or null)")
    @GetMapping("/open-by-table/{tableId}")
    public ResponseEntity<OrderDto> getOpenOrderByTable(@PathVariable Long tableId) {
        return ResponseEntity.ok(orderService.getOpenOrderByTable(tableId));
    }

    @Operation(summary = "Get or create open order by tableId")
    @PostMapping("/by-table/{tableId}")
    public ResponseEntity<OrderDto> getOrCreateOrderByTable(@PathVariable Long tableId) {
        return ResponseEntity.ok(orderService.getOrCreateOpenOrderByTable(tableId));
    }
    
    @Operation(summary = "Add item to order")
    @PostMapping("/{id}/items")
    public ResponseEntity<OrderDto> addItemToOrder(
        @PathVariable Long id,
        @Valid @RequestBody AddOrderItemRequest request
    ) {
        OrderDto order = orderService.addItemToOrder(id, request);
        return ResponseEntity.ok(order);
    }
    
    @Operation(summary = "Update order item quantity")
    @PutMapping("/{id}/items/{itemId}")
    public ResponseEntity<OrderDto> updateOrderItem(
        @PathVariable Long id,
        @PathVariable Long itemId,
        @Valid @RequestBody UpdateOrderItemRequest request
    ) {
        OrderDto order = orderService.updateOrderItem(id, itemId, request.qty(), request.comment());
        return ResponseEntity.ok(order);
    }
    
    @Operation(summary = "Remove item from order")
    @DeleteMapping("/{id}/items/{itemId}")
    public ResponseEntity<OrderDto> removeOrderItem(
        @PathVariable Long id,
        @PathVariable Long itemId
    ) {
        OrderDto order = orderService.removeOrderItem(id, itemId);
        return ResponseEntity.ok(order);
    }
    
    @Operation(summary = "Close order (process sale and deduct stock)")
    @PostMapping("/{id}/close")
    public ResponseEntity<OrderDto> closeOrder(@PathVariable Long id) {
        OrderDto order = orderService.closeOrder(id);
        return ResponseEntity.ok(order);
    }
    
    @Operation(summary = "Cancel order")
    @PostMapping("/{id}/cancel")
    public ResponseEntity<OrderDto> cancelOrder(@PathVariable Long id) {
        OrderDto order = orderService.cancelOrder(id);
        return ResponseEntity.ok(order);
    }
    
    @Operation(summary = "Mark order as paid")
    @PostMapping("/{id}/mark-paid")
    public ResponseEntity<OrderDto> markOrderPaid(@PathVariable Long id) {
        OrderDto order = orderService.markOrderPaid(id);
        return ResponseEntity.ok(order);
    }

    @Operation(summary = "Mark order as unpaid")
    @PostMapping("/{id}/mark-unpaid")
    public ResponseEntity<OrderDto> markOrderUnpaid(
        @PathVariable Long id,
        @RequestBody(required = false) java.util.Map<String, String> body
    ) {
        String reason = body != null ? body.get("reason") : null;
        OrderDto order = orderService.markOrderUnpaid(id, reason);
        return ResponseEntity.ok(order);
    }

    @Operation(summary = "Get payment slot marks (paid/unpaid and paidVia: ONLINE | CASH per QR)")
    @GetMapping("/{id}/payment-marks")
    public ResponseEntity<java.util.Map<String, java.util.Map<String, Object>>> getPaymentMarks(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.getPaymentMarks(id));
    }

    @Operation(summary = "Mark a payment slot as paid or unpaid; paidVia: ONLINE (default) or CASH when marking paid")
    @PostMapping("/{id}/payment-marks")
    public ResponseEntity<Void> setPaymentMark(
        @PathVariable Long id,
        @RequestBody java.util.Map<String, Object> body
    ) {
        String paymentRequestId = (String) body.get("paymentRequestId");
        Boolean markedPaid = body.get("markedPaid") instanceof Boolean ? (Boolean) body.get("markedPaid") : Boolean.parseBoolean(String.valueOf(body.get("markedPaid")));
        String paidVia = body.get("paidVia") != null ? String.valueOf(body.get("paidVia")).trim().toUpperCase() : "ONLINE";
        if (!"CASH".equals(paidVia)) paidVia = "ONLINE";
        if (paymentRequestId == null || paymentRequestId.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        Object tgRaw = body.get("telegramPaymentRequestId");
        String telegramPaymentRequestId = tgRaw != null ? String.valueOf(tgRaw).trim() : null;
        if (telegramPaymentRequestId != null && telegramPaymentRequestId.isEmpty()) {
            telegramPaymentRequestId = null;
        }
        orderService.setPaymentMark(id, paymentRequestId, Boolean.TRUE.equals(markedPaid), paidVia, telegramPaymentRequestId);
        return ResponseEntity.ok().build();
    }

    @Operation(summary = "Save custom split payment layout (who pays which share)")
    @PatchMapping("/{id}/payment-account-payer")
    public ResponseEntity<OrderDto> updatePaymentAccountPayer(
        @PathVariable Long id,
        @RequestBody PaymentAccountPayerRequest request
    ) {
        return ResponseEntity.ok(orderService.updatePaymentAccountPayer(id, request.accountPayer()));
    }

    @Operation(summary = "Delete order")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteOrder(@PathVariable Long id) {
        orderService.deleteOrder(id);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Export orders to CSV (current restaurant, filter by date)")
    @GetMapping(value = "/export", produces = "text/csv; charset=UTF-8")
    public ResponseEntity<byte[]> exportOrders(
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        byte[] csv = orderService.exportOrdersToCsv(from, to);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDispositionFormData("attachment", "orders_export.csv");
        headers.setContentType(MediaType.parseMediaType("text/csv; charset=UTF-8"));
        return ResponseEntity.ok().headers(headers).body(csv);
    }

    @Operation(summary = "Import orders from CSV (created_at,closed_at,status,total_amount,name,created_by,dish_id,dish_name,qty,price_at_time; group by created_at+name)")
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importOrders(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, "FILE_REQUIRED", "Выберите CSV файл"));
        }
        try {
            Map<String, Object> result = orderService.importOrdersFromCsv(file.getBytes());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            log.warn("Order CSV import failed", e);
            return ResponseEntity.badRequest()
                    .body(ApiErrorResponse.of(null, HttpStatus.BAD_REQUEST, "IMPORT_FAILED",
                            "Не удалось импортировать файл."));
        }
    }
}

